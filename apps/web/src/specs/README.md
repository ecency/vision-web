# Test Utilities Documentation

This directory contains test utilities and helper functions for testing Ecency Vision components with Vitest.

## Overview

The `test-utils.tsx` file provides a comprehensive set of utilities for testing React components that use React Query, modals, and Ecency-specific data structures.

## Quick Start

```typescript
import {
  renderWithQueryClient,
  mockEntry,
  mockFullAccount,
  setupModalContainers,
  cleanupModalContainers
} from '@/specs/test-utils';

describe('MyComponent', () => {
  test('renders entry', () => {
    const entry = mockEntry({ author: 'testuser', title: 'My Post' });
    const { getByText } = renderWithQueryClient(<MyComponent entry={entry} />);
    expect(getByText('My Post')).toBeInTheDocument();
  });
});
```

## Core Utilities

### QueryClient Wrappers

#### `createTestQueryClient()`

Creates a QueryClient instance configured for testing with retries disabled.

```typescript
const queryClient = createTestQueryClient();
// Use in custom wrappers or seed with data
```

#### `renderWithQueryClient(ui, options?)`

The primary render utility for components that use React Query. Automatically wraps your component with `QueryClientProvider`.

```typescript
// Basic usage
const { getByText } = renderWithQueryClient(<MyComponent />);

// With custom QueryClient
const queryClient = createTestQueryClient();
seedQueryClient(queryClient, { 'my-key': { data: 'value' } });
renderWithQueryClient(<MyComponent />, { queryClient });

// With render options (e.g., for modals)
renderWithQueryClient(<MyModal />, {
  renderOptions: { container: document.getElementById('modal-dialog-container') }
});
```

**Returns:** `RenderResult & { queryClient: QueryClient }`

#### `seedQueryClient(client, data)`

Pre-populates a QueryClient with data for testing.

```typescript
const queryClient = createTestQueryClient();
seedQueryClient(queryClient, {
  'account-testuser': mockFullAccount({ name: 'testuser' }),
  'entry-testuser-permlink': mockEntry({ author: 'testuser' })
});
```

## Mock Data Factories

### `mockFullAccount(overrides?)`

Creates a complete `FullAccount` object with sensible defaults.

```typescript
// Default account
const account = mockFullAccount();

// With overrides
const account = mockFullAccount({
  name: 'alice',
  reputation: '100000000000',
  balance: '1000.000 HIVE',
  profile: {
    name: 'Alice',
    about: 'Blockchain enthusiast',
    profile_image: 'https://example.com/avatar.jpg'
  }
});
```

### `mockEntry(overrides?)`

Creates a complete `Entry` (post/comment) object with sensible defaults.

```typescript
// Default post
const post = mockEntry();

// Custom post
const post = mockEntry({
  author: 'bob',
  title: 'My Awesome Post',
  body: 'This is the content',
  community: 'hive-123456'
});

// Comment
const comment = mockEntry({
  author: 'charlie',
  parent_author: 'bob',
  parent_permlink: 'my-awesome-post',
  depth: 1,
  title: '' // Comments typically have no title
});
```

Votes use the bridge v2 shape: `stats.total_votes` (default 0), `top_votes` (default `[]`) and `observer_vote` / `observer_vote_for` (default `null` / `null`). Entries carry no `active_votes`; mock it only as raw v1 or condenser input to a normalizer or stripper, with a comment saying so.

### `mockCommunity(overrides?)`

Creates a complete `Community` object with sensible defaults.

```typescript
const community = mockCommunity({
  name: 'hive-123456',
  title: 'Test Community',
  subscribers: 1000,
  is_nsfw: false
});
```

### `mockActiveUser(overrides?)`

Creates an `ActiveUser` object representing the currently logged-in user.

```typescript
const activeUser = mockActiveUser({
  username: 'testuser'
});

// With custom account data
const activeUser = mockActiveUser({
  username: 'alice',
  data: mockFullAccount({ name: 'alice', reputation: '5000000000' })
});
```

## Builder Patterns

For complex objects, use builder patterns for a more fluent API.

### `EntryBuilder`

