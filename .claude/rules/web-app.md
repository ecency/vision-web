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
- `apps/web/vitest.config.mts` (Vitest)
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
1. Gets the active username via `useActiveUsername()`
2. Takes the shared web broadcast adapter via `getWebBroadcastAdapter()`
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

Auth methods, the broadcast adapter pattern, the smart auth strategy and the auth upgrade
flow are in `.claude/rules/auth-broadcast.md`, which also loads for `packages/sdk/src/**`.

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
- Icon sizing has its own rule, `.claude/rules/icons.md`, enforced by CI in both apps

### Internationalization

- All new strings must be added to `en-US.json` only
- Use i18next for translations
- Translation system in `src/features/i18n/`

## Environment Configuration

Copy `apps/web/.env.template` to `apps/web/.env` and configure:

```bash
HIVESIGNER_CLIENT_ID          # HiveSigner client ID (server-only)
HIVESIGNER_SECRET             # HiveSigner secret (server-only)
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
