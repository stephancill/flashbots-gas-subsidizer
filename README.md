# Flashbots Gas Subsidizer (WIP)

Subsidizes the gas fees of a transaction by creating a flashbots bundle with 2 transactions:

1. A transaction from a subsidizer account to the sender of the target transaction with value equal to the gas price of the target transaction
2. The target transaction

## Development

The `main.ts` script currently subsidizes a transaction from a randomly created wallet that sets the Greeter message on the Goerli testnet at [`0xfCf1f3aA368249f662bb9B47a0383f6Eb05E05eB`](https://goerli.etherscan.io/address/0xfCf1f3aA368249f662bb9B47a0383f6Eb05E05eB).

1. Install dependencies

```bash
yarn install
```

2. Create a `.env` file from the `.env.example` file and fill in the required values. Ensure that the address associated with `SUBSIDIZER_PRIVATE_KEY` has enough ETH to pay for the gas of the subsidizer transaction. Get some Goerli ETH from the [Paradigm faucet](https://faucet.paradigm.xyz/).

```bash
cp .env.example .env
```

3. Generate types

```bash
yarn types
```

4. Run the main script

```bash
yarn ts-node src/main.ts
```
