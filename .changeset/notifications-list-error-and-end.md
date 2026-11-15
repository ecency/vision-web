---
"@ecency/sdk": patch
---

`getNotificationsInfiniteQueryOptions` throws on a non-OK response, on a body that is not JSON and on a body that is not a list, instead of resolving an empty page, so consumers reach their error state and retry. A thrown non-OK error carries `status`, and the options' `retry` does not retry a 4xx (an expired or revoked code), while a 5xx or network failure keeps React Query's default 3 retries. `getNextPageParam` returns `undefined` after an empty page (it returned `""`, which React Query reads as "has a next page"), so `hasNextPage` turns false and an account with no notifications gets the empty-list state.
