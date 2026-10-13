---
paths:
  - "apps/web/**"
---

# Web app (`apps/web`)

## @ecency/web - Main Application

**Purpose**: Full-featured Hive web client

**Scope**:
- ✅ All UI components and pages
- ✅ App-specific business logic
- ✅ Feature modules
- ✅ App-specific query wrappers (using both SDK and wallets)
- ✅ State management (Zustand + React Query)

**Dependencies**: All workspace packages + app-specific libraries

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
4. Dialog resolves the promise with chosen method + optional active key
5. SDK retries broadcast with the chosen method
6. An active key entered here is held in memory
   (`apps/web/src/utils/session-active-key.ts`) for as long as the page is open,
   on a sliding two hour idle window that every use pushes out. So a run of
   active-authority operations asks for it once, however long the run lasts,
   while an unattended tab drops it. A master password, seed or active-key login
   holds the same key, so those users never see the dialog for an active op.

   Deliberately not `sessionStorage`, which is not the tab-scoped secret it looks
   like: closing a tab does not destroy it (Chrome keeps it for "reopen closed
   tab" and for session restore) and a duplicated tab starts with a copy. A
   module variable dies with the document, never reaches disk and cannot be read
   from another tab. The cost is one prompt after a reload; client-side
   navigation keeps the key. The idle window is gated on a timestamp rather than
   only on the timer, since a background tab's timers are throttled and a
   suspended machine runs none. The record is scoped to the username that entered
   it and checked against the shared `active_user` entry on every read. It is
   dropped on logout, on account switch and whenever a new active-authority
   dialog opens, at which point the held key has already failed to sign.

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

### Internationalization

- All new strings must be added to `en-US.json` only
- Use i18next for translations
- Translation system in `src/features/i18n/`

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

## Production Build

The production build:
- Generates UUID-based build IDs
- Enables production browser source maps
- Includes PWA support (8MB cache limit)
- Integrates Sentry for error tracking
- Transpiles workspace packages
- Uses sass-embedded for fast SCSS compilation
