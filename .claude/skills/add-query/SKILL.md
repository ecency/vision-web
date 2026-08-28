---
name: add-query
description: Use when adding or changing a React Query data query - a query option builder in @ecency/sdk or @ecency/wallets, an app-specific query under apps/web/src/api/queries, or the QueryKeys entry one of those needs.
argument-hint: [query-name]
---

# Add Query

## Where it lives

| Data | Path |
|---|---|
| Hive chain data (posts, accounts, communities, proposals, polls, market) | `packages/sdk/src/modules/<domain>/queries/` |
| External chain assets (BTC, ETH, BNB, SOL) | `packages/wallets/src/modules/assets/external/<chain>/`, with no `queries/` dir |
| Multi-chain wallet list, token prices, token operations | `packages/wallets/src/modules/wallets/queries/` |
| Data only the web app has (contributors, gifs, pending payouts) | `apps/web/src/api/queries/` |

Hive, Hive Engine and Points asset builders already live in the SDK under
`packages/sdk/src/modules/{wallet,hive-engine,points}/queries/`. The matching
`packages/wallets/src/modules/assets/{hive,hive-engine,points}/queries/index.ts` files are
re-export lists pointing back at `@ecency/sdk`, so a new builder for one of those assets is
an SDK file plus one line in the wallets re-export. CLAUDE.md holds the package boundary
rules: the multi-chain code stays in `@ecency/wallets`.

## 1. Add the key

`packages/sdk/src/modules/core/query-keys.ts` is one object literal
(`export const QueryKeys = { ... } as const;`), not a class, so there is no `static` in it.
For a new key, return a plain array whose first element is the block name. 10 of the 23
blocks also end with a `_prefix` used for bulk invalidation (a plain array, or a function
where the prefix takes an argument, as in `points`):

```typescript
  support: {
    settings: (username: string | undefined) => ["support", "settings", username],
    _prefix: ["support"],
  },
```

Older keys break that first-element rule, one of them expensively: `accounts.full` returns
`["get-account-full", username]`, which `accounts._prefix` (`["accounts"]`) does not match,
so invalidating the accounts prefix leaves the full account stale. `communities.single`,
`communities.singlePrefix` and `communities.context` emit `"community"` rather than
`"communities"`. One more, `assets.ecencyAssetInfo`, emits `"ecency-wallets"`. Do not
extend any of those shapes.

For an optional trailing argument use the file-local `key(...)` helper, which strips
trailing `undefined` so the key still matches as an invalidation prefix (see
`posts.draftsInfinite`). Only 7 call sites use it today: the infinite keys for drafts,
schedules, fragments, images, favorites and bookmarks, plus `search.api`. Every other key
with an optional tail, `posts.drafts` and `accounts.full` among them, embeds the
`undefined` and is not prefix-safe. Web-only queries extend the `QueryIdentifiers` enum in
`apps/web/src/core/react-query/index.ts` instead.

## 2. Write the builder

File: `packages/sdk/src/modules/<domain>/queries/get-<entity>-query-options.ts`. Export a
function, never a hook, so one options object serves a component, a server prefetch or a
non-React caller. 164 of the 173 top-level `export function` declarations in the non-spec
files under `packages/sdk/src/modules/*/queries/` are named `get...`; the four query
builders that are not (`searchQueryOptions`, `lookupAccountsQueryOptions`,
`checkFavoriteQueryOptions`, `checkUsernameWalletsPendingQueryOptions`) are older names, so
name a new one `get...`. The other five non-`get` exports are helpers such as
`sortDiscussions`, not builders. `@ecency/wallets` is looser and
`modules/wallets/queries/use-get-external-wallet-query.ts` does export a hook
(`useGetExternalWalletBalanceQuery`); do not copy it. Trimmed from
`modules/posts/queries/get-post-query-options.ts`:

```typescript
import { queryOptions } from "@tanstack/react-query";
import { QueryKeys } from "@/modules/core";
import { callRPC } from "@/modules/core/hive-tx";
import { filterDmcaEntry } from "../utils/filter-dmca-entries";
import { Entry } from "../types";

export function getPostQueryOptions(author: string, permlink?: string, observer = "") {
  const cleanPermlink = permlink?.trim();

  return queryOptions({
    queryKey: QueryKeys.posts.entry(`/@${author}/${cleanPermlink ?? ""}`),
    queryFn: async () => {
      if (!cleanPermlink) {
        return null;
      }
      const response = await callRPC("bridge.get_post", {
        author,
        permlink: cleanPermlink,
        observer,
      });
      return response ? filterDmcaEntry(response as Entry) : null;
    },
    enabled: !!author && !!cleanPermlink,
  });
}
```

