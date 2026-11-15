---
"@ecency/sdk": patch
---

`buildDelegateRcOp` (and so `useDelegateRc`) trims each delegatee and drops empty names, so `"a,b,"` delegates to `a` and `b` instead of also sending an empty name, matching what the web delegate form counts. A list with no name left throws the missing parameters error. After the broadcast, `useDelegateRc` refreshes the account and RC queries of each delegatee in the list, where it used one key built from the raw list string.
