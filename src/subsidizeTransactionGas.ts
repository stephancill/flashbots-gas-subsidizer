import { TransactionRequest } from "@ethersproject/abstract-provider"
import { FlashbotsBundleProvider, FlashbotsTransactionResponse } from "@flashbots/ethers-provider-bundle"
import { BigNumber, ethers, providers, Wallet } from "ethers"
import dotenv from "dotenv"
dotenv.config()

interface ISubsidizeTransactionGasOptions {
  blockTimeout: number // How many blocks to wait for the bundle to be included
  ID_PRIVATE_KEY?: string // Private key to use for Flashbots searcher ID
  SUBSIDIZER_PRIVATE_KEY?: string // Private key to use for account that subsidizes gas
  FLASHBOTS_RELAY?: string // Flashbots relay URL
}

export async function subsidizeTransactionGas(
  serializedTransaction: string,
  provider: providers.JsonRpcProvider,
  { blockTimeout = 10, ID_PRIVATE_KEY, SUBSIDIZER_PRIVATE_KEY, FLASHBOTS_RELAY }: ISubsidizeTransactionGasOptions,
): Promise<FlashbotsTransactionResponse> {
  const authSigner = new Wallet(ID_PRIVATE_KEY || process.env.ID_PRIVATE_KEY!)
  const subsidizerWallet = new Wallet(SUBSIDIZER_PRIVATE_KEY || process.env.SUBSIDIZER_PRIVATE_KEY!)

  const flashbotsProvider = await FlashbotsBundleProvider.create(
    provider, // a normal ethers.js provider, to perform gas estimiations and nonce lookups
    authSigner, // ethers.js signer wallet, only for signing request payloads, not transactions
    FLASHBOTS_RELAY || process.env.FLASHBOTS_RELAY!, // the flashbots relay endpoint
  )

  const transaction = ethers.utils.parseTransaction(serializedTransaction)

  console.log(transaction)

  // Get estimate for gas cost
  const gasPrice = transaction.gasPrice!
  const gasLimit = transaction.gasLimit
  const gasCost = gasPrice.mul(gasLimit)

  console.log("Gas cost:", ethers.utils.formatEther(gasCost), "ETH")

  // Get balance of subsidizer
  const balance = await provider.getBalance(subsidizerWallet.address)

  // Check if balance is enough to pay for gas
  if (balance.lt(gasCost)) {
    throw new Error("Subsidizer balance is too low")
  }

  const subsidizeTransaction: TransactionRequest = {
    from: subsidizerWallet.address,
    to: transaction.from,
    value: gasCost,
    gasPrice: gasPrice,
    nonce: await provider.getTransactionCount(subsidizerWallet.address),
    gasLimit: BigNumber.from("21000"),
  }

  console.log(subsidizeTransaction)

  // Create and send bundle
  const signedBundle = await flashbotsProvider.signBundle([
    { signer: subsidizerWallet, transaction: subsidizeTransaction },
    { signedTransaction: serializedTransaction },
  ])

  // Create a transaction to subsidize the transaction
  const block = await provider.getBlock("latest")

  // Simulate transaction
  const simulation = await flashbotsProvider.simulate(signedBundle, block.number + 1)
  if ("error" in simulation) {
    throw new Error(`Simulation Error: ${simulation.error.message}`)
  } else {
    console.log(`Simulation Success: ${block.number} ${JSON.stringify(simulation, null, 2)}`)
  }

  // Submit bundles every block until the bundle is included
  return new Promise((resolve, reject) => {
    let count = 0

    const listener: ethers.providers.Listener = async (blockNumber: number) => {
      console.log("New block", blockNumber)

      // TODO: Check if gas needs to be adjusted
      if (count < blockTimeout) {
        console.log("Submitting bundle")
        const targetBlockNumber = blockNumber + 2
        flashbotsProvider.sendRawBundle(signedBundle, targetBlockNumber).then((transaction) => {
          const bundle = transaction as FlashbotsTransactionResponse
          bundle.wait().then((resolution) => {
            console.log(`Bundle for block #${blockNumber} resolved: ${resolution === 1 && "Not included"}`)
            if (resolution === 0) {
              provider.off("block", listener)
              resolve(bundle)
              return
            }
          })
        })

        console.log(`Submitted bundle for block #${targetBlockNumber} retry #${count}`)
        count += 1
      } else {
        provider.off("block", listener)
        reject("Bundle timed out")
        return
      }
    }

    provider.on("block", listener)
  })
}
