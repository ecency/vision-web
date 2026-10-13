---
paths:
  - "apps/web/src/specs/**"
  - "apps/web/vitest.config.*"
---

# Web app testing

## Test Structure

The web app uses Vitest + React Testing Library. Tests are located in `src/specs/`:
- `core/` - Core functionality tests (React Query helpers, hooks)
- `features/` - Component tests organized by feature
- `utils/` - Utility function tests

## Running Tests

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

## Test Utilities

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

## Mocking Strategy

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

## Component Testing Patterns

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

## Best Practices

- ✅ Test user-visible behavior, not implementation details
- ✅ Use `screen.getByRole` over `getByTestId` when possible
- ✅ Mock external dependencies with `vi.fn()`, not internal functions
- ✅ Keep tests focused and isolated
- ✅ Use factories for mock data (see test-utils.tsx)
- ✅ Clean up after tests (DOM, timers, mocks)
- ❌ Don't test library code (React Query, Zustand)
- ❌ Don't mock too much (makes tests brittle)
- ❌ Don't use snapshots for everything (hard to maintain)

## Coverage Requirements

- All new features require tests
- Bug fixes should include regression tests
- Aim for >80% coverage on business logic
- 100% coverage not required for UI components

## Main App (Vitest)

- Test environment: jsdom
- Test location: `src/specs/`
- Test pattern: `*.spec.tsx` co-located with components
- Setup file: `src/specs/setup-any-spec.ts`
- Mocked modules: i18next, @ecency/sdk, @ecency/wallets, @ecency/render-helper
- Configuration: `apps/web/vitest.config.ts`
