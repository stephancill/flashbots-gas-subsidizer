import { providers, Wallet } from "ethers"
import { address as GREETER_ADDRESS } from "../src/utils/abi/Greeter.json"
import { Greeter__factory } from "../src/utils/types"
import { subsidizeTransactionGas } from "../src/subsidizeTransactionGas"
import { MockProvider } from "ethereum-waffle"

describe("Subsidize Transaction Gas", () => {
  it("should subsidize transaction gas", async () => {
    jest.mock("@flashbots/ethers-provider-bundle", () => {
      return {
        FlashbotsBundleProvider: {
          create: jest.fn(),
          simulate: jest.fn().mockImplementation(() => ({})),
          signBundle: jest.fn(),
          sendRawBundle: jest.fn(),
        },
      }
    })

    const provider = new MockProvider()
    const [subsidizerSigner] = provider.getWallets()

    const wallet = Wallet.createRandom().connect(provider)
    const idWallet = Wallet.createRandom()

    const greeter = Greeter__factory.connect(GREETER_ADDRESS, wallet)

    const input = `Hello from ${wallet.address}`
    const gasLimit = greeter.estimateGas.setGreeting(input)
    const gasPrice = await provider.getGasPrice()

    const tx = await greeter.populateTransaction.setGreeting(input, {
      gasPrice: gasPrice.mul(2), // TODO: More intelligent strategy for determining gas price
      gasLimit: gasLimit,
    })

    const serializedTx = await wallet.signTransaction(tx)
    console.log("Serialized transaction")
    const bundleReceipt = await subsidizeTransactionGas(serializedTx, provider, {
      blockTimeout: 1000,
      FLASHBOTS_RELAY: "http://dummy.relay/",
      ID_PRIVATE_KEY: idWallet.privateKey,
      SUBSIDIZER_PRIVATE_KEY: subsidizerSigner.privateKey,
    })
    // if (bundleReceipt) {
    //   console.log(
    //     "Bundle included. Hashes:",
    //     bundleReceipt!.bundleTransactions.map((tx) => tx.hash),
    //   )
    // } else {
    //   console.log("Bundle not included")
    // }
  })
})
