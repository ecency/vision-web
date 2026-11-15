---
"@ecency/sdk": minor
---

`verifyPostOnAlternateNode` (and so `getPostQueryOptions`) no longer turns a failed double-check into "not found". When the first node answers `null` and the other nodes are asked, it resolves the post if a node has it, `null` only when another node actually answered (null, or an `Assert Exception:` such as "does not exist" or "invalid account char"), and throws the last node error (the quorum error as its `cause`) when every other node failed (transport error, rate limit, timeout, a node without the API). A `null` from the node that answered the first call does not count, since a lagging node answers `null` again. `callWithQuorum` no longer lets a `null` from one node hide a real result from a later node; when every node answers `null` it still rejects, as before.

New, all optional: `callWithQuorum` takes a fifth argument, `onNodeSettled`, that reports each node's answer or error (`QuorumNodeOutcome` type); `callRPCWithFallback` takes `onAnswer` in its options, told which node produced the result; `bridgeV2Call` takes it as a fourth argument; `verifyPostOnAlternateNode` takes the answering node as a fourth argument.

Migration: `verifyPostOnAlternateNode` and `getPostQueryOptions` can now reject where they resolved `null` before. A caller that treated `null` as "post does not exist" should treat a rejection as "lookup failed, try again", not as a 404.
