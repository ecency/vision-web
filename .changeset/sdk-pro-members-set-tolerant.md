---
"@ecency/sdk": patch
---

`proMembersSet` no longer throws on a malformed Pro roster: a body that is not an array gives an empty set, and entries that are not strings are skipped.
