# Test Utils Usage Example

This document shows how to refactor existing tests to use the new test utilities.

## Before (Original Pattern)

From `src/specs/features/shared/bookmark-btn.spec.tsx`:

```typescript
import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import { vi } from "vitest";
import { useActiveAccount } from "@/core/hooks/use-active-account";
import { useBookmarkAdd, useBookmarkDelete } from "@ecency/sdk";
import { useQuery } from "@tanstack/react-query";
import { Entry } from "@/entities";
import { BookmarkBtn } from "../../../features/shared";

vi.mock("@/core/hooks/use-active-account", () => ({
  useActiveAccount: vi.fn()
}));

vi.mock("@tanstack/react-query", () => ({
  useQuery: vi.fn()
}));

describe("BookmarkBtn", () => {
  const entry: Entry = {
    author: "author1",
    permlink: "permlink1"
    // Add other required fields for Entry
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("renders login required when no active user", () => {
    useActiveAccount.mockReturnValue({ activeUser: null, username: null });
    (useQuery as any).mockReturnValue({ data: [] });
    useBookmarkAdd.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
    useBookmarkDelete.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });

    render(<BookmarkBtn entry={entry} />);

    expect(screen.getByTitle("bookmark-btn.add")).toBeInTheDocument();
  });

  test("renders add bookmark button for non-bookmarked entry", () => {
    useActiveAccount.mockReturnValue({
      activeUser: { username: "user1" },
      username: "user1"
    });
    (useQuery as any).mockReturnValue({ data: [] });
    useBookmarkAdd.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
    useBookmarkDelete.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });

    render(<BookmarkBtn entry={entry} />);

    expect(screen.getByTitle("bookmark-btn.add")).toBeInTheDocument();
  });
});
```

## After (Using Test Utils)

```typescript
import React from "react";
import { fireEvent, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import { vi } from "vitest";
import { useActiveAccount } from "@/core/hooks/use-active-account";
import { useBookmarkAdd, useBookmarkDelete } from "@ecency/sdk";
import { useQuery } from "@tanstack/react-query";
import { BookmarkBtn } from "../../../features/shared";
import { renderWithQueryClient, mockEntry, mockActiveUser } from "@/specs/test-utils";

vi.mock("@/core/hooks/use-active-account", () => ({
  useActiveAccount: vi.fn()
}));

vi.mock("@tanstack/react-query", () => ({
  useQuery: vi.fn()
}));

describe("BookmarkBtn", () => {
  // Use mockEntry to create a complete, valid entry
  const entry = mockEntry({
    author: "author1",
    permlink: "permlink1"
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("renders login required when no active user", () => {
    useActiveAccount.mockReturnValue({ activeUser: null, username: null });
    (useQuery as any).mockReturnValue({ data: [] });
    useBookmarkAdd.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
    useBookmarkDelete.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });

    // Use renderWithQueryClient instead of render
    renderWithQueryClient(<BookmarkBtn entry={entry} />);

    expect(screen.getByTitle("bookmark-btn.add")).toBeInTheDocument();
  });

  test("renders add bookmark button for non-bookmarked entry", () => {
    // Use mockActiveUser for clean, complete active user data
    const activeUser = mockActiveUser({ username: "user1" });

    useActiveAccount.mockReturnValue({
      activeUser,
      username: activeUser.username
    });
    (useQuery as any).mockReturnValue({ data: [] });
    useBookmarkAdd.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
    useBookmarkDelete.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });

    renderWithQueryClient(<BookmarkBtn entry={entry} />);

    expect(screen.getByTitle("bookmark-btn.add")).toBeInTheDocument();
  });
});
```

## Key Improvements

1. **Complete mock data**: `mockEntry()` provides all required Entry fields, no need to add comments about missing fields
2. **Type safety**: Mock factories return properly typed objects
3. **Consistency**: All tests use the same pattern for creating test data
4. **QueryClient handling**: `renderWithQueryClient()` automatically provides React Query context
5. **Cleaner code**: Less boilerplate, more readable tests

## Advanced Example: Using Builders

For complex scenarios with related entities:

```typescript
import { vi } from "vitest";
import { EntryBuilder, AccountBuilder, renderWithQueryClient } from "@/specs/test-utils";

test("renders post with author profile", () => {
  // Build related entities
  const author = new AccountBuilder()
    .withUsername("alice")
    .withReputation("100000000000")
    .withProfile({
      name: "Alice",
      about: "Blockchain developer"
    })
    .build();

  const post = new EntryBuilder()
    .withAuthor("alice")
    .withTitle("My First Post")
    .withBody("Hello Hive!")
    // Sets top_votes and stats.total_votes (entries carry no active_votes).
    .withVotes([
      { voter: "bob", rshares: 5000, percent: 5000 },
      { voter: "charlie", rshares: 10000, percent: 10000 }
    ])
    // The viewer's own vote: observer_vote + observer_vote_for.
    .withObserverVote("bob", { rshares: 5000, percent: 5000 })
    .withComments(3)
    .withPayout(25.5)
    .inCommunity("hive-123456", "Test Community")
    .build();

  // Mock APIs to return our test data
  getAccountQuery.mockReturnValue({
    useClientQuery: () => ({ data: author })
  });

  getPostQuery.mockReturnValue({
    useClientQuery: () => ({ data: post })
  });

  // Render and test
  renderWithQueryClient(<PostWithAuthor author="alice" permlink="my-first-post" />);

  expect(screen.getByText("My First Post")).toBeInTheDocument();
  expect(screen.getByText("Alice")).toBeInTheDocument();
  expect(screen.getByText("3 comments")).toBeInTheDocument();
  expect(screen.getByText("$25.50")).toBeInTheDocument();
});
```

## Modal Testing Example

```typescript
import { vi } from "vitest";
import {
  renderWithQueryClient,
  setupModalContainers,
  cleanupModalContainers,
  mockEntry
} from "@/specs/test-utils";

describe("MyModal", () => {
  beforeEach(() => {
    setupModalContainers();
  });

  afterEach(() => {
    cleanupModalContainers();
  });

  test("renders modal with entry data", () => {
    const entry = mockEntry({
      author: "alice",
      title: "Test Post"
    });

    renderWithQueryClient(<MyModal entry={entry} onHide={vi.fn()} />, {
      renderOptions: {
        container: document.getElementById("modal-dialog-container")
      }
    });

    expect(screen.getByText("Test Post")).toBeInTheDocument();
  });
});
```

## Migration Checklist

When refactoring existing tests:

- [ ] Replace `render()` with `renderWithQueryClient()`
- [ ] Replace manual Entry objects with `mockEntry()`
- [ ] Replace manual Account objects with `mockFullAccount()`
- [ ] Use `setupModalContainers()` / `cleanupModalContainers()` for modal tests
- [ ] Consider using builders for complex test scenarios
- [ ] Use `seedQueryClient()` for pre-populated cache scenarios
- [ ] Import types from `@/specs/test-utils` for convenience

## Benefits

- **Less boilerplate**: Mock factories handle all required fields
- **Type safety**: TypeScript catches errors at compile time
- **Consistency**: All tests follow the same patterns
- **Maintainability**: Changes to entities only need updates in one place
- **Documentation**: Mock factories serve as documentation of data structures
- **Flexibility**: Override any field as needed, while keeping defaults sensible
