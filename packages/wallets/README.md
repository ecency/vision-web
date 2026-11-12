# @ecency/wallets (deprecated)

This package moved into the SDK. Import from `@ecency/sdk/wallets` instead:

```diff
- import { deriveHiveKeys, EcencyWalletCurrency } from "@ecency/wallets";
+ import { deriveHiveKeys, EcencyWalletCurrency } from "@ecency/sdk/wallets";
```

The API is unchanged. This last release only re-exports `@ecency/sdk/wallets`,
so existing installs keep working while you switch. It will receive no further
updates.

`@ecency/sdk/wallets` keeps wallet code out of the SDK's main entry, so apps that
never import it do not bundle it. `@solana/web3.js` and `@wallet-standard/app`
are optional peer dependencies of `@ecency/sdk`, needed only for the MetaMask
Solana flows.

Built and maintained by [Ecency](https://ecency.com), an open-source social platform on the Hive blockchain.
