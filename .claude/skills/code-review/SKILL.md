---
name: code-review
description: Review code changes for bugs, patterns violations, and common pitfalls in the vision-web codebase
argument-hint: [file-or-branch]
disable-model-invocation: true
---

# Code Review

Review code for bugs, anti-patterns, and common issues specific to this codebase.

## How to Review

1. **Read the changed files** — understand what changed and why
2. **Verify each finding against current code** — don't assume; read the actual file before flagging
3. **Categorize findings** by severity:
   - **Inline (must fix)**: Bugs, security issues, data corruption risks
   - **Outside-diff (should fix)**: Issues in unchanged code exposed by the change
   - **Nitpick (nice to have)**: Style, naming, test quality improvements
4. **Only fix what's confirmed** — if a finding doesn't apply to current code, skip it

## What to Check

### React & Hooks
- [ ] **Missing cleanup in useEffect** — every addEventListener needs removeEventListener, every setInterval needs clearInterval returned from useEffect cleanup
- [ ] **Missing dependencies** in useMemo/useCallback/useEffect dependency arrays
- [ ] **setState on unmounted components** — setTimeout/async callbacks may fire after unmount
- [ ] **Module-level `let` variables** in hooks — multiple instances overwrite each other (use `useRef` instead)
- [ ] **Stale state in callbacks** — event handlers capturing stale closure values

### React Query
- [ ] **Undefined parameter guards** — query options must return `{ enabled: false }` when params are missing (fetchQuery bypasses `enabled`)
- [ ] **Cache key consistency** — use `QueryKeys` from `@ecency/sdk`, never hardcoded arrays
- [ ] **Missing invalidation** — mutations should invalidate affected queries
- [ ] **Infinite query pageParam** — verify getNextPageParam returns undefined (not null) to stop pagination

### SDK & Architecture
- [ ] **Package boundary violations** — heavy deps in SDK, app logic in packages, circular imports
- [ ] **Mutation authority level** — posting vs active key requirement must match the Hive operation
- [ ] **Platform-specific code in SDK** — toasts, i18n, DOM access belong in web app, not SDK
- [ ] **Missing SDK rebuild** — changes to packages/sdk won't be visible to web until `pnpm --filter @ecency/sdk build`

### Hive Blockchain Specific
- [ ] **RPC response validation** — don't trust API responses blindly; verify author/permlink identity on get_post responses
- [ ] **Node failover gotcha** — don't snapshot `CONFIG.hiveClient.currentAddress` before async operations; the active node may change mid-request
- [ ] **DMCA filtering** — post queries should use `filterDmcaEntry`
- [ ] **Null RPC responses** — some bridge methods return null for missing data; handle gracefully instead of throwing

### CSS/Styling
- [ ] **Conflicting Tailwind utilities** — e.g., `cursor-pointer` and `cursor-not-allowed` on same element
- [ ] **Missing AnimatePresence** — framer-motion `exit` prop needs `AnimatePresence` wrapper to work
- [ ] **Dark mode** — new styles should support `dark:` variants

### Common Bug Patterns Found in This Codebase

1. **Race conditions in state transitions** — component shows stale UI after async operation completes (fix: add guard flags like `hasTransitioned`)
2. **Silent no-ops in switch cases** — empty case blocks that silently do nothing (e.g., hivesigner case in auth)
3. **Interval-based polling decoupled from actual data** — using setInterval to increment a counter instead of reacting to React Query's `dataUpdatedAt`
4. **Conflating errors with empty data** — treating query errors the same as "no data found" (e.g., showing "deleted" when it was actually a network error)
5. **Position-based array operations** — using `.slice(1)` when identity-based `.filter()` is needed (e.g., excluding primary node)
6. **Paste handlers masking validation** — unconditionally clearing warnings before validation runs

## Output Format

For each finding, provide:
```
**[SEVERITY]** file:line — Description
- What's wrong
- Why it matters
- Suggested fix
```

Severities: `BUG`, `SECURITY`, `PERF`, `STYLE`, `NITPICK`
