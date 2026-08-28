---
name: debug
description: Diagnose a runtime bug in this vision-web app or @ecency/sdk: post shown as deleted, failed broadcast or auth upgrade, stale query, infinite scroll that stops, SSR memory growth, or an SDK edit with no effect.
argument-hint: [issue-description]
---

# Debug Guide

CLAUDE.md has the architecture and commands; note that root `pnpm test` is web-only and
the four `node scripts/*-audit.mjs` checks gate CI without running under it. Below is triage
plus the invariants that break easily.

Data flows component -> `apps/web/src/api/` wrapper -> SDK query/mutation -> `callRPC`
(`packages/sdk/src/hive-tx/helpers/call.ts`). Read `packages/sdk/src/`, never `dist/`:
`exports` in `packages/sdk/package.json` points at the build, so an unbuilt SDK edit is
invisible. Most invariants below have a spec; find it before a repro. A report from
one browser only, or only right after a deploy, is often already handled by the
scripts in `apps/web/public/scripts/`; check those first.

## Post shown as deleted, 404, or spinning

`getPostQueryOptions(author, permlink?, observer = "", num?)`
(`packages/sdk/src/modules/posts/queries/`) calls `callRPC("bridge.get_post", ...)`; on a falsy
response (`if (!response)`) it retries via `verifyPostOnAlternateNode` (`.../modules/bridge/`),
which shuffles nodes through `callWithQuorum(..., 1)` and accepts a result only if `author` and
`permlink` both match. `permlink` is optional: a blank one or the literal `"undefined"` leaves
the query disabled and the queryFn returning `null`. Node list
`apps/web/public/public-nodes.json` is applied by `ConfigManager.setHiveNodes()` in
`apps/web/src/core/sdk-init.ts`.

- Body reading "copyright/fraudulent claim" with an empty title is `filterDmcaEntry`
  (`.../posts/utils/`) hitting `apps/web/public/dmca/*.json`, not a node fault.
- `.../[permlink]/_components/entry-not-found-fallback.tsx` picks the screen: `post_id === 1`
  marks a local optimistic entry; `isVerifying` is
  `!isOptimistic && !hasTransitioned && verifyPollCount < VERIFY_MAX_POLLS`, so the deleted
  screen is held off only for the 3 verification polls. Once `handleSuccess` sets
  `hasTransitioned` a non-optimistic entry falls straight through to `DeletedPostScreen`
  until the `router.refresh()` tree lands. `isError` shows a retry prompt instead of the
  deleted screen. Its own poll key `["entry-chain-poll", ...]` keeps it from clobbering the
  optimistic entry.

Specs: `verify-on-alternate-node.spec.ts`, `get-post-query-options.spec.ts`.

## Broadcast or auth-upgrade failure

CLAUDE.md covers the auth methods. What bites:

- `AuthorityLevel` and `getRequiredAuthority(ops)` are in
  `packages/sdk/src/modules/operations/authority-map.ts`; `use-broadcast-mutation.ts` only
  imports the type.
- Its HiveSigner shortcut needs all three of `authority === 'posting'`,
  `adapter.hasPostingAuthorization(username)` and a `getLoginType()` of
  `key`/`keychain`/`hiveauth`, else the user's own method runs. "HiveSigner was skipped"
  usually means no posting authorization.
- Fallback is gated on `shouldTriggerAuthFallback` (`.../core/errors/chain-errors.ts`), true
  only for `MISSING_AUTHORITY` and `TOKEN_EXPIRED`; everything else rethrows by design, so a
  network failure mid-broadcast never retries another method.
- `auth-upgrade-dialog.tsx` listens for the `ecency-auth-upgrade` CustomEvent, but the
  dispatch is in the sibling `auth-upgrade-events.ts` (`requestAuthUpgrade()`), reached from
  `showAuthUpgradeUI` in `apps/web/src/providers/sdk/web-broadcast-adapter.ts`. That module
  holds one `pendingResolve`, so a second concurrent upgrade resolves the first with `false`,
  cancelling it rather than hanging it.
- Token refresh route: `apps/web/src/app/api/auth-api/hs-token-refresh/route.ts`.
- Error text is web-local: `formatError` from `@/api/format-error`, 62 importers, 76 sites
  shaped `error(...formatError(err))`. It maps chain strings to `chain-error.*` keys, else
  truncates to 80 chars, so raw text means `handleChainError` lacks a branch. The SDK's
  `parseChainError`/`ErrorType` in that same `chain-errors.ts` is a separate classifier no web
  file calls; it reaches web behavior only through `shouldTriggerAuthFallback`.

## Stale data, or infinite scroll that stops

`apps/web/src/core/react-query/index.ts` sets app-wide `staleTime: 60_000`,
`refetchOnWindowFocus: false`, `refetchOnMount: false`. Most "never updates" reports are
those defaults; opt one query back in with `refetchOnMount: "always"` (see
`features/shared/entry-translate/index.tsx`).

`getNextPageParam` stops on `null` **or** `undefined` (query-core 5.90.2 tests
`param == null`) and `null` is used deliberately here, so a stuck list is rarely a
null-versus-undefined problem. The real trap: `initialData` makes `state.data` defined,
`shouldLoadOnMount` goes false and page 1 is never fetched under `refetchOnMount: false`,
leaving the bottom sentinel as the only trigger. See
`apps/web/src/app/search/_components/search-comment/index.tsx`.

## SSR renderer memory climbs

Same file. `SERVER_GC_TIME` is 2 minutes and the server wraps `client.defaultQueryOptions` to
clamp longer per-query `gcTime` down to it: a pending gc timer is a GC root holding its
`Query`, which holds the whole `QueryCache`, so one long-lived entry pins that request's
cache. `Infinity` is exempt: it schedules no timer at all. Pinned by
`apps/web/src/specs/core/react-query/gc-time.spec.ts`; the SDK-side
`packages/sdk/src/modules/core/server-gc-time.spec.ts` is a different check, over the separate
`SERVER_GC_TIME_MS` in `packages/sdk/src/modules/core/config.ts`.
