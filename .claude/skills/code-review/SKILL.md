---
name: code-review
description: Repo-specific review checklist for this vision-web monorepo. Use when reviewing a diff, PR, branch or changed files under apps/web, apps/self-hosted or packages/*, to check them against this codebase's known traps and CI guards.
argument-hint: [file-or-branch]
---

# Code Review

Traps specific to this repo, each with the guard that proves it. General review
technique belongs to the built-in reviewer; commands and audits are in CLAUDE.md.

Note each changed file's workspace. Run the checks its diff can trip plus the
CLAUDE.md audits it touches. Read the cited source before flagging: what you
cannot point at is not a finding. Report `[SEVERITY] path:line`, what breaks,
then the fix. Severities: `BUG`, `SECURITY`, `PERF`, `STYLE`, `NITPICK`.

## Checks

**Slim feed wrappers are not interchangeable** (`apps/web/src/core/entries/slim-entry.ts`).
`withSlimPageEntries` takes SINGLE-PAGE builders (`getPostsRankedQueryOptions`,
`getAccountPostsQueryOptions`), 3 call sites: it isolates the key, which deck
columns otherwise read for `entry.body`. `withSlimEntries` takes INFINITE
builders plus the promoted feed, 5 call sites: its key must stay what the SDK
produced, since the feed poll hand-builds it for a `setQueryData` merge.
`withCardOnlyPageEntries`: 3. Guard: `node scripts/slim-entries-audit.mjs --fail`.

**No server component may reach a `"use client"` module through `@/features/shared`.**
That `export *` barrel hands it `undefined`, so the subtree renders as nothing at
HTTP 200 while `next build` and vitest both pass. Guard:
`apps/web/src/specs/app/server-components-avoid-client-barrel.spec.ts`.

**Package code may not read `process`, `Buffer`, `__dirname` or `__filename`.**
Next shims them, Rsbuild does not, so the chunk throws at load and hosted blogs
go blank. A `typeof` test must GOVERN the read; a nearby one does not count.
Guard: `apps/self-hosted/scripts/check-node-globals.mjs`, run by its build.

**Query options**
- Guard a missing param TWICE: `enabled: !!a && !!b` (82 `enabled: !!` in
  `packages/sdk/src`) plus an early return in the queryFn, since `prefetchQuery`
  and `fetchQuery` ignore `enabled`. See `get-post-query-options.ts`. The SDK's
  one `enabled: false` is a manual-refetch query, not the pattern.
- Keys come from `QueryKeys` (`packages/sdk/src/modules/core/query-keys.ts`; 359
  `QueryKeys.` uses across apps and packages). A raw array duplicating an SDK key
  splits the cache. `QueryIdentifiers` (`apps/web/src/core/react-query`, 25 uses)
  is only for web-only features with no SDK query.
- Post and feed results pass through `filterDmcaEntry`: five SDK modules
  apply it (get-post, get-posts-ranked, get-account-posts, get-discussions,
  bridge/requests). A reader that skips it serves takedown-listed content.
- `prefetchQuery` resolves to `undefined` past `SSR_PREFETCH_TIMEOUT_MS` (10s,
  `apps/web/src/core/react-query/query-helpers.ts`), so the server component must
  still render without it.
- An SDK builder's FINITE `gcTime` must bound itself on the server with
  `SERVER_GC_TIME_MS` (2 min, `packages/sdk/src/modules/core/config.ts`).
  `Infinity` is exempt: it schedules no gc timer, so it roots nothing; clamping
  it to a finite window would CREATE one. `apps/web` re-clamps finite overrides
  in `makeQueryClient` (`core/react-query/index.ts`, its own `SERVER_GC_TIME`),
  so the builder is where a bad window is worth flagging. Guard:
  `packages/sdk/src/modules/core/server-gc-time.spec.ts`.

**A null `bridge.get_post` is not proof the post is gone.** `getPostQueryOptions`
re-checks through `verifyPostOnAlternateNode`, which accepts a response only when
`author` and `permlink` match the request. New RPC readers do the same.

**SDK mutation wrappers** (`apps/web/src/api/sdk-mutations/`, 56 wrappers) all
read `useActiveUsername()`. The 48 that broadcast pass `getWebBroadcastAdapter()`,
the shared singleton (123 non-spec uses in `apps/web/src`); the other 8 (drafts,
images, schedules, notifications) hit the private API and broadcast nothing.
`createWebBroadcastAdapter()` is internal: its 4 references all sit in
`apps/web/src/providers/sdk`.

**Icon sizing** is one `size-N` class or a sanctioned slot: CLAUDE.md and
`docs/icons.md` carry the rule plus its enforcement. **framer-motion is gone**
(0 imports); modals use CSS transitions
(`apps/web/src/features/ui/modal/index.tsx`). Do not reintroduce it.

**Tests**
- Placement decides collection. Four workspaces pin `include`, so a misplaced or
  wrongly suffixed file there is silently never run: `apps/web` takes
  `src/specs/**/*.spec.{ts,tsx}` only (372 files, 0 co-located),
  `packages/wallets` `src/**/*.spec.ts`, `packages/ui` and `apps/self-hosted`
  `src/**/*.test.{ts,tsx}` (77 in self-hosted). sdk and render-helper pin no
  `include`, so vitest's default picks up either suffix anywhere; co-located
  `*.spec.ts` is their convention, not a rule the runner enforces.
- One `vi.mock()` per module per spec: vitest 4 keeps the LAST factory, so an
  earlier one's exports vanish and reading them throws `No "x" export is defined
  on the mock`. `setup-any-spec.ts` also mocks partially, so
  re-mock with `importActual` as 80 specs do (CLAUDE.md has the snippet).
- Root `pnpm test` is web only; CI runs `pnpm -r test`. `apps/web` also resolves
  `@ecency/sdk` through the COMMITTED `packages/sdk/dist` (15 tracked files), so
  SDK edits stay invisible to web tests until `pnpm build:packages`.

**Strings** go into `en-US.json` only (CLAUDE.md). Nothing enforces that, so it
is yours to catch. A duplicate key is a separate trap: valid JSON whose earlier
value `JSON.parse` silently discards. That one IS guarded, across all 19 locale
files, by `apps/web/src/specs/features/i18n-locale-duplicate-keys.spec.ts`.
