---
"@ecency/sdk": minor
---

Posts are identified by author/permlink. Hive API nodes no longer return `post_id` from bridge reads (v1 and v2), and the value was never comparable across nodes. The waves helpers compared `post_id` to drop a thread's container, so with `post_id` missing on both sides they dropped every wave. New helper `entryKey(entry)` returns `author/permlink`.

**Migration:** `Entry.id` is now typed `string` and `post_id` is optional. Wave entries from `normalizeWaveEntryFromApi`, `mapThreadItemsToWaveEntries` and `getWavesByHostQueryOptions` carry `id: entryKey(entry)`, including their `container` and `parent`, instead of a numeric `post_id`. Entries from other reads do not set `id`. To key, dedupe or compare posts, use `entryKey(entry)`, never `post_id`.
