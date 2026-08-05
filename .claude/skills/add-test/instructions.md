---
name: add-test
description: Add tests for a component or utility in the vision-web app following established patterns and avoiding common pitfalls
argument-hint: [component-or-file-path]
disable-model-invocation: true
---

# Add Test

Write tests for components or utilities in the Ecency Vision web app.

## Step 1: Determine Test Location

| Source location | Test location |
|---|---|
| `src/features/<domain>/` | `src/specs/features/<domain>/` |
| `src/features/shared/` | `src/specs/features/shared/` |
| `src/utils/` | `src/specs/utils/` |
| `src/api/` | `src/specs/api/` |
| `src/core/` | `src/specs/core/` |

Test files use the pattern `<component-name>.spec.tsx` (or `.spec.ts` for non-React).

## Step 2: Understand Global Mocks

The setup file `src/specs/setup-any-spec.ts` globally mocks these modules in every test:

| Module | What's provided | What's NOT provided |
|---|---|---|
| `@ecency/sdk` | ConfigManager, CONFIG, getAccountFullQueryOptions, getPointsQueryOptions, getBookmarksQueryOptions, and ~10 more | Most query options, most mutation hooks |
| `@ecency/wallets` | validateKey, validateWif, EXTERNAL_BLOCKCHAINS, EcencyWalletCurrency | Most wallet queries |
| `@/utils` | **Only `random` and `getAccessToken`** | parseAsset, dateToFormattedUtc, formatNumber, and 70+ other exports |
| `@/core/hooks/use-active-account` | useActiveAccount returning null user | - |
| `i18next` | `t()` returns the key as-is | - |
| `react-tweet` | Empty object | - |

### Critical: @/utils Mock Limitation

If your component imports anything from `@/utils` beyond `random`/`getAccessToken`, you MUST add a local re-mock at the top of your test file:

```typescript
vi.mock("@/utils", async () => ({
  ...(await vi.importActual("@/utils")),
  random: vi.fn(),
  getAccessToken: vi.fn(() => "mock-token")
}));
```

Without this, tests fail with: `No "<export>" export is defined on the "@/utils" mock`.

## Step 3: Choose Test Pattern

### Pure Utility Functions

```typescript
import { describe, it, expect } from "vitest";
import { myFunction } from "@/utils/my-function";

describe("myFunction", () => {
  it("should handle normal input", () => {
    expect(myFunction("input")).toBe("expected");
  });

  it("should handle edge cases", () => {
    expect(myFunction("")).toBe("");
    expect(myFunction(undefined)).toBeNull();
  });
});
```

### React Components (no queries)

```typescript
import { render, screen, fireEvent } from "@testing-library/react";
import { vi } from "vitest";
import { MyComponent } from "@/features/shared/my-component";

describe("MyComponent", () => {
  test("renders content", () => {
    render(<MyComponent title="Hello" />);
    expect(screen.getByText("Hello")).toBeInTheDocument();
  });

  test("handles click", () => {
    const onClick = vi.fn();
    render(<MyComponent onClick={onClick} />);
    fireEvent.click(screen.getByRole("button"));
    expect(onClick).toHaveBeenCalled();
  });
});
```

### React Components with React Query

```typescript
import { screen } from "@testing-library/react";
import { vi } from "vitest";
import { useQuery } from "@tanstack/react-query";
import { renderWithQueryClient } from "@/specs/test-utils";

// Mock React Query
vi.mock("@tanstack/react-query", async () => ({
  ...(await vi.importActual("@tanstack/react-query")),
  useQuery: vi.fn()
}));

// Mock SDK query options your component uses
vi.mock("@ecency/sdk", async () => ({
  ...(await vi.importActual("@ecency/sdk")),
  getSomeQueryOptions: vi.fn(() => ({ queryKey: ["some"], queryFn: vi.fn() }))
}));

describe("MyQueryComponent", () => {
  beforeEach(() => {
    vi.mocked(useQuery).mockReturnValue({
      data: { /* mock data */ },
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn()
    } as any);
  });

  test("displays data", () => {
    renderWithQueryClient(<MyQueryComponent />);
    expect(screen.getByText("expected text")).toBeInTheDocument();
  });
});
```

### Multiple Queries (queryKey-based switching)

When a component calls `useQuery` multiple times with different options:

```typescript
vi.mocked(useQuery).mockImplementation(({ queryKey }: any) => {
  if (queryKey[0] === "account") {
    return { data: mockAccount, isLoading: false } as any;
  }
  if (queryKey[0] === "points") {
    return { data: mockPoints, isLoading: false } as any;
  }
  return { data: null, isLoading: false } as any;
});
```

### Components with Dynamic Imports

When the component must be imported after mocks are set up:

```typescript
// Set up all vi.mock() calls first, then:
let MyComponent: typeof import("@/features/shared/my-component").MyComponent;

beforeAll(async () => {
  const mod = await import("@/features/shared/my-component");
  MyComponent = mod.MyComponent;
});
```

## Step 4: Mock Active User (when needed)

```typescript
import { useActiveAccount } from "@/core/hooks/use-active-account";

// For logged-in user:
vi.mocked(useActiveAccount).mockReturnValue({
  activeUser: { username: "testuser" },
  username: "testuser",
  account: { name: "testuser", /* ... */ },
  isLoading: false,
  isPending: false,
  isError: false,
  isSuccess: true,
  error: null,
  refetch: vi.fn()
} as any);

// For anonymous user (default from global mock):
// No override needed - global mock returns null activeUser
```

## Step 5: Use Test Utilities

```typescript
import {
  renderWithQueryClient,  // Wraps component with QueryClientProvider
  mockFullAccount,         // Creates a full mock Hive account
  mockEntry,               // Creates a mock blog entry/post
  setupModalContainers     // Sets up DOM containers for modals
} from "@/specs/test-utils";
```

## Step 6: Run Tests

```bash
# Run your new test
pnpm --filter @ecency/web test -- path/to/test.spec.tsx

# Run all tests to verify no regressions
pnpm --filter @ecency/web test
```

## Common Gotchas

1. **@/utils mock** - Only `random` and `getAccessToken` are globally mocked. Use `importActual` pattern for components that import other utilities.
2. **SDK mock** - The global mock only covers ~15 SDK exports. If your component uses others, add them to your local mock.
3. **useActiveAccount** - Globally mocked to return null. Override in beforeEach for logged-in user tests.
4. **i18next** - `t("key")` returns the key string. Test against i18n keys, not translated text.
5. **Async rendering** - Use `waitFor` or `findBy*` queries for components that update after useEffect/useQuery.
6. **Modal containers** - Call `setupModalContainers()` in beforeEach if component renders portals/modals.
7. **next/navigation** - Mock `useParams`, `useRouter`, `usePathname` etc. when component uses them:
   ```typescript
   vi.mock("next/navigation", () => ({
     useParams: vi.fn(() => ({ username: "testuser" })),
     useRouter: vi.fn(() => ({ push: vi.fn(), back: vi.fn() })),
     usePathname: vi.fn(() => "/")
   }));
   ```

## Checklist

- [ ] Test file in correct `src/specs/` subdirectory
- [ ] @/utils re-mocked with importActual if needed
- [ ] All SDK/wallet imports used by component are mocked
- [ ] Tests cover: normal rendering, edge cases (empty/null data), user interactions
- [ ] `pnpm --filter @ecency/web test` passes (all tests, not just new ones)
