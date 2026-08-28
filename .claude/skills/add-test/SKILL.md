---
name: add-test
description: Use when writing, fixing, or running a Vitest spec for the apps/web Next.js app (add a test for a component or util, a new spec vitest never picks up, or a mock error such as no export defined on the @/utils mock).
argument-hint: [component-or-file-path]
---

# Add Test

Procedure for `apps/web` (`@ecency/web`) specs. Background you should not re-read here:

- CLAUDE.md "Testing" covers mocking strategy, best practices and coverage expectations.
- `apps/web/src/specs/README.md` covers most `test-utils.tsx` exports (`renderWithQueryClient`,
  `createTestQueryClient`, `seedQueryClient`, `mockFullAccount`, `mockEntry`, `mockCommunity`,
  `mockActiveUser`, `setupModalContainers`, `cleanupModalContainers`, `EntryBuilder`,
  `AccountBuilder`). It does not mention `mockFeatureFlags` or `waitForMs`, so read
  `test-utils.tsx` itself before assuming a helper is missing.

This file only covers the four things that actually break.

## 1. Where the file goes

`apps/web/vitest.config.mts` (the config is `.mts`, not `.ts`):

```ts
include: ['src/specs/**/*.spec.{ts,tsx}']
```

A spec outside `src/specs/` is never collected, so it silently never runs. All 372 spec files
live under `apps/web/src/specs/`; zero are co-located with source. Two lines in CLAUDE.md's
"Main App (Vitest)" bullet list are stale: the "co-located" test pattern plus
"Configuration: `apps/web/vitest.config.ts`". Its "Test Structure" section has the right
location but lists only three of the nine places specs actually live.

Pick the subdirectory matching the source area. Current counts: `features/` 211, `utils/` 51,
`api/` 41, `app/` 40, `core/` 19, `deploy/` 3, `config/` 2, `scripts/` 1, plus 4 at the root.
The mirror is a convention, the `include` glob is the only thing enforced.

## 2. Run one spec

```bash
# from the workspace root; path is relative to apps/web
pnpm test src/specs/features/shared/my-thing.spec.tsx
```

**Never add `--`.** pnpm forwards it literally, so vitest runs `vitest run -- <path>` and files
everything after `--` under passthrough args instead of its file filters. No filter is applied
and the entire suite runs. Measured here on 2026-08-28:

| Command | Result |
|---|---|
| `pnpm --filter @ecency/web test -- src/specs/api/mattermost-dm-fanout-ordering.spec.ts` | 372 files, 3672 tests, 40.4s |
| `pnpm test src/specs/api/mattermost-dm-fanout-ordering.spec.ts` | 1 file, 4 tests, 689ms |
| `pnpm --filter @ecency/web test src/specs/api/mattermost-dm-fanout-ordering.spec.ts` | 1 file, 4 tests, 1.22s |

Run the whole suite with `pnpm test` before pushing. The PR gate is `PR-branch.yml`
(triggered on `pull_request`); it runs `pnpm build:packages` ahead of `pnpm -r test`, because
`apps/web` resolves `@ecency/sdk` to the committed `packages/sdk/dist`. A local `pnpm test`
runs against whatever dist is checked out, so rebuild the packages yourself after touching SDK
source. The same `pnpm -r test` also runs post-merge in `web-build.yml` (push to `develop`),
`staging.yml` and `master.yml`; none of those three gate a PR.

## 3. Global mocks and their exact limits

`src/specs/setup-any-spec.ts` mocks, with real export counts:

| Module | Provided |
|---|---|
| `@ecency/sdk` | 73 explicit exports, plus the real `modules/moderation`, `modules/newsletter/errors` and `modules/search/query-builder` spread in |
| `@ecency/wallets` | exactly 5: `validateKey`, `validateWif`, `EXTERNAL_BLOCKCHAINS`, `useGetHiveEngineTokensBalances`, `EcencyWalletCurrency` |
| `@/utils` | exactly 2: `random`, `getAccessToken` |
| `@/core/hooks/use-active-account` | `useActiveAccount` returning a null `activeUser` |
| `i18next` | default export only. `default.t()` returns the key verbatim, so assert on i18n keys; there is no named `t` export |
| `uuid` | `v4()` returns `"test-uuid-1234"` |
| `@/features/post-renderer`, `@/features/pro/pro-badge`, `react-tweet` | stubbed to no-ops |

