---
"@ecency/sdk": patch
---

`verifyPostOnAlternateNode` (and so `getPostQueryOptions`) no longer turns a failed double-check into "not found". When the first node answers `null` and the other nodes are asked, it resolves the post if a node has it, `null` only when a node actually answered (null or a not-found assert), and throws when every node failed (transport error, rate limit, timeout). `callWithQuorum` takes an optional fifth argument, `onNodeSettled`, that reports each node's answer or error; its return value and errors are unchanged.
