# Test Utils Quick Reference

## File Structure

```
src/specs/
├── test-utils.tsx          # Main utilities file (646 lines)
├── test-utils.spec.tsx     # Tests for utilities (227 lines)
├── README.md               # Full documentation (469 lines)
├── USAGE_EXAMPLE.md        # Migration examples (240 lines)
├── QUICK_REFERENCE.md      # This file
├── setup-any-spec.ts       # Global test setup
└── features/               # Feature tests
    └── shared/
        ├── boost.spec.tsx
        ├── bookmarks.spec.tsx
        └── bookmark-btn.spec.tsx
```

## Import Statement

```typescript
import {
  // Render utilities
  renderWithQueryClient,
  createTestQueryClient,
  seedQueryClient,

  // Mock factories
  mockFullAccount,
  mockEntry,
  mockCommunity,
  mockActiveUser,

  // Modal helpers
  setupModalContainers,
  cleanupModalContainers,

  // Builders
  EntryBuilder,
  AccountBuilder,

  // Types
  type FullAccount,
  type Entry,
  type Community,
  type ActiveUser
} from "@/specs/test-utils";
```

## Common Patterns Cheat Sheet

### Basic Component Test

```typescript
import { renderWithQueryClient, mockEntry } from "@/specs/test-utils";

test("renders component", () => {
  const entry = mockEntry({ author: "alice" });
  const { getByText } = renderWithQueryClient(<MyComponent entry={entry} />);
  expect(getByText("Expected Text")).toBeInTheDocument();
});
```

### Modal Component Test

```typescript
import { renderWithQueryClient, setupModalContainers, cleanupModalContainers } from "@/specs/test-utils";

describe("MyModal", () => {
  beforeEach(() => setupModalContainers());
  afterEach(() => cleanupModalContainers());

  test("renders", () => {
    renderWithQueryClient(<MyModal />, {
      renderOptions: { container: document.getElementById("modal-dialog-container") }
    });
  });
});
```

### Component with Query Client

```typescript
import { renderWithQueryClient, createTestQueryClient, seedQueryClient, mockEntry } from "@/specs/test-utils";

test("uses cached data", () => {
  const queryClient = createTestQueryClient();
  seedQueryClient(queryClient, {
    "post-key": mockEntry({ author: "alice" })
  });
  renderWithQueryClient(<MyComponent />, { queryClient });
});
```

### Component with Global Store

```typescript
import { vi } from "vitest";
import { renderWithQueryClient, mockActiveUser } from "@/specs/test-utils";

vi.mock("@/core/global-store", () => ({
  useGlobalStore: vi.fn()
}));

beforeEach(() => {
  useGlobalStore.mockReturnValue({
    activeUser: mockActiveUser({ username: "alice" })
  });
});
```

### Using Builders

```typescript
import { EntryBuilder, AccountBuilder } from "@/specs/test-utils";

const post = new EntryBuilder()
  .withAuthor("alice")
  .withTitle("My Post")
  .withVotes([{ voter: "bob", rshares: 1000, percent: 10000 }])
  .withObserverVote("bob", { rshares: 1000, percent: 10000 })
  .inCommunity("hive-123456", "Test Community")
  .build();

const account = new AccountBuilder()
  .withUsername("alice")
  .withReputation("100000000000")
  .withBalance("1000.000 HIVE")
  .build();
```

## Mock Factory Quick Reference

### mockFullAccount(overrides?)

```typescript
// Minimal
mockFullAccount()

// With overrides
mockFullAccount({
  name: "alice",
  reputation: "100000000000",
  balance: "1000.000 HIVE",
  profile: { name: "Alice", about: "Developer" }
})
```

**Common fields:**
- `name` - Username
- `reputation` - Reputation score (string or number)
- `balance` - HIVE balance (e.g., "1000.000 HIVE")
- `hbd_balance` - HBD balance (e.g., "500.000 HBD")
- `vesting_shares` - HP as VESTS (e.g., "1000000.000000 VESTS")
- `profile` - Profile metadata object

### mockEntry(overrides?)

```typescript
// Minimal post
mockEntry()

// Custom post
mockEntry({
  author: "alice",
  title: "My Post",
  body: "Content",
  community: "hive-123456"
})

// Comment
mockEntry({
  author: "bob",
  parent_author: "alice",
  parent_permlink: "my-post",
  depth: 1
})
```

