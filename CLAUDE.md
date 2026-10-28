# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Ecency Vision is a Next.js 15-based web client for the Hive blockchain, organized as a pnpm monorepo workspace. The codebase consists of a main Next.js application (`apps/web`), a self-hosted blog SPA (`apps/self-hosted`), and four publishable packages (`@ecency/sdk`, `@ecency/wallets`, `@ecency/render-helper`, `@ecency/ui`).

## Path-scoped rules

Area-specific guidance lives in `.claude/rules/` and loads only when a matching file is read
or edited. This file keeps what applies everywhere. Read the rule file directly when you need
its content before touching a matching file.

| Rule file | Loads for | Covers |
| --- | --- | --- |
| `.claude/rules/web-app.md` | `apps/web/**` | App architecture, state, routing, API layer, mutation architecture, styling, i18n, env, production build |
| `.claude/rules/auth-broadcast.md` | `apps/web/**`, `packages/sdk/src/**`, `apps/self-hosted/src/providers/sdk/**` | Auth methods, broadcast adapter pattern, smart auth strategy, auth upgrade flow |
| `.claude/rules/icons.md` | `.tsx`, `.scss` and `.css` under `apps/web/src` and `apps/self-hosted/src`, `docs/icons.md`, `scripts/icon-*` | Icon sizing convention and its CI enforcement |
| `.claude/rules/web-testing.md` | `apps/web/src/specs/**`, `apps/web/vitest.config.*` | Vitest setup, global mocks, the `@/utils` re-mock, testing patterns, coverage |
| `.claude/rules/packages.md` | `packages/**` | Per-package scope and entry points, dual builds, package tests, publishing |
| `.claude/rules/self-hosted.md` | `apps/self-hosted/**`, the hosting signup feature, its specs, the `/hosting` page and `api/hosting` routes under `apps/web/src`, `.github/workflows/self-hosted.yml` | Self-hosted SPA, theme platform, releases, managed blog hosting, claim and signup flows |
| `.claude/rules/deploy-infra.md` | `infra/**`, `apps/web/docker-compose*.yml`, `.github/workflows/**`, `scripts/origin-config-audit.mjs` | Stack deploys, deployment topology, the origin config audit |

When adding guidance, put it in the rule file for the area it applies to, and here only if it
applies across the whole repo.

## Common Commands

### Development

```bash
# Install dependencies (run from workspace root)
pnpm install

# Start main app dev server
pnpm dev
# or: pnpm --filter @ecency/web dev

# Start package dev servers (watch mode)
pnpm dev:sdk
pnpm dev:wallets
pnpm dev:ui

# Start self-hosted app dev server
pnpm dev:self
```

### Building

```bash
# Build main app
pnpm build
# or: pnpm --filter @ecency/web build

# Build all packages
pnpm build:packages
# or: pnpm -F @ecency/sdk -F @ecency/wallets -F @ecency/render-helper -F @ecency/ui build

# Build production server
pnpm start
```

### Testing & Linting

```bash
# Web app tests. The root script is web-only, despite the name
pnpm test

# Self-hosted SPA
pnpm --filter @ecency/self-hosted test

# Hosting API (standalone npm project, outside the pnpm workspace)
cd apps/self-hosted/hosting/api && npm ci && npm test

# Hosting operator scripts (python stdlib unittest)
cd apps/self-hosted/hosting/scripts && python3 -m unittest discover -p 'test_*.py'

# Lint all packages
pnpm lint

# Type check. This is `pnpm -r --if-present typecheck`, so it does NOT cover
# hosting/api, which lives outside the workspace globs
pnpm typecheck
```

**Four script audits also gate `.github/workflows/typecheck.yml`**, and `pnpm test` runs none
of them. ⛔ Copy the flags exactly: without `--fail` these REPORT and exit 0, so a violation
passes locally and fails in CI.

```bash
node scripts/icon-scss-audit.mjs                 # also fails if a retired SCSS rule reappears
node scripts/icon-tsx-audit.mjs --fail           # icon sizing, see docs/icons.md
node scripts/slim-entries-audit.mjs --fail       # feed payload invariants
node scripts/origin-config-audit.mjs --self-test  # prove the rules still fire, THEN enforce
node scripts/origin-config-audit.mjs --fail
```

