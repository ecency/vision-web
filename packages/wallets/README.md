# @ecency/wallets

Utilities for managing Hive blockchain wallets and external cryptocurrency wallets within the Ecency ecosystem.

Built and maintained by [Ecency](https://ecency.com), an open-source social platform on the Hive blockchain.

## Features

- Create wallets from BIP39 seed phrases
- `signDigest` – create a signature for an arbitrary digest
- `signTx` – sign a transaction with an optional custom chain ID
- `signTxAndBroadcast` – sign a transaction and immediately broadcast it
- `signExternalTx` – sign transactions for external chains like BTC or ETH
- `signExternalTxAndBroadcast` – sign and broadcast transactions on external networks
- `buildExternalTx` – construct transactions or PSBTs for external chains
- `encryptMemoWithKeys` / `decryptMemoWithKeys` – encrypt or decrypt memos using explicit keys
- `encryptMemoWithAccounts` / `decryptMemoWithAccounts` – encrypt or decrypt memos by looking up account memo keys
- `useGetExternalWalletBalanceQuery` – retrieve balances for external wallets such as BTC, ETH, BNB, SOL, TRON, TON, or APT through Ecency's private API

Blockchain mutations live in `@ecency/sdk`. `useWalletOperation` is re-exported from this package for compatibility but is the SDK's implementation.

## Installation

```sh
yarn add @ecency/wallets
# or
npm install @ecency/wallets
```

## Usage

```ts
import {
  signDigest,
  signTx,
  signTxAndBroadcast,
  signExternalTx,
  signExternalTxAndBroadcast,
  buildExternalTx,
  buildPsbt,
  encryptMemoWithKeys,
  encryptMemoWithAccounts,
  decryptMemoWithKeys,
  decryptMemoWithAccounts,
  EcencyWalletCurrency,
  useGetExternalWalletBalanceQuery,
} from '@ecency/wallets';
import { Client } from '@hiveio/dhive';

const client = new Client('https://api.hive.blog');

const signature = signDigest('deadbeef', privateWif);
const signedTx = signTx(tx, privateWif, customChainId);
await signTxAndBroadcast(client, tx, privateWif);
const btcBuildParams = { /* inputs, outputs, etc. */ };
const btcPsbt = buildExternalTx(EcencyWalletCurrency.BTC, btcBuildParams);
await signExternalTx(EcencyWalletCurrency.ETH, ethSignParams);
await signExternalTxAndBroadcast(EcencyWalletCurrency.BTC, btcSignParams);

const encrypted = await encryptMemoWithAccounts(client, privateWif, 'alice', '#hello');
const memo = decryptMemoWithKeys(privateWif, encrypted);

// query an external wallet balance (e.g., BTC)
const { data: btcBalance } = useGetExternalWalletBalanceQuery(
  EcencyWalletCurrency.BTC,
  '1BitcoinAddress...'
);

if (btcBalance) {
  // balances are returned in base units (satoshis for BTC, wei for ETH, etc.)
  console.log(btcBalance.balanceString, btcBalance.unit);
}
```