**Common fields:**
- `author` - Post author
- `permlink` - Post permlink
- `title` - Post title
- `body` - Post content
- `parent_author` - For comments
- `parent_permlink` - For comments
- `depth` - Comment depth (0 = post)
- `community` - Community name (e.g., "hive-123456")
- `stats.total_votes` - Vote count (default 0)
- `top_votes` - Top voters, `{ voter, rshares, percent }` rows (default `[]`)
- `observer_vote` / `observer_vote_for` - The vote of the account in `observer_vote_for` (default `null` / `null`)

Entries carry no `active_votes` (bridge v2). Mock it only as raw v1 or condenser input to a normalizer or stripper, with a comment saying so.

### mockCommunity(overrides?)

```typescript
mockCommunity({
  name: "hive-123456",
  title: "Test Community",
  subscribers: 1000,
  is_nsfw: false
})
```

### mockActiveUser(overrides?)

```typescript
mockActiveUser({
  username: "alice",
  data: mockFullAccount({ name: "alice" })
})
```

## Builder Methods Reference

### EntryBuilder

```typescript
new EntryBuilder()
  .withAuthor(author: string)
  .withPermlink(permlink: string)
  .withTitle(title: string)
  .withBody(body: string)
  .withVotes(votes: Array<{voter: string, rshares: number, percent?: number | null}>) // top_votes + stats.total_votes
  .withObserverVote(account: string, vote: ObserverVote | null) // observer_vote + observer_vote_for
  .withComments(count: number)
  .withPayout(amount: number)
  .asComment(parentAuthor: string, parentPermlink: string)
  .inCommunity(name: string, title: string)
  .build()
```

### AccountBuilder

```typescript
new AccountBuilder()
  .withUsername(name: string)
  .withReputation(reputation: string | number)
  .withBalance(balance: string)
  .withHbdBalance(hbdBalance: string)
  .withVestingShares(vestingShares: string)
  .withProfile(profile: Partial<AccountProfile>)
  .withPostCount(count: number)
  .build()
```

## Testing Checklist

When writing a new test:

- [ ] Use `renderWithQueryClient()` instead of `render()`
- [ ] Use mock factories for test data
- [ ] Set up modal containers for modal tests
- [ ] Mock global store if component uses it
- [ ] Mock API queries if component uses them
- [ ] Clean up in `afterEach()`
- [ ] Use `waitFor()` for async assertions
- [ ] Keep tests focused (one behavior per test)

## Common Test Structure

```typescript
import { vi } from "vitest";
import { renderWithQueryClient, mockEntry } from "@/specs/test-utils";

// Mocks
vi.mock("@/api/queries");
vi.mock("@/core/global-store");

describe("MyComponent", () => {
  // Test data
  const testData = mockEntry({ author: "alice" });

  // Setup
  beforeEach(() => {
    vi.clearAllMocks();
    // Setup mocks
  });

  // Teardown
  afterEach(() => {
    // Cleanup if needed
  });

  // Tests
  test("does something", () => {
    renderWithQueryClient(<MyComponent data={testData} />);
    // Assertions
  });
});
```

## Troubleshooting

| Problem | Solution |
|---------|----------|
| Modal not rendering | Use `setupModalContainers()` and pass container to render options |
| Query data not found | Mock the query hook or seed the QueryClient |
| Type errors | Import types from `@/specs/test-utils` or `@/entities` |
| Async assertions fail | Wrap in `waitFor()` or `findBy*` queries |
| Tests interfere with each other | Ensure proper cleanup in `afterEach()` |

## Resources

- **Full Documentation**: `src/specs/README.md`
- **Usage Examples**: `src/specs/USAGE_EXAMPLE.md`
- **Utility Tests**: `src/specs/test-utils.spec.tsx`
- **React Testing Library**: https://testing-library.com/react
- **TanStack Query Testing**: https://tanstack.com/query/latest/docs/framework/react/guides/testing
- **Vitest Documentation**: https://vitest.dev

## Version Info

- Created: 2026-01-14
- Total Lines: 1,582
- Test Coverage: 18 tests, all passing
