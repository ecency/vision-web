---
"@ecency/sdk": patch
---

Optimistic vote cache update keeps `stats.total_votes` unchanged on an unvote and on a revote over a removed vote, since hivemind keeps counting a vote row once cast.