```typescript
const entry = new EntryBuilder()
  .withAuthor('alice')
  .withPermlink('my-post')
  .withTitle('My Post')
  .withBody('Post content')
  .withVotes([{ voter: 'bob', rshares: 1000, percent: 10000 }])
  .withObserverVote('bob', { rshares: 1000, percent: 10000 })
  .withComments(5)
  .withPayout(10.5)
  .inCommunity('hive-123456', 'Test Community')
  .build();

// Create a comment
const comment = new EntryBuilder()
  .withAuthor('bob')
  .asComment('alice', 'parent-post')
  .withBody('Great post!')
  .build();
```

**Available methods:**
- `withAuthor(author: string)`
- `withPermlink(permlink: string)`
- `withTitle(title: string)`
- `withBody(body: string)`
- `withVotes(votes: Array<{ voter: string; rshares: number; percent?: number | null }>)`: sets `top_votes` and `stats.total_votes`
- `withObserverVote(account: string, vote: ObserverVote | null)`: sets `observer_vote` and `observer_vote_for` (null = `account` has not voted)
- `withComments(count: number)`
- `withPayout(amount: number)`
- `asComment(parentAuthor: string, parentPermlink: string)`
- `inCommunity(communityName: string, communityTitle: string)`
- `build(): Entry`

### `AccountBuilder`

```typescript
const account = new AccountBuilder()
  .withUsername('alice')
  .withReputation('100000000000')
  .withBalance('1000.000 HIVE')
  .withHbdBalance('500.000 HBD')
  .withVestingShares('1000000.000000 VESTS')
  .withProfile({ name: 'Alice', about: 'Test user' })
  .withPostCount(250)
  .build();
```

**Available methods:**
- `withUsername(name: string)`
- `withReputation(reputation: string | number)`
- `withBalance(balance: string)`
- `withHbdBalance(hbdBalance: string)`
- `withVestingShares(vestingShares: string)`
- `withProfile(profile: Partial<AccountProfile>)`
- `withPostCount(count: number)`
- `build(): FullAccount`

## Modal Testing Helpers

Modal components require specific DOM elements to render properly. Use these helpers in your test setup/teardown.

```typescript
describe('MyModal', () => {
  beforeEach(() => {
    setupModalContainers();
  });

  afterEach(() => {
    cleanupModalContainers();
  });

  test('renders modal', () => {
    renderWithQueryClient(<MyModal />, {
      renderOptions: { container: document.getElementById('modal-dialog-container') }
    });
    expect(screen.getByText('Modal Content')).toBeInTheDocument();
  });
});
```

### `setupModalContainers()`

Creates the required modal container elements:
- `#modal-dialog-container`
- `#modal-overlay-container`

### `cleanupModalContainers()`

Removes all modal containers and clears the document body.

## Complete Example

Here's a comprehensive example testing a component that uses React Query and modals:

```typescript
import React from 'react';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { vi } from 'vitest';
import { useGlobalStore } from '@/core/global-store';
import { getPostQuery } from '@/api/queries';
import {
  renderWithQueryClient,
  mockEntry,
  mockActiveUser,
  setupModalContainers,
  cleanupModalContainers,
  EntryBuilder
} from '@/specs/test-utils';
import { PostDetailModal } from '@/features/shared/post-detail-modal';

// Mock dependencies
vi.mock('@/core/global-store', () => ({
  useGlobalStore: vi.fn()
}));

vi.mock('@/api/queries', () => ({
  getPostQuery: vi.fn()
}));

describe('PostDetailModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupModalContainers();

    // Mock active user
    useGlobalStore.mockReturnValue({
      activeUser: mockActiveUser({ username: 'testuser' })
    });
  });

  afterEach(() => {
    cleanupModalContainers();
  });

  test('renders post details', async () => {
    // Create test data
    const post = new EntryBuilder()
      .withAuthor('alice')
      .withTitle('Test Post')
      .withBody('This is a test post')
      .withVotes([
        { voter: 'bob', rshares: 1000, percent: 10000 },
        { voter: 'charlie', rshares: 2000, percent: 10000 }
      ])
      .withComments(5)
      .withPayout(15.5)
      .build();

    // Mock API query
    getPostQuery.mockReturnValue({
      useClientQuery: vi.fn(() => ({
        data: post,
        isLoading: false
      }))
    });

    // Render component
    renderWithQueryClient(
      <PostDetailModal author="alice" permlink="test-post" onHide={vi.fn()} />,
      {
        renderOptions: { container: document.getElementById('modal-dialog-container') }
      }
    );

    // Assert
    await waitFor(() => {
      expect(screen.getByText('Test Post')).toBeInTheDocument();
      expect(screen.getByText('This is a test post')).toBeInTheDocument();
    });
  });

  test('handles voting', async () => {
    const post = mockEntry({ author: 'alice', permlink: 'test-post' });
    const voteMock = vi.fn();

    getPostQuery.mockReturnValue({
      useClientQuery: vi.fn(() => ({
        data: post,
        isLoading: false
      }))
    });

    renderWithQueryClient(
      <PostDetailModal author="alice" permlink="test-post" onHide={vi.fn()} />,
      {
        renderOptions: { container: document.getElementById('modal-dialog-container') }
      }
    );

    // Simulate voting
    const voteButton = screen.getByRole('button', { name: /vote/i });
    fireEvent.click(voteButton);

    await waitFor(() => {
      expect(voteMock).toHaveBeenCalled();
    });
  });
});
```

