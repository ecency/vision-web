---
"@ecency/sdk": patch
---

A removed vote now stays a `{ rshares, percent: 0 }` row in `normalizeEntry`, `entryVoteOf`, the vote lookup and the optimistic unvote (not cast, see the new `isRemovedVote`), so the optimistic `stats.total_votes` stays unchanged on an unvote and on a revote or flag over a removed vote, as hivemind counts it.
