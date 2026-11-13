---
"@ecency/sdk": minor
---

A removed vote now stays a `{ rshares, percent: 0 }` row in `normalizeEntry`, `entryVoteOf`, the vote lookup and the optimistic unvote, so the optimistic `stats.total_votes` stays unchanged on an unvote and on a revote or flag over a removed vote, as hivemind counts it. New helper `isRemovedVote`.

**Migration:** `observer_vote` and `entryVoteOf` no longer return `null` after an unvote. `null` now means the account never voted, and a row with `percent: 0` means it voted and then removed the vote. To test whether an account has voted, use `isCastVote(vote)` (or `voteDirection(vote)`), not a null check: `if (entry.observer_vote)` treats a removed vote as cast.