## Common Patterns

### Testing Components with Global Store

```typescript
import { vi } from 'vitest';
import { useGlobalStore } from '@/core/global-store';
import { mockActiveUser } from '@/specs/test-utils';

vi.mock('@/core/global-store', () => ({
  useGlobalStore: vi.fn()
}));

beforeEach(() => {
  useGlobalStore.mockReturnValue({
    activeUser: mockActiveUser({ username: 'testuser' })
  });
});
```

### Testing Components with API Queries

```typescript
import { vi } from 'vitest';
import { getPostQuery } from '@/api/queries';
import { mockEntry } from '@/specs/test-utils';

vi.mock('@/api/queries', () => ({
  getPostQuery: vi.fn()
}));

beforeEach(() => {
  getPostQuery.mockReturnValue({
    useClientQuery: vi.fn(() => ({
      data: mockEntry({ author: 'alice' }),
      isLoading: false
    }))
  });
});
```

### Testing with Pre-seeded Query Cache

```typescript
import { createTestQueryClient, seedQueryClient, mockEntry } from '@/specs/test-utils';

test('uses cached data', () => {
  const queryClient = createTestQueryClient();

  // Pre-populate cache
  seedQueryClient(queryClient, {
    'post-alice-test': mockEntry({ author: 'alice', permlink: 'test' }),
    'account-alice': mockFullAccount({ name: 'alice' })
  });

  renderWithQueryClient(<MyComponent />, { queryClient });
});
```

## Type Exports

All mock factories return properly typed objects:

```typescript
import type { FullAccount, Entry, Community, ActiveUser } from '@/specs/test-utils';
// Or from entities:
import type { FullAccount, Entry, Community, ActiveUser } from '@/entities';
```

## Best Practices

1. **Use builders for complex objects**: When testing with multiple related entities, use builder patterns for clarity.

2. **Mock at the right level**: Mock API queries rather than internal implementations when possible.

3. **Clean up after tests**: Always use `cleanupModalContainers()` in `afterEach()` when testing modals.

4. **Seed query cache when testing derived state**: If your component derives state from multiple queries, seed the cache with all necessary data.

5. **Use `waitFor` for async operations**: Always wrap assertions that depend on async operations in `waitFor()`.

6. **Keep tests focused**: Test one behavior per test. Use descriptive test names.

## Troubleshooting

### Modal doesn't render

Make sure you're calling `setupModalContainers()` in `beforeEach()` and passing the correct container:

```typescript
renderWithQueryClient(<MyModal />, {
  renderOptions: { container: document.getElementById('modal-dialog-container') }
});
```

### Query data not found

Ensure you're either:
1. Mocking the query hook to return data, or
2. Seeding the QueryClient with data before rendering

### TypeScript errors

Import types from `@/entities` or re-export them from test-utils:

```typescript
import type { Entry, FullAccount } from '@/specs/test-utils';
```

## See Also

- [React Testing Library Documentation](https://testing-library.com/react)
- [TanStack Query Testing Guide](https://tanstack.com/query/latest/docs/framework/react/guides/testing)
- [Jest Documentation](https://jestjs.io/docs/getting-started)
