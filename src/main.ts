import { BigNumber, ethers, providers, Transaction, Wallet } from "ethers"
import { TransactionRequest } from "@ethersproject/abstract-provider"
import { FlashbotsBundleProvider } from "@flashbots/ethers-provider-bundle"
import dotenv from "dotenv"
import { address as GREETER_ADDRESS } from "./utils/abi/Greeter.json"
import { Greeter__factory } from "./utils/types"
dotenv.config()

const { RPC_URL, ID_PRIVATE_KEY, SUBSIDIZER_PRIVATE_KEY, FLASHBOTS_RELAY } = process.env

async function subsidizeTransactionGas(serializedTransaction: string, provider: providers.JsonRpcProvider) {
  const authSigner = new Wallet(ID_PRIVATE_KEY!)
  const subsidizerWallet = new Wallet(SUBSIDIZER_PRIVATE_KEY!)

  const flashbotsProvider = await FlashbotsBundleProvider.create(
    provider, // a normal ethers.js provider, to perform gas estimiations and nonce lookups
    authSigner, // ethers.js signer wallet, only for signing request payloads, not transactions
    FLASHBOTS_RELAY!, // the flashbots relay endpoint
  )

  const transaction = ethers.utils.parseTransaction(serializedTransaction)

  console.log(transaction)

  // Get estimate for gas cost
  const gasPrice = await provider.getGasPrice()
  const gasLimit = transaction.gasLimit
  const gasCost = gasPrice.mul(gasLimit)

  console.log("Gas cost:", ethers.utils.formatEther(gasCost), "ETH")

  // Get balance of subsidizer
  const balance = await provider.getBalance(subsidizerWallet.address)

  // Check if balance is enough to pay for gas
  if (balance.lt(gasCost)) {
    throw new Error("Subsidizer balance is too low")
  }

  // Create a transaction to subsidize the transaction
  const PRIORITY_FEE = ethers.utils.parseUnits("3", "gwei")
  const BLOCKS_IN_THE_FUTURE = 2

  const block = await provider.getBlock("latest")
  if (!block.baseFeePerGas) {
    return
  }

  const maxBaseFeeInFutureBlock = FlashbotsBundleProvider.getMaxBaseFeeInFutureBlock(
    block.baseFeePerGas,
    BLOCKS_IN_THE_FUTURE,
  )

  const subsidizeTransaction: TransactionRequest = {
    from: subsidizerWallet.address,
    to: transaction.from,
    value: gasCost,
    gasPrice: gasPrice,
    // maxFeePerGas: PRIORITY_FEE.add(maxBaseFeeInFutureBlock),
    // maxPriorityFeePerGas: PRIORITY_FEE,
    nonce: await provider.getTransactionCount(subsidizerWallet.address),
    gasLimit: BigNumber.from("21000"),
  }

  console.log(subsidizeTransaction)

  // Create and send bundle
  const signedBundle = await flashbotsProvider.signBundle([
    { signer: subsidizerWallet, transaction: subsidizeTransaction },
    { signedTransaction: serializedTransaction },
  ])

  const targetBlockNumber = block.number + BLOCKS_IN_THE_FUTURE

  console.log(new Date())
  const simulation = await flashbotsProvider.simulate(signedBundle, targetBlockNumber)
  console.log(new Date())
  // Using TypeScript discrimination
  if ("error" in simulation) {
    throw new Error(`Simulation Error: ${simulation.error.message}`)
  } else {
    console.log(`Simulation Success: ${block.number} ${JSON.stringify(simulation, null, 2)}`)
  }

  // TODO: Bundle is not being mined
  const bundleReceipt = await flashbotsProvider.sendRawBundle(signedBundle, targetBlockNumber)
  return bundleReceipt
}

async function main() {
  const provider = new providers.JsonRpcProvider({ url: RPC_URL! })
  const wallet = new Wallet(ID_PRIVATE_KEY!, provider)
  const greeter = Greeter__factory.connect(GREETER_ADDRESS, wallet)

  const input = `Hello from ${wallet.address}`
  const gasLimit = greeter.estimateGas.setGreeting(input)
  const gasPrice = await provider.getGasPrice()

  const tx = await greeter.populateTransaction.setGreeting(input, {
    gasPrice: gasPrice,
    gasLimit: gasLimit,
  })

  const serializedTx = await wallet.signTransaction(tx)
  console.log("Serialized transaction")
  const bundleReceipt = await subsidizeTransactionGas(serializedTx, provider)
  console.log(bundleReceipt)
}

main().then(() => console.log("done"))