It also polyfills `TextEncoder`, `TextDecoder` and `IntersectionObserver` for jsdom.
`@ecency/render-helper` is **not** globally mocked despite CLAUDE.md listing it; mock it locally.

Touching any export the mock omits throws at property access:

```
[vitest] No "parseAsset" export is defined on the "@/utils" mock. Did you forget to return it from "vi.mock"?
```

Fix with a local re-mock. 38 of the 54 specs that re-mock `@/utils` spread the real module back
in and stub on top of it, which is the shape to copy:

```ts
vi.mock("@/utils", async () => ({
  ...(await vi.importActual<typeof import("@/utils")>("@/utils")),
  random: vi.fn(),
  getAccessToken: vi.fn(() => "mock-token")
}));
```

The same `importActual` spread is how 28 specs widen `@ecency/sdk` past the 73 stubs.

## 4. Import jest-dom yourself

`@testing-library/jest-dom` is not registered in the setup file. All 84 specs that call
`toBeInTheDocument` import it directly:

```ts
import "@testing-library/jest-dom";
```

## The house pattern

Real, passing reference: `apps/web/src/specs/features/wallet/profile-wallet-pending-earnings.spec.tsx`.
It diverges from the block below on two points, so read it for the layout rather than the
mocks: it declares a local `vi.mock("@/core/hooks/use-active-account")` (one of the 2 specs out
of 21 that bother) and its `@/utils` factory spreads `importActual` without re-stubbing
`random` or `getAccessToken`.

Use `it()` (2806 uses against 249 for `test()`). Put the subject import below the `vi.mock`
calls as 104 specs do, since `vi.mock` hoists either way.

```ts
import { vi, describe, it, expect, beforeEach } from "vitest";
import { screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import { renderWithQueryClient } from "@/specs/test-utils";
import { useActiveAccount } from "@/core/hooks/use-active-account";

vi.mock("@/utils", async () => ({
  ...(await vi.importActual<typeof import("@/utils")>("@/utils")),
  random: vi.fn(),
  getAccessToken: vi.fn(() => "mock-token")
}));
vi.mock("next/navigation", () => ({
  useParams: vi.fn(() => ({ username: "testuser" })),
  useRouter: vi.fn(() => ({ push: vi.fn(), refresh: vi.fn() }))
}));

import { MyComponent } from "@/features/shared/my-component";

describe("MyComponent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // the global mock is already a vi.fn(), so no local re-mock is needed:
    // 19 of the 21 specs that override the active user declare none
    vi.mocked(useActiveAccount).mockReturnValue({
      activeUser: { username: "testuser" },
      username: "testuser",
      account: null,
      isLoading: false,
      isPending: false
    } as ReturnType<typeof useActiveAccount>);
  });

  it("renders the claimable label", () => {
    renderWithQueryClient(<MyComponent />);
    expect(screen.getByText("wallet.claimable-label")).toBeInTheDocument();
  });
});
```

## Components with several queries

Do not reach for a `queryKey` switch first. Exactly one spec does it.
`features/announcement/announcements.spec.tsx` gets away with it only because it replaces
`@ecency/sdk` wholesale, so its own query-options factories hand back distinct keys. Against the
global SDK stubs you would be switching on whatever placeholder key the stub invented.

Prefer feeding the cache with `renderWithQueryClient` (37 specs) or `setQueryData` (28 specs)
over mocking `@tanstack/react-query` at all (18 specs do). When per-call data is unavoidable,
the one spec that needs it, `features/wallet/profile-wallet-pending-earnings.spec.tsx`, switches
on **call order** in 2 of its 3 tests, which couples the test to hook order:

```ts
let call = 0;
vi.mocked(useQuery).mockImplementation(() => {
  const i = call++;
  if (i === 0) return { data: rewards, isPending: false } as any;
  return { data: [], isPending: false } as any;
});
```

## Checklist

- [ ] File is under `apps/web/src/specs/`, named `*.spec.ts` or `*.spec.tsx`
- [ ] `import "@testing-library/jest-dom"` when asserting on the DOM
- [ ] `@/utils` and `@ecency/sdk` re-mocked with `importActual` for anything past the global stubs
- [ ] Assertions target i18n keys, never English strings
- [ ] `pnpm test <path>` passes with no `--`, then `pnpm test` for the full suite
