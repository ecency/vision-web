---
name: debug
description: Debug common issues in the vision-web Hive web app with known solutions and investigation patterns
argument-hint: [issue-description]
disable-model-invocation: true
---

# Debug Guide

Investigate and fix issues in the Ecency Vision-Next codebase. Start by identifying the category.

## Issue Categories

### 1. Post Not Loading / "Deleted" Shown Incorrectly

**Symptoms**: Post shows as deleted, 404, or loading forever

**Investigation**:
1. Check `apps/web/src/app/(dynamicPages)/entry/[category]/[author]/[permlink]/` components
2. Look at `entry-not-found-fallback.tsx` — handles the "not found on primary node" flow
3. Check `packages/sdk/src/modules/bridge/verify-on-alternate-node.ts` — verifies post exists on other Hive API nodes

**Known issues**:
- **Race condition**: `isVerifying` guard must check `hasTransitioned` to prevent showing deleted screen after successful verification
- **Response validation**: `verify-on-alternate-node` must validate `response.author === author && response.permlink === permlink` — don't trust any truthy response
- **RPC node failover**: The active node can change mid-request. Don't snapshot `CONFIG.hiveClient.currentAddress` before async operations

**RPC node configuration**: `apps/web/public/public-nodes.json`

### 2. Memory Leaks / Performance

**Common leak sources found in this codebase**:

| Hook/Component | Issue | Fix |
|---|---|---|
| `useIsMobile` | Missing removeEventListener | Return cleanup from useEffect |
| `useCountdown` | Missing clearInterval | Return cleanup from useEffect |
| `HiveMarketRateListener` | Module-level `let` for interval | Use `useRef` instead |
| `useUploadTracker` | setTimeout without cleanup | Store timeout ID, clear on unmount |
| React Query cache | No `gcTime` configured | Set explicit gcTime on QueryClient |

**Investigation pattern**:
1. Search for `addEventListener` without matching `removeEventListener`
2. Search for `setInterval`/`setTimeout` without cleanup in useEffect return
3. Search for module-level `let` variables in React components/hooks
4. Check React Query QueryClient config for missing `gcTime`/`staleTime`

### 3. Authentication / Broadcast Failures

**Auth methods**: key (direct), keychain (extension), hivesigner (OAuth), hiveauth (QR)

**Investigation**:
1. Check which auth method: `adapter.getLoginType()` in web broadcast adapter
2. Check authority level: posting vs active — see `AuthorityLevel` in `use-broadcast-mutation.ts`
3. Auth upgrade flow: `apps/web/src/features/shared/auth-upgrade/`

**Known issues**:
- **HiveSigner token expired**: Token refresh at `/api/hs-token-refresh` route
- **Posting authority not granted**: HiveSigner optimization skipped, falls back to user's auth method
- **Auth upgrade dialog not appearing**: Check `ecency-auth-upgrade` CustomEvent dispatch in web-broadcast-adapter.ts
- **Single-flight race condition**: If two mutations trigger auth upgrade simultaneously, only one dialog resolves

### 4. Third-Party Browser Issues

**Twitter/X in-app browser**:
- Error: `Can't find variable: CONFIG` — caused by Twitter widget scripts expecting global `window.CONFIG`
- Fix: Defensive stub in `apps/web/src/app/layout.tsx` that sets `window.CONFIG = window.CONFIG || {}`

### 5. Image Issues

**Zoom positioning (medium-zoom)**:
- First click shows image off-center — library initialized before images loaded
- Fix: Wait for all images to load (`img.complete && img.naturalHeight !== 0`) before initializing medium-zoom
- Files: `features/post-renderer/components/utils/imageZoomEnhancer.ts`

### 6. Infinite Scroll Issues

**Symptoms**: Runaway fetching, lost content on scroll back

**Investigation**:
1. Check `getNextPageParam` — must return `undefined` (not `null`) to stop pagination
2. Check `initialPageParam` type
3. Verify React Query infinite query is not refetching all pages on window focus

### 7. SDK Changes Not Taking Effect

```bash
# Always rebuild after SDK changes
pnpm --filter @ecency/sdk build

# Or rebuild all packages
pnpm build:packages
```

The web app imports from `packages/sdk/dist/`, not source files.

## General Investigation Steps

1. **Reproduce**: Identify exact steps and which component/page is affected
2. **Find the component**: Use file structure — `app/(dynamicPages)/` for dynamic routes, `features/` for feature modules
3. **Check React Query**: Look at query keys, enabled conditions, error handling
4. **Check SDK layer**: If data-related, trace from web wrapper → SDK mutation/query → Hive RPC call
5. **Check state**: Zustand stores in `core/global-store/modules/`, React Query cache
6. **Run tests**: `pnpm test -- <relevant-test-file>`

## Useful Commands

```bash
# Check for common issues
pnpm lint
pnpm typecheck
pnpm test

# Run specific test
pnpm --filter @ecency/web test -- path/to/test.spec.tsx
pnpm --filter @ecency/sdk test -- path/to/test.spec.ts

# Check bundle
pnpm --filter @ecency/sdk build
```
