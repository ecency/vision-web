---
"@ecency/sdk": patch
---

`useWalletOperation` refetches the pending savings withdrawals (`QueryKeys.wallet.savingsWithdraw`) after a successful savings withdrawal, so a list of them shows the new one without a reload. `getSavingsWithdrawFromQueryOptions` builds its key from `QueryKeys`.
