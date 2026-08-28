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

Key style is per workspace, so pick the right one before writing anything:

| Workspace | Where the key comes from |
|---|---|
| `@ecency/sdk` | the shared `QueryKeys` object, below |
| `@ecency/wallets` | a package-local namespaced array; `QueryKeys` is imported in 0 files |
| `apps/web` | the `QueryIdentifiers` enum |

`@ecency/wallets` deliberately keeps its keys local so the multi-chain code does not reach
back into the SDK. It uses `["ecency-wallets", ...]` for the wallet list, market data and
external balances, `["assets", "<chain>", ...]` for the per-chain builders, plus `["wallets",
"token-operations", ...]` and `["portfolio", ...]`. Follow the neighbouring builder rather
than adding a wallets key to the SDK.

For SDK keys: `packages/sdk/src/modules/core/query-keys.ts` is one object literal
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

File: `packages/sdk/src/modules/<domain>/queries/get-<entity>-query-options.ts`. In
`@ecency/wallets` there are two homes: a wallet-level builder is
`packages/wallets/src/modules/wallets/queries/<name>.ts`, while a per-chain builder for BTC,
ETH, BNB or SOL sits directly in `packages/wallets/src/modules/assets/external/<chain>/`,
with no `queries/` level. A web-only
query is `apps/web/src/api/queries/<name>-query.ts` (`get-contributors-query.ts`,
`get-gifs-query.ts`) with its key from `QueryIdentifiers`. Everything below holds in all
three. Export a function, never a hook, so one options object serves a component, a server
prefetch or a non-React caller. 164 of the 173 top-level `export function` declarations in
the non-spec files under `packages/sdk/src/modules/*/queries/` are named `get...`; the four query
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
import { verifyPostOnAlternateNode } from "@/modules/bridge/verify-on-alternate-node";
import { filterDmcaEntry } from "../utils/filter-dmca-entries";
import { Entry } from "../types";

export function getPostQueryOptions(author: string, permlink?: string, observer = "") {
  const cleanPermlink = permlink?.trim();

  return queryOptions({
    queryKey: QueryKeys.posts.entry(`/@${author}/${cleanPermlink ?? ""}`),
    queryFn: async () => {
      if (!cleanPermlink || cleanPermlink === "undefined") {
        return null;
      }
      const response = await callRPC("bridge.get_post", {
        author,
        permlink: cleanPermlink,
        observer,
      });
      if (!response) {
        // a lagging node answers null for a post that exists, so ask other nodes
        const verified = await verifyPostOnAlternateNode(author, cleanPermlink, observer);
        return verified ? filterDmcaEntry(verified as Entry) : null;
      }
      return filterDmcaEntry(response as Entry);
    },
    enabled: !!author && !!cleanPermlink && cleanPermlink !== "undefined",
  });
}
```

- `callRPC(method, params, timeout?, retry?, signal?, validate?)`, where `validate` rejects a
  bad result and fails over to the next node. `bridge.*` takes a named object;
  `condenser_api.*` takes a positional array, as in
  `callRPC("condenser_api.get_accounts", [usernames])`. Forward the queryFn `signal` for
  anything paginated or slow.
- A `null` from a single-record read is not proof the record is gone. `verifyPostOnAlternateNode`
  (`modules/bridge/verify-on-alternate-node.ts`) re-asks through `callWithQuorum(..., 1)`, which
  shuffles the node list; only a second `null` means deleted. `get-post` is the only caller
  today. Copy that branch where a missing result renders as a deleted post; skip it where `null`
  is an ordinary empty answer.
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
`packages/sdk/src/index.ts`. A web-only query takes one line in
`apps/web/src/api/queries/index.ts` and nothing else.

`@ecency/wallets` has one working chain plus one broken one. A wallet-level builder follows the
SDK shape: `modules/wallets/queries/index.ts`, re-exported by that module's `index.ts`, which
`packages/wallets/src/index.ts` exports.

An external chain builder does not reach the package root today. The links are
`external/<chain>/index.ts` then `external/index.ts` (which re-exports bnb, btc, eth and sol),
but `packages/wallets/src/modules/assets/index.ts` exports only `./hive`, `./types`, `./utils`,
`./hive-engine` plus `./points`. It never exports `./external`, so nothing outside that
directory can import the BTC, ETH, BNB or SOL builders. Nothing does. Adding a builder
there means adding the missing `export * from "./external";` line as well, otherwise the new
export is unreachable.

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

In either package, colocate `get-<entity>-query-options.spec.ts` beside the builder (the SDK
picks up vitest's default spec glob, `packages/wallets/vitest.config.ts` includes
`src/**/*.spec.ts`), then run the one spec plus `pnpm typecheck`:

```bash
pnpm --filter @ecency/sdk test src/modules/<domain>/queries/get-<entity>-query-options.spec.ts
pnpm --filter @ecency/wallets test src/modules/wallets/queries/<name>.spec.ts
```

**Never add `--` before the path.** pnpm forwards it to vitest as a passthrough separator
rather than a file filter, so the whole package suite runs. Measured on 2026-08-28 against
`get-post-query-options.spec.ts`: with `--`, 64 files and 860 tests; without it, 1 file and 22
tests.

A web query does not colocate. `apps/web/vitest.config.mts` includes
`src/specs/**/*.spec.{ts,tsx}` only, so the spec goes under `apps/web/src/specs/api/queries/`
and runs from the workspace root as `pnpm test src/specs/api/queries/<name>.spec.ts`.

## Gotchas

- `enabled` gates automatic fetching only. The helpers in
  `apps/web/src/core/react-query/query-helpers.ts` call `queryClient.prefetchQuery` and
  `fetchQuery`, which ignore `enabled` and run the queryFn regardless, so guard missing params
  inside it too: return `null` where null is a legal result, otherwise throw. Guard every param
  the call cannot survive without. The example above is short of that: it guards `cleanPermlink`
  inside the queryFn but leaves `author` to `enabled`, so a server prefetch with an empty author
  still reaches the node.
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
- `getNextPageParam` must return `undefined` or `null` at the end of a list. `hasNextPage` is
  `getNextPageParam(...) != null` (query-core 5.90.2, `infiniteQueryBehavior.ts`), so either one
  stops it. Three builders return `null` through a cursor type that allows it:
  `get-outgoing-rc-delegations-infinite-query-options.ts`,
  `get-account-notifications-infinite-query-options.ts` and
  `get-community-subscribers-query-options.ts`. What never ends is returning an object, or any
  other non-nullish value: `hasNextPage` stays true forever and the list appends empty pages.
- Never hardcode a key array at a call site. Use `QueryKeys`, per CLAUDE.md.
