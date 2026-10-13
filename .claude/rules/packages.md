---
paths:
  - "packages/**"
---

# Workspace packages (`packages/*`)

Boundaries between packages (what goes where, DO and DO NOT) are in the root `CLAUDE.md`.

## Package Build Strategy

Packages use **dual builds** (tsup) to optimize for different environments:
- **Browser build**: ESM with TypeScript declarations
- **Node build**: ESM + CJS for SSR compatibility

Exports are platform-specific via package.json `exports` field.

## @ecency/sdk - Core Hive SDK

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

## @ecency/wallets - Multi-chain Wallet Management

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

## @ecency/render-helper - Markdown Rendering Utilities

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

## @ecency/ui - Shared UI Component Library

**Purpose**: Shared React UI components used across apps

**Scope**:
- ✅ Reusable React UI components
- ✅ Shared between web and self-hosted apps

**Why separate**: Avoids duplicating UI primitives across multiple apps in the monorepo.

## Packages (Vitest)

- Each package has its own Vitest configuration
- Test files co-located with source code

## Publishing Packages

```bash
# Build before publishing
pnpm build:packages

# Publish individual packages
pnpm publish:sdk
pnpm publish:wallets
pnpm publish:render-helper
pnpm publish:ui
```
