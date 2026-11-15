---
"@ecency/sdk": patch
---

`getNotificationsInfiniteQueryOptions` throws on a non-OK response instead of resolving an empty page, so consumers reach their error state and retry. `getNextPageParam` returns `undefined` after an empty page (it returned `""`, which React Query reads as "has a next page"), so `hasNextPage` turns false and an account with no notifications gets the empty-list state.