### Running Single Tests

```bash
# For main app (Vitest). From the workspace root, path relative to apps/web. Do not add `--`:
# pnpm forwards it literally, no filter applies and the entire suite runs
pnpm test src/specs/path/to/test.spec.tsx

# For packages (Vitest)
pnpm --filter @ecency/sdk test -- path/to/test.spec.ts
```

## Monorepo Architecture

### Workspace Structure

- **apps/web** - Main Next.js application (`@ecency/web`)
  - **apps/web/src/features/post-renderer** - Post rendering components (migrated from packages/renderer)
- **apps/self-hosted** - Self-hosted blog SPA (`@ecency/self-hosted`) — Rsbuild + TanStack Router
- **packages/sdk** - Core Hive SDK with React Query integration (`@ecency/sdk`)
- **packages/wallets** - Multi-chain wallet management (`@ecency/wallets`)
- **packages/render-helper** - Markdown rendering utilities (`@ecency/render-helper`)
- **packages/ui** - Shared UI component library (`@ecency/ui`)
- **packages/raidstead** - Raidstead game (`@ecency/raidstead`, private, not published): the dot renderer and scene, art as shape data, and a typed games-api client. Consumed from source (`main` is `src/index.ts`, listed in `transpilePackages`), so it has no build step and no committed `dist`. The route is `apps/web/src/app/raidstead`.
- **infra/origin** - The web origin nginx vhosts (`eu`/`us.ecency.com.conf`), tracked since
  2026-08-20. ⛔ **This repo is public**: structure is committed, thresholds and addresses are
  not — they live in host-only includes. Enforced by `scripts/origin-config-audit.mjs` in CI.
  ⛔ CI does **not** deploy these; they are applied by hand to both boxes, and the rule is
  apply-and-reload BEFORE committing so the tracked copy matches what is running. See
  `infra/origin/README.md`.

All packages use `workspace:*` protocol for local dependencies. The main app transpiles workspace packages during build (configured in `next.config.js`).

### Package Architecture & Boundaries

The monorepo follows a **layered architecture** with clear separation of concerns:

```
┌─────────────────────────────────────────────┐
│           @ecency/web (Next.js App)         │
│   - UI Components & Pages                   │
│   - SDK mutation wrappers (api/sdk-mutations)│
│   - App-specific mutation logic              │
│   - Feature modules                          │
│   - Post renderer (features/post-renderer)   │
└──────────────────┬──────────────────────────┘
                   │ imports
     ┌─────────────┼──────────┬──────────┐
     │             │          │          │
     ▼             ▼          ▼          ▼
┌────────────┐ ┌────────┐ ┌──────────┐ ┌────────┐
│ @ecency/   │ │@ecency/│ │ @ecency/ │ │@ecency/│
│ sdk        │ │wallets │ │ render-  │ │ ui     │
│ - Queries  │ │- Asset │ │ helper   │ │- Shared│
│ - Mutations│ │  queries│ │- Markdown│ │  UI    │
│ - Types    │ │- Keys  │ │- Content │ │  comps │
│ - QueryKeys│ └───┬────┘ └──────────┘ └────────┘
└──────┬─────┘     │
       └───────────┘ wallets imports sdk

┌─────────────────────────────────────────────┐
│     @ecency/self-hosted (Rsbuild SPA)       │
│   - Blog/Community hosting                   │
│   - TanStack Router                          │
│   - Runtime config (Docker/Nginx)            │
└──────────────────┬──────────────────────────┘
                   │ imports sdk, render-helper, wallets, ui
```

Per-package scope, entry points and build details are in `.claude/rules/packages.md`; the
self-hosted app is in `.claude/rules/self-hosted.md`.

### Important Package Guidelines

**❌ DO NOT**:
- Move wallet/asset queries from `@ecency/wallets` to `@ecency/sdk`
  - Reason: Would bloat SDK with multi-chain dependencies
- Add heavy dependencies to `@ecency/sdk`
  - Reason: SDK must remain lightweight for external consumers
- Create circular dependencies between packages
  - Reason: Breaks build order and package independence
- Add app-specific logic to packages
  - Reason: Packages should be reusable
- Use hardcoded query key arrays — use `QueryKeys` from `@ecency/sdk`
  - Reason: Single source of truth for cache invalidation
