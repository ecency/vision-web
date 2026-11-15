---
"@ecency/sdk": patch
---

`buildDelegateRcOp` (and so `useDelegateRc`) trims each delegatee and drops empty names, so `"a,b,"` delegates to `a` and `b` instead of also sending an empty name, matching what the web delegate form counts. A list with no name left throws the missing parameters error.
