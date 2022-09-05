import { providers, Wallet } from "ethers"
import { address as GREETER_ADDRESS } from "./utils/abi/Greeter.json"
import { Greeter__factory } from "./utils/types"
import { subsidizeTransactionGas } from "./subsidizeTransactionGas"
import dotenv from "dotenv"
dotenv.config()

const { RPC_URL } = process.env

async function main() {
  const provider = new providers.JsonRpcProvider({ url: RPC_URL! })

  // Create random wallet with no funds
  const wallet = Wallet.createRandom().connect(provider)

  // Test contract interface
  const greeter = Greeter__factory.connect(GREETER_ADDRESS, wallet)

  // Generate sample transaction
  const input = `Hello from ${wallet.address}`
  const gasLimit = greeter.estimateGas.setGreeting(input)
  const gasPrice = await provider.getGasPrice()
  const tx = await greeter.populateTransaction.setGreeting(input, {
    gasPrice: gasPrice.mul(2), // TODO: More intelligent strategy for determining gas price
    gasLimit: gasLimit,
  })

  // Serialize signed transaction
  const serializedTx = await wallet.signTransaction(tx)
  console.log("Serialized transaction")

  // Subsidize transaction via Flashbots
  const bundleReceipt = await subsidizeTransactionGas(serializedTx, provider, { blockTimeout: 1000 })
  if (bundleReceipt) {
    console.log(
      "Bundle included. Transaction hashes:",
      bundleReceipt!.bundleTransactions.map((tx) => tx.hash),
    )
  } else {
    console.log("Bundle not included")
  }
}

main().then(() => console.log("done"))