- Rely on Node globals (`Buffer`, `process`, `__dirname`) in package code that runs in a browser
  - Reason: Next.js shims `Buffer`, the self-hosted SPA's bundler (Rsbuild/rspack) does not.
    A `Buffer.from()` in `@ecency/render-helper` shipped a `ReferenceError: Buffer is not
    defined` to every hosted blog while ecency.com stayed green. Use `TextEncoder`/
    `Uint8Array`, or guard on `typeof X !== "undefined"` when a Node fallback is genuinely
    needed. A package change is only proven by building `apps/self-hosted`, not by the web app

**✅ DO**:
- Put all Hive blockchain mutations in `@ecency/sdk`
- Put wallet/asset queries in `@ecency/wallets`
- Create web-specific mutation wrappers in `apps/web/src/api/sdk-mutations/`
- Use `QueryKeys` from `@ecency/sdk` for all cache key references
- Rebuild packages after changes: `pnpm build:packages`

**Query Organization**:
```typescript
// In @ecency/sdk - Hive blockchain queries + mutations
export function getPostQueryOptions(author: string, permlink: string) { ... }
export function useVote(username: string, auth?: AuthContextV2) { ... }

// In @ecency/wallets - Asset/wallet queries (no mutations)
export function getHiveEngineTokensBalancesQueryOptions(username: string) { ... }

// In @ecency/web - SDK mutation wrappers (apps/web/src/api/sdk-mutations/)
// Each wrapper adds the web broadcast adapter and active user context
import { useVote } from "@ecency/sdk";
import { getWebBroadcastAdapter } from "@/providers/sdk";
import { useActiveUsername } from "@/core/hooks/use-active-username";

export function useVoteMutation() {
  const username = useActiveUsername();
  const adapter = getWebBroadcastAdapter();
  return useVote(username, { adapter });
}
```

### When to Rebuild Packages

After modifying files in `packages/sdk` or `packages/wallets`:

```bash
# Rebuild all packages
pnpm build:packages

# Or rebuild individual packages
pnpm --filter @ecency/sdk build
pnpm --filter @ecency/wallets build
```

The web app will not see package changes until they are rebuilt.

## Code Quality

- TypeScript strict mode enabled
- All new code should include proper types
- ESLint and type checking ignored during builds (check before commit)
- Run `pnpm lint` and `pnpm test` before creating PRs

## Pull Requests

- Branch from `develop` (not `master`)
- Test first: issues carry an **Acceptance tests** list (`.github/ISSUE_TEMPLATE/spec.md`); write those specs
  before the code, see them fail for the right reason, then make them green. The PR says so, or repeats the
  issue's `No test-first: <reason>`
- Update tests if modifying existing code
- Mark PR as WIP if not ready
- Include description, screenshots/videos, and link to issues
- Ensure linting and tests pass before requesting review

## Package Manager

This project uses **pnpm@11.5.0** and **Node.js >= 22.12** (CI runs Node 24; see `.nvmrc`). The `packageManager` field in `package.json` ensures the correct pnpm version is used. pnpm 11 reads workspace settings (`overrides`, `allowBuilds`, etc.) from **`pnpm-workspace.yaml`**, not the old package.json `pnpm` field. A dependency that ships an install/build script must be reviewed and added to `allowBuilds` in `pnpm-workspace.yaml` (`strictDepBuilds` fails the install otherwise). Always run commands from the workspace root unless specifically targeting a package.

## Key Files for Understanding

1. `package.json` - Workspace scripts and configuration
2. `apps/web/next.config.js` - Next.js configuration, rewrites, Sentry
3. `apps/web/src/app/layout.tsx` - Root layout and providers
4. `apps/web/src/core/global-store/index.ts` - Global state setup
5. `apps/web/src/core/react-query/index.ts` - React Query setup
6. `apps/web/src/api/sdk-mutations/index.ts` - All SDK mutation wrapper exports
7. `packages/sdk/src/modules/core/query-keys.ts` - Centralized cache key definitions
8. `apps/web/src/providers/sdk/web-broadcast-adapter.ts` - Web-specific auth/broadcast adapter
9. `apps/web/src/routes.ts` - Route constants
10. `apps/web/tailwind.config.ts` - Design system