- `callRPC(method, params, timeout?, retry?, signal?, validate?)`, where `validate` rejects a
  bad result and fails over to the next node. `bridge.*` takes a named object;
  `condenser_api.*` takes a positional array, as in
  `callRPC("condenser_api.get_accounts", [usernames])`. Forward the queryFn `signal` for
  anything paginated or slow.
- Private API: `getBoundFetch()` with `CONFIG.privateApiHost + "/private-api/<route>"`, then
  check `response.ok` and throw. The `[SDK][Domain]` prefix is the convention for the
  missing-auth guard throw; the `!response.ok` throw is almost always the unprefixed
  ``Failed to fetch <thing>: ${response.status}``. Follow whichever the nearby files in your
  domain use.
- `QueryKeys`, `CONFIG` and `getBoundFetch` come from `@/modules/core`; `callRPC` from
  `@/modules/core/hive-tx`.

Paginated lists use `infiniteQueryOptions`. Plenty of them take an inline scalar cursor
(`initialPageParam: 0`, or `""`); give an object cursor a named type. Stop on a short page
rather than on an empty one, or the list pays one wasted fetch at the end. Trimmed from
`modules/posts/queries/get-account-posts-query-options.ts`:

```typescript
type PageParam = {
  author: string | undefined;
  permlink: string | undefined;
  hasNextPage: boolean;
};

    initialPageParam: {
      author: undefined,
      permlink: undefined,
      hasNextPage: true,
    } as PageParam,
    getNextPageParam: (lastPage: Entry[]): PageParam | undefined => {
      const last = lastPage?.[lastPage.length - 1];
      // a partial page means the end of the list
      const hasNextPage = (lastPage?.length ?? 0) === limit;
      return hasNextPage
        ? { author: last?.author, permlink: last?.permlink, hasNextPage }
        : undefined;
    },
```

## 3. Export it

Add one line to the domain's `queries/index.ts`, which `modules/<domain>/index.ts` already
re-exports. A brand new domain also needs `export * from "./modules/<domain>";` in
`packages/sdk/src/index.ts`.

## 4. Consume it

```typescript
const { data } = useQuery(getPostQueryOptions(author, permlink));

// Server component: the app helper, not a raw query client
import { prefetchQuery } from "@/core/react-query";
const entry = await prefetchQuery(getPostQueryOptions(author, permlink));
```

Those helpers (`apps/web/src/core/react-query/query-helpers.ts`) wrap the fetch in an SSR
timeout, so a hanging node cannot hold a render open.

## 5. Test

Colocate `get-<entity>-query-options.spec.ts` beside the builder, then run
`pnpm --filter @ecency/sdk test -- <spec path>` plus `pnpm typecheck`.

## Gotchas

- `enabled` gates automatic fetching only. `prefetchQuery` and `fetchQuery` call the queryFn
  regardless, so guard missing params inside it too: return `null` where null is a legal
  result, otherwise throw.
- A query that returns `Entry` objects should pass them through `filterDmcaEntry`
  (`modules/posts/utils/filter-dmca-entries.ts`). Only `get-post`, `get-account-posts`,
  `get-posts-ranked` and `get-discussions` call it directly; the ones that go through
  `modules/bridge/requests.ts` inherit it, because `resolvePosts` filters inside. Anything
  calling `callRPC` straight from the queryFn does not:
  `get-content-replies-query-options.ts` returns raw `condenser_api.get_content_replies`
  entries with no filtering at all.
- Never reorder a paginated bridge response inside the queryFn. The cursor is the last
  entry of the page you return and the node continues in its own ranking, so sorting there
  repeats and skips posts. Sort in `select`, which runs after pagination.
- `getNextPageParam` must return `undefined` at the end of a list. Returning an object keeps
  `hasNextPage` true forever and appends empty pages.
- Never hardcode a key array at a call site. Use `QueryKeys`, per CLAUDE.md.
