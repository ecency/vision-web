# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Ecency Vision is a Next.js 15-based web client for the Hive blockchain, organized as a pnpm monorepo workspace. The codebase consists of a main Next.js application (`apps/web`), a self-hosted blog SPA (`apps/self-hosted`), and four publishable packages (`@ecency/sdk`, `@ecency/wallets`, `@ecency/render-helper`, `@ecency/ui`).

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

`origin-config-audit` keeps thresholds, source addresses, inline allowlists, secret markers and
fail-open wildcard includes out of `infra/`. It reads **comments** too — an earlier version
stripped them and reported a clean run while every rate sat in prose two lines above. Run
`--self-test` first: it proves each rule still fires, so a regex edited into uselessness is
caught in the same step that relies on it.

### Running Single Tests

```bash
# For main app (Vitest)
pnpm --filter @ecency/web test -- path/to/test.spec.tsx

# For packages (Vitest)
pnpm --filter @ecency/sdk test -- path/to/test.spec.ts
```

### Publishing Packages

```bash
# Build before publishing
pnpm build:packages

# Publish individual packages
pnpm publish:sdk
pnpm publish:wallets
pnpm publish:render-helper
pnpm publish:ui
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
- **infra/origin** - The web origin nginx vhosts (`eu`/`us.ecency.com.conf`), tracked since
  2026-08-20. ⛔ **This repo is public**: structure is committed, thresholds and addresses are
  not — they live in host-only includes. Enforced by `scripts/origin-config-audit.mjs` in CI.
  ⛔ CI does **not** deploy these; they are applied by hand to both boxes, and the rule is
  apply-and-reload BEFORE committing so the tracked copy matches what is running. See
  `infra/origin/README.md`.

All packages use `workspace:*` protocol for local dependencies. The main app transpiles workspace packages during build (configured in `next.config.js`).

### Package Build Strategy

Packages use **dual builds** (tsup) to optimize for different environments:
- **Browser build**: ESM with TypeScript declarations
- **Node build**: ESM + CJS for SSR compatibility

Exports are platform-specific via package.json `exports` field.

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

#### @ecency/sdk - Core Hive SDK

**Purpose**: Hive blockchain queries and mutations

**Scope**:
- ✅ Hive blockchain queries (posts, comments, accounts, communities)
- ✅ Hive blockchain mutations (vote, comment, transfer, delegate, etc.)
- ✅ Hive notifications
- ✅ Core Hive types and interfaces
- ✅ React Query integration for Hive APIs
- ✅ Centralized `QueryKeys` for all cache key management
- ✅ Broadcast adapter pattern for platform-specific auth (web, mobile)
- ✅ Lightweight utilities (no heavy dependencies)

**Entry Points**:
- `@ecency/sdk` - Full SDK with React Query hooks, mutations, and queries
- `@ecency/sdk/hive` - React-free entry point exporting only the transaction engine (signing, RPC, crypto). Use this for server-side tools, CLI scripts, or non-React environments to avoid pulling in React/react-query dependencies.

**Dependencies**: NONE (except peer deps: @hiveio/dhive, hivesigner, @tanstack/react-query)

**Bundle Size**: ~229KB (full) / ~39KB (hive-only)

**Why separate**: This package is published to npm for use by other Hive applications. It must remain focused and lightweight.

#### @ecency/wallets - Multi-chain Wallet Management

**Purpose**: Asset queries and wallet management across multiple blockchains

**Scope**:
- ✅ Hive assets (HIVE, HBD, Hive Power) — queries and balance display
- ✅ Hive Engine tokens — queries and balance display
- ✅ Points system — queries
- ✅ External blockchains (BTC, ETH, SOL, TON, TRON, APT, BNB)
- ✅ Wallet balance/transaction queries
- ✅ Multi-chain key management

**Note**: All blockchain mutations (transfers, delegations, staking, etc.) have been migrated to `@ecency/sdk`. This package now focuses on queries, balance display, and multi-chain key management.

**Dependencies**:
- @ecency/sdk (for Hive core functionality)
- @okxweb3 packages (for external blockchain support)
- Heavy crypto libraries

**Bundle Size**: ~131KB

**Why separate**: Wallet functionality requires heavy external dependencies. Users who only need Hive SDK shouldn't be forced to download BTC/ETH/SOL libraries.

#### @ecency/render-helper - Markdown Rendering Utilities

**Purpose**: Framework-agnostic markdown and content rendering utilities

**Scope**:
- ✅ Markdown to HTML conversion
- ✅ Content sanitization
- ✅ Post formatting utilities
- ✅ Image proxification
- ✅ Content summarization

**Dependencies**: Minimal (htmlparser2, remarkable, xss, he, lolight)

**Bundle Size**: ~10-12KB

**Why separate**: Framework-agnostic utility library that can be used in any JavaScript environment (browser, Node.js, React Native). Published to npm for reuse by other Hive applications.

#### @ecency/ui - Shared UI Component Library

**Purpose**: Shared React UI components used across apps

**Scope**:
- ✅ Reusable React UI components
- ✅ Shared between web and self-hosted apps

**Why separate**: Avoids duplicating UI primitives across multiple apps in the monorepo.

#### @ecency/self-hosted - Self-Hosted Blog/Community App

**Purpose**: Lightweight SPA for self-hosted Hive blogs and communities

**Stack**: Rsbuild (not Next.js) + TanStack Router + Zustand + TailwindCSS 4

**Scope**:
- ✅ Runtime config system (hot-swappable config.json for Docker/Nginx)
- ✅ Blog post listing, single post view, comments
- ✅ Auth (Keychain, HiveSigner, HiveAuth)
- ✅ Publish/create posts (TipTap editor)
- ✅ Voting, reblog, comment creation
- ✅ Theme platform: 9 style templates rostered in `hosting/api/src/style-templates.ts`. Four are CSS-token-only (`medium`, `minimal`, `developer`, `modern-gradient`); five change page structure by overriding component seams (`magazine`, `journal`, `reader`, `gallery`, `terminal`).
- ✅ Configurable sidebar and branding
- ✅ Claim landing: an unclaimed subdomain serves the shared template config and renders a claim CTA plus a read-only live preview, instead of a blog

**The theme platform.** `src/themes/manifest.ts` defines a `ThemeComponents` seam (Shell, Navigation, Sidebar, ArchiveList, PostCard); a template's manifest in `src/themes/registry.ts` overrides the seams it owns and everything absent falls back to the shared default, so a CSS-only template resolves to the very same component functions. A manifest also declares `unsupportedOptions` (today `['sidebar']`), which the Configuration Editor uses to HIDE the control rather than leave a toggle that does nothing.

`style-templates.ts` is imported by the SPA, so it **must stay dependency-free**: it ends up in browser bundles. The dependency only ever points SPA to hosting/api, never the reverse.

Adding a template takes four steps, each independently enforced: add the id to `style-templates.ts`; add its CSS under `src/styles/themes/` and import it from `index.css` (the roster guard test fails otherwise); add its card to `style-template-display.ts`, which is `satisfies Record<StyleTemplate, StyleTemplateDisplay>` and so fails typecheck while the id is missing; add the editor's label string to i18n. A template that changes page structure also needs a manifest naming the seams it overrides.

**Key files**:
- `apps/self-hosted/src/core/configuration-loader.ts` - Runtime config loading
- `apps/self-hosted/src/core/apply-config-dom.ts` - Applies config to the DOM (`data-style-template`, `data-show-*`, theme tokens)
- `apps/self-hosted/src/providers/sdk/broadcast-adapter.ts` - Auth bridge to SDK
- `apps/self-hosted/src/routes/__root.tsx` - Root layout
- `apps/self-hosted/src/themes/manifest.ts` + `registry.ts` - Theme manifests and seam overrides
- `apps/self-hosted/src/features/claim/` - Unclaimed-subdomain landing and live preview
- `apps/self-hosted/src/features/floating-menu/components/floating-menu-window.tsx` - Configuration Editor (Appearance / Identity / Features / Advanced)

**Deployment**: Docker multi-stage build with Nginx serving static files. `apps/self-hosted/docker-compose.yml` REQUIRES a `TAG` env var, with no default so a moving tag can never be picked by accident. It binds the published port to `127.0.0.1`; set `BIND=0.0.0.0` only when serving directly with no proxy and no HTTPS. See `apps/self-hosted/DEPLOYMENT.md`.

**Cutting a self-hosted release**: `git tag self-hosted-vX.Y.Z && git push origin self-hosted-vX.Y.Z`. That publishes the immutable `vX.Y.Z` and advances `:latest` for both `ecency/self-hosted` and `ecency/hosting-api`. Both images bake `GIT_SHA` and `RELEASE_VERSION` build args. The API's `/health` answers `{status, timestamp, version, sha}` (`api/src/utils/build-info.ts`; version is `'untagged'` on a sha-only build), so blog and API skew is observable in production.

#### @ecency/web - Main Application

**Purpose**: Full-featured Hive web client

**Scope**:
- ✅ All UI components and pages
- ✅ App-specific business logic
- ✅ Feature modules
- ✅ App-specific query wrappers (using both SDK and wallets)
- ✅ State management (Zustand + React Query)

**Dependencies**: All workspace packages + app-specific libraries

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
import { createWebBroadcastAdapter } from "@/providers/sdk";

export function useVoteMutation() {
  const { activeUser } = useActiveAccount();
  const adapter = createWebBroadcastAdapter();
  return useVote(activeUser?.username, { adapter });
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

## Main Application Architecture

### Technology Stack

- **Next.js 15.4** with App Router
- **State Management**: Zustand (global state) + @tanstack/react-query (server state)
- **Styling**: TailwindCSS + SCSS modules
- **Editor**: TipTap
- **Forms**: react-hook-form + yup
- **Blockchain**: @hiveio/dhive, hivesigner, hive-auth-client
- **Monitoring**: Sentry

### Directory Structure

```
apps/web/src/
├── app/                    # Next.js App Router pages & layouts
│   ├── (dynamicPages)/     # Dynamic routes (profiles, entries)
│   ├── (staticPages)/      # Static pages
│   └── api/                # API routes
├── api/                    # API layer
│   ├── queries/            # App-specific React Query queries (most queries now in SDK)
│   ├── mutations/          # App-specific mutation logic (reply, transfer, etc.)
│   ├── sdk-mutations/      # SDK mutation wrappers
│   ├── format-error.ts     # Error formatting utility
│   ├── bridge.ts           # Main API bridge
│   ├── hive.ts            # Hive blockchain API
│   └── private-api.ts      # Ecency private API
├── core/                   # Core infrastructure
│   ├── global-store/       # Zustand global state
│   │   ├── modules/        # State modules (auth, UI, users, etc.)
│   │   └── initialization/ # Client/server initialization
│   ├── react-query/        # React Query configuration
│   └── caches/             # Caching utilities
├── features/               # Feature modules
│   ├── shared/             # Shared feature modules
│   ├── ui/                 # UI component library
│   └── [feature-name]/     # Domain-specific features
├── entities/              # Domain entities/types
├── enums/                 # TypeScript enums
├── utils/                 # Utility functions
├── config/                # Feature flag configuration system
├── routes.ts              # Route definitions
└── middleware.ts          # Next.js middleware
```

### State Management Pattern

**Global State (Zustand)**:
- Located in `src/core/global-store/modules/`
- Separate client/server initialization to support SSR
- Modules: authentication, global, ui, users, notifications, signing-key, config

**Server State (React Query)**:
- Most queries now live in `@ecency/sdk` as query option builders; `src/api/queries/` has app-specific queries only
- SDK mutation wrappers in `src/api/sdk-mutations/`
- App-specific mutation orchestration in `src/api/mutations/`
- `QueryKeys` from `@ecency/sdk` for cache key management
- Separate QueryClient instances for client/server

### Path Aliases

- `@/*` → `src/*`
- `@ui/*` → `src/features/ui/*`

These are configured in:
- `apps/web/tsconfig.json` (TypeScript)
- `apps/web/vitest.config.ts` (Vitest)
- `apps/web/next.config.js` (Webpack)

### Routing Architecture

The app uses Next.js App Router with complex URL rewrites for legacy compatibility:

- Profile pages: `/:author(@.+)/:section`
- Entry pages: `/:category/:author/:permlink`
- Community pages: `/:filter/:community(hive-\d+)`
- Feed pages: `/:filter(hot|created|...)/:tag`

Rewrites are defined in `next.config.js`. Route constants live in `src/routes.ts`.

### Feature Flag System

The `EcencyConfigManager` (`src/config/`) provides:
- Feature flag configuration
- Conditional rendering components
- Environment-based configuration
- Template-based config structure

### API Layer Organization

**API Files**:
- `bridge.ts` - Main API bridge with complex routing logic
- `hive.ts` - Hive blockchain API
- `hive-engine.ts` - Hive Engine token API
- `private-api.ts` - Ecency private API

**Debugging a `/private-api/*` 401:** do not assume the user's token. Requests
go through a proxy that validates the signed code and then pipes the upstream
response through unchanged, so a 401 raised by a backend service is
indistinguishable here from a rejected token. Before touching auth code, check
whether other private-API calls succeed for the same session - if notifications
work while one endpoint 401s, the code validated fine and the cause is
server-side on that route. An endpoint failing for *every* user points at a
backend gate rather than anything the client sends.

Also note that not every query surfaces this: a queryFn that reads
`response.json()` without checking `response.ok` swallows a 401 silently, while
one that throws will retry and produce several console errors per page load. A
noisy endpoint and a quiet one can be failing in exactly the same way.
- `format-error.ts` - Error formatting for user-facing error messages

**Mutation Architecture**:

All blockchain mutations live in `@ecency/sdk` and are wrapped for web use in `apps/web/src/api/sdk-mutations/`. Each wrapper hook:
1. Gets the active user via `useActiveAccount()`
2. Creates a web broadcast adapter via `createWebBroadcastAdapter()`
3. Passes both to the SDK mutation hook

```
@ecency/sdk (platform-agnostic mutations)
    ↓ wrapped by
apps/web/src/api/sdk-mutations/ (web-specific hooks)
    ↓ used by
apps/web/src/api/mutations/ (app-specific orchestration: optimistic updates, error handling)
    ↓ used by
Feature components
```

App-specific mutation logic (optimistic cache updates, error handling, multi-step flows) remains in `apps/web/src/api/mutations/`.

**Cache Key Management**:
- Use `QueryKeys` from `@ecency/sdk` as the single source of truth
- Legacy `QueryIdentifiers` enum still exists for web-app-only queries (polls, threespeak, market)
- New queries should define keys in SDK's `QueryKeys` when possible

### Authentication & Broadcasting

Multi-method authentication support:
- **Private Key** (`key`) - Direct key signing (posting key stored, active via auth upgrade)
- **Keychain** (`keychain`) - Browser extension integration
- **HiveSigner** (`hivesigner`) - OAuth token-based broadcasting
- **HiveAuth** (`hiveauth`) - QR code + mobile app flow

**Broadcast Adapter Pattern** (`apps/web/src/providers/sdk/web-broadcast-adapter.ts`):

The SDK uses a platform adapter pattern to decouple mutations from auth. The web app provides `createWebBroadcastAdapter()` which implements the `PlatformAdapter` interface:

```
SDK mutation (platform-agnostic)
    ↓ calls adapter methods
Web Broadcast Adapter (web-specific)
    ↓ resolves auth via
localStorage (keys/tokens) → Keychain extension → HiveSigner API → HiveAuth protocol
```

**Smart Auth Strategy** (in SDK's `useBroadcastMutation`):
1. Calls `adapter.getLoginType()` to determine user's auth method
2. For posting ops with granted posting authority: tries HiveSigner token first (faster)
3. Falls back to user's actual auth method if token fails
4. For active ops: shows auth upgrade dialog via `adapter.showAuthUpgradeUI()`

**Auth Upgrade Flow** (`apps/web/src/features/shared/auth-upgrade/`):

When an operation requires active authority but the user logged in with posting key:
1. SDK detects auth failure → calls `adapter.showAuthUpgradeUI()`
2. Web adapter dispatches `ecency-auth-upgrade` CustomEvent
3. Auth upgrade dialog appears, user selects method (enter active key, use Keychain, etc.)
4. Dialog resolves the promise with chosen method + optional temp key
5. SDK retries broadcast with the chosen method
6. Temp active key auto-clears after 60s or on next auth flow

## Testing

### Test Structure

The web app uses Vitest + React Testing Library. Tests are located in `src/specs/`:
- `core/` - Core functionality tests (React Query helpers, hooks)
- `features/` - Component tests organized by feature
- `utils/` - Utility function tests

### Running Tests

```bash
# All tests
pnpm test

# Specific test file
pnpm test path/to/test.spec.tsx

# Watch mode
pnpm test --watch

# Update snapshots
pnpm test -u

# UI mode
pnpm test --ui
```

### Test Utilities

Use `src/specs/test-utils.tsx` for common testing patterns:

```typescript
import { renderWithQueryClient, mockFullAccount, setupModalContainers } from '@/specs/test-utils';

describe('MyComponent', () => {
  beforeEach(setupModalContainers);

  test('renders correctly', () => {
    const { container } = renderWithQueryClient(
      <MyComponent />,
      { queryClient: seedQueryClient({ posts: mockData }) }
    );
  });
});
```

### Mocking Strategy

**Global Mocks** (`setup-any-spec.ts`):
- External packages (@ecency/sdk, @ecency/wallets, @ecency/render-helper)
- i18next (returns keys as-is)
- `@/utils` (only exports `random` and `getAccessToken`)
- `@/core/hooks/use-active-account` (returns null active user)
- uuid, react-tweet

**Per-Test Mocks**:
- API queries/mutations specific to the component
- Component-specific dependencies

**Important: `@/utils` Global Mock Limitation**

The global mock for `@/utils` only provides `random` and `getAccessToken`. If your component imports other utilities (e.g., `parseAsset`, `dateToFormattedUtc`, `formatNumber`), the test will fail with "No export is defined on the mock." Fix by adding a local re-mock with `importActual` at the top of your test file:

```typescript
vi.mock("@/utils", async () => ({
  ...(await vi.importActual("@/utils")),
  random: vi.fn(),
  getAccessToken: vi.fn(() => "mock-token")
}));
```

This preserves all real utility exports while keeping the globally-mocked functions stubbed.

### Component Testing Patterns

**1. Utility Functions** (pure functions):
```typescript
import { myUtilFunction } from '@/utils';

describe('myUtilFunction', () => {
  it('should handle edge case', () => {
    expect(myUtilFunction(input)).toBe(expected);
  });
});
```

**2. React Components**:
```typescript
import { render, screen, fireEvent } from '@testing-library/react';
import { renderWithQueryClient } from '@/specs/test-utils';
import { vi } from 'vitest';

describe('MyComponent', () => {
  test('user interaction', () => {
    renderWithQueryClient(<MyComponent />);
    fireEvent.click(screen.getByRole('button'));
    expect(screen.getByText('Updated')).toBeInTheDocument();
  });
});
```

**3. Components with React Query**:
```typescript
import { QueryClient } from '@tanstack/react-query';
import { vi } from 'vitest';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } }
});

beforeEach(() => {
  queryClient.setQueryData(['key'], mockData);
});

test('displays data', () => {
  renderWithQueryClient(<MyComponent />, { queryClient });
  expect(screen.getByText(mockData.title)).toBeInTheDocument();
});
```

### Best Practices

- ✅ Test user-visible behavior, not implementation details
- ✅ Use `screen.getByRole` over `getByTestId` when possible
- ✅ Mock external dependencies with `vi.fn()`, not internal functions
- ✅ Keep tests focused and isolated
- ✅ Use factories for mock data (see test-utils.tsx)
- ✅ Clean up after tests (DOM, timers, mocks)
- ❌ Don't test library code (React Query, Zustand)
- ❌ Don't mock too much (makes tests brittle)
- ❌ Don't use snapshots for everything (hard to maintain)

### Coverage Requirements

- All new features require tests
- Bug fixes should include regression tests
- Aim for >80% coverage on business logic
- 100% coverage not required for UI components

### Main App (Vitest)

- Test environment: jsdom
- Test location: `src/specs/`
- Test pattern: `*.spec.tsx` co-located with components
- Setup file: `src/specs/setup-any-spec.ts`
- Mocked modules: i18next, @ecency/sdk, @ecency/wallets, @ecency/render-helper
- Configuration: `apps/web/vitest.config.ts`

### Packages (Vitest)

- Each package has its own Vitest configuration
- Test files co-located with source code

## Important Implementation Notes

### Component Development

- Follow feature-based organization in `src/features/`
- Shared components go in `features/shared/`
- UI primitives go in `features/ui/`
- Avoid unnecessary re-renders (performance-critical app)
- Create tests for new components

### State Management

- Use Zustand for client-side global state
- Use React Query for server state (API data)
- Check `src/core/global-store/modules/` for existing state modules
- Query identifiers defined in centralized enum

### Styling

- TailwindCSS is primary styling method
- Dark mode via `class` strategy
- SCSS modules for component-specific styles
- Custom theme in `tailwind.config.ts`
- **Icon sizing (docs/icons.md):** every UI glyph is sized by exactly one Tailwind `size-N`
  class (`size-3.5|4|5|6`; default `size-4`) or by a sanctioned slot (Button `icon=`,
  InputGroup, DropdownItemWithIcon — slot icons carry no size class, or exactly one
  `!size-N` to deliberately diverge). Never write `svg { width/height }` in SCSS/CSS, never
  pass `size=`/`width=`/`height=` to an icon, never pair `w-N h-N` on a glyph. Hand-rolled
  element exports always render inside a both-axes sink:
  `<span className="inline-flex shrink-0 size-4 [&>svg]:size-full">{fooSvg}</span>`.
  Exemptions carry `data-icon-exempt` and live in `scripts/icon-scss-manifest.json`.
  **Enforcement is active and will fail CI**: the ESLint icon rules are errors, and
  `scripts/icon-tsx-audit.mjs --fail` plus `scripts/icon-scss-audit.mjs` run in the
  typecheck workflow — the latter also fails if a retired SCSS rule reappears. The
  absence check reads literal classNames only, so a dynamically built one
  (`clsx(cond && "size-4")`, `className ?? "size-4"`) can slip past; see the gap
  section in docs/icons.md. Any PR changing an icon's size mechanism includes
  before/after staging screenshots — tests cannot see pixels. Decorative icons take
  `aria-hidden`.

### Code Quality

- TypeScript strict mode enabled
- All new code should include proper types
- ESLint and type checking ignored during builds (check before commit)
- Run `pnpm lint` and `pnpm test` before creating PRs

### Internationalization

- All new strings must be added to `en-US.json` only
- Use i18next for translations
- Translation system in `src/features/i18n/`

### Pull Requests

- Branch from `develop` (not `master`)
- Include tests with changes
- Update tests if modifying existing code
- Mark PR as WIP if not ready
- Include description, screenshots/videos, and link to issues
- Ensure linting and tests pass before requesting review

## Environment Configuration

Copy `apps/web/.env.template` to `apps/web/.env` and configure:

```bash
NEXT_PUBLIC_HS_CLIENT_ID      # HiveSigner client ID
NEXT_PUBLIC_HS_CLIENT_SECRET  # HiveSigner secret
NEXT_PUBLIC_APP_BASE          # App base URL
NEXT_PUBLIC_APP_NAME          # App name
NEXT_PUBLIC_APP_TITLE         # App title
NEXT_PUBLIC_APP_DESCRIPTION   # App description
```

See README.md for detailed environment variable documentation.

## Package Manager

This project uses **pnpm@11.5.0** and **Node.js >= 22.12** (CI runs Node 24; see `.nvmrc`). The `packageManager` field in `package.json` ensures the correct pnpm version is used. pnpm 11 reads workspace settings (`overrides`, `allowBuilds`, etc.) from **`pnpm-workspace.yaml`**, not the old package.json `pnpm` field. A dependency that ships an install/build script must be reviewed and added to `allowBuilds` in `pnpm-workspace.yaml` (`strictDepBuilds` fails the install otherwise). Always run commands from the workspace root unless specifically targeting a package.

## Production Build

The production build:
- Generates UUID-based build IDs
- Enables production browser source maps
- Includes PWA support (8MB cache limit)
- Integrates Sentry for error tracking
- Transpiles workspace packages
- Uses sass-embedded for fast SCSS compilation

## Deployment topology (operational context)

- `apps/web/docker-compose.yml` (staging) and `apps/web/docker-compose.production.yml` (prod) define the **whole `vision` swarm stack** — including the `vapi` service (the separate [vision-api](https://github.com/ecency/vision-api) C#/.NET proxy, image `ecency/api`), `web`, and supporting services.
- CI deploys: push to `develop` → staging stack deploy (`staging.yml`, which path-ignores `apps/self-hosted/hosting/**`); push to `main` → production stack deploy in BOTH regions (`deploy-EU` and `deploy-US` in `master.yml`, each running `docker stack deploy` against its own host). vision-api's own CI independently updates the running `vision_vapi` service by image digest.
- **A stack deploy from this repo resets the full service spec of every service in the stack** (including `vapi`: image back to `:latest`, env, logging options) to what these compose files declare. Anything applied out-of-band with `docker service update` is overwritten — durable service settings belong in these files.

### Managed blog hosting (`apps/self-hosted/hosting`)

- `self-hosted.yml` runs on pushes to `develop` and `main`, on `self-hosted-v*` tag pushes and on pull requests to `develop`/`main`, but **only `develop` deploys**. Both branches previously deployed, with identical jobs pointing at the same host and the same compose project, so whichever ran last won.
- Image tags: every build gets `sha-<7>`; `develop` and `main` are moving channel tags. A `self-hosted-vX.Y.Z` tag push is the ONLY thing that publishes an immutable `vX.Y.Z` and advances `:latest`. The tag must match `^self-hosted-v[0-9]+\.[0-9]+\.[0-9]+$` or the job fails. `self-hosted-v1.0.0` is the first release, cut 2026-08-12.
- **Path filters are not evaluated for tag pushes.** The `paths:` list gates branch pushes only, so a release tag builds whatever the tagged commit contains.
- Pull requests run the unit tests plus a real package and app build, with no secrets, no image push and no deploy. Tag pushes build and publish without deploying.
- The deploy copies a **fixed list** of files to the host: `docker-compose.yml`, `nginx-multi-tenant.conf`, `default-config.json` and `db/*`. Adding a file next to them does not deploy it.
- **This means an edit made directly on the host to any of those files is reverted by the next deploy.** A fix to `nginx-multi-tenant.conf` applied on the box was silently undone this way; changes to those files belong in the repo.
- `hosting/origin/` holds the config that lives on the host itself (edge nginx vhost, certificate automation). It is tracked for review and restore only — **not deployed by CI**, applied by hand via its `install.sh`, so the host stays the source of truth and on-box changes must be copied back. See its README.
- `hosting/traefik/` is **unused**. Traefik is not in the stack and nothing loads it. Its `dynamic/middlewares.yml` sets `X-Robots-Tag: noindex, nofollow` on every response, which would deindex every tenant blog if it were ever wired in.
- There is **no staging tier**: a merge to `develop` deploys straight to the host serving live blogs.

**The claim flow.** nginx serves the shared `hosting/default-config.json` for any `*.blogs.ecency.com` host with no tenant row. That document carries `"template": true`. The SPA reads the flag and renders `src/features/claim/claim-landing.tsx`, a claim CTA, instead of a blog. Blog vs community is derived from the hostname label, where `hive-<digits>` reads as a community (`parse-claim-target.ts`). Two details matter:

- **`noindex` is set at RUNTIME, gated on the same `template` flag**, not written statically into the served HTML. A static noindex would deindex a live blog during any moment its config was missing.
- `?preview=1` (`CLAIM_PREVIEW_PARAM`) boots straight into a read-only live preview of the real blog behind a persistent banner, which is what the CTA "See a live preview first" links to. Nothing is created and no tenant row exists at this point.

**The signup funnel customizes BEFORE payment.** `apps/web/src/features/hosting-signup/hosting-signup.tsx` runs `username` → `customize` → `payment` → `success`. The customize step picks template, accent and font preset, then persists a draft under `ecency:hosting:customize:${name}`, so someone who abandons at payment does not lose their choices. Payment defaults to card, with HBD via Keychain or a manual transfer as the alternative.

**The free path creates no tenant.** `self-host-bundle.ts` emits `config.json`, `docker-compose.yml`, `.env`, `Caddyfile` and a README as a hand-written store-format (uncompressed) ZIP, deliberately with no zip dependency in the monorepo. That branch never calls `createTenant`, so a visitor can leave `/hosting` with a ready-to-run bundle and cost nothing. `POST /v1/tools/compose-config` composes the same config server-side for an independent deployment, stripping the markers that only make sense here (`managed`, `template`, `claimPreview`, Ecency's `hivesigner.clientId`).

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
