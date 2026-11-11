/**
 * Test Utilities for Ecency Vision
 *
 * This file provides reusable test utilities for component testing with React Testing Library.
 * It includes QueryClient wrappers, mock data factories, and common test setup helpers.
 *
 * @example
 * import { renderWithQueryClient, mockEntry, mockFullAccount } from '@/specs/test-utils';
 *
 * test('renders entry', () => {
 *   const entry = mockEntry({ author: 'testuser' });
 *   renderWithQueryClient(<EntryComponent entry={entry} />);
 * });
 */

import React, { ReactElement } from "react";
import { render, RenderOptions, RenderResult } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { FullAccount, Entry, Community, ActiveUser } from "@/entities";

// ============================================================================
// QueryClient Test Utilities
// ============================================================================

/**
 * Creates a QueryClient configured for testing with retries disabled
 * and specific default options for queries and mutations.
 *
 * @returns A QueryClient instance configured for testing
 *
 * @example
 * const queryClient = createTestQueryClient();
 * render(
 *   <QueryClientProvider client={queryClient}>
 *     <YourComponent />
 *   </QueryClientProvider>
 * );
 */
export function createTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: Infinity, // Prevent garbage collection during tests
        staleTime: Infinity // Keep data fresh during tests
      },
      mutations: {
        retry: false
      }
    }
  });
}

export interface RenderWithQueryClientOptions {
  /**
   * Optional QueryClient instance. If not provided, a new one will be created.
   */
  queryClient?: QueryClient;
  /**
   * Optional render options passed to React Testing Library's render function.
   */
  renderOptions?: Omit<RenderOptions, "wrapper">;
}

/**
 * Renders a React element wrapped with QueryClientProvider for testing components
 * that use React Query hooks.
 *
 * This is the primary render utility for testing components that depend on React Query.
 * It automatically wraps your component with QueryClientProvider and provides a
 * QueryClient configured for testing.
 *
 * @param ui - The React element to render
 * @param options - Optional configuration object
 * @returns RenderResult from React Testing Library plus the QueryClient instance
 *
 * @example
 * // Basic usage
 * const { getByText } = renderWithQueryClient(<MyComponent />);
 *
 * @example
 * // With custom QueryClient
 * const queryClient = createTestQueryClient();
 * queryClient.setQueryData(['key'], { data: 'value' });
 * const { getByText } = renderWithQueryClient(<MyComponent />, { queryClient });
 *
 * @example
 * // With render options
 * const { container } = renderWithQueryClient(<MyComponent />, {
 *   renderOptions: { container: document.getElementById('modal-dialog-container') }
 * });
 */
export function renderWithQueryClient(
  ui: ReactElement,
  options?: RenderWithQueryClientOptions
): RenderResult & { queryClient: QueryClient } {
  const queryClient = options?.queryClient ?? createTestQueryClient();

  const Wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  return {
    ...render(ui, { ...options?.renderOptions, wrapper: Wrapper }),
    queryClient
  };
}

/**
 * Seeds a QueryClient with pre-populated data for testing.
 * Useful for setting up query cache state before rendering components.
 *
 * @param client - The QueryClient instance to seed
 * @param data - A record where keys are query keys (arrays) and values are the data to set
 *
 * @example
 * const queryClient = createTestQueryClient();
 * seedQueryClient(queryClient, {
 *   'account-testuser': mockFullAccount({ name: 'testuser' }),
 *   'entry-testuser-permlink': mockEntry({ author: 'testuser' })
 * });
 * renderWithQueryClient(<MyComponent />, { queryClient });
 */
export function seedQueryClient(client: QueryClient, data: Record<string, any>): void {
  Object.entries(data).forEach(([key, value]) => {
    client.setQueryData([key], value);
  });
}

// ============================================================================
// Mock Data Factories
// ============================================================================

/**
 * Creates a mock FullAccount object with sensible defaults.
 * All fields can be overridden via the overrides parameter.
 *
 * @param overrides - Partial FullAccount to override default values
 * @returns A complete FullAccount object suitable for testing
 *
 * @example
 * const account = mockFullAccount({ name: 'alice', reputation: '100000000000' });
 *
 * @example
 * const accountWithProfile = mockFullAccount({
 *   name: 'bob',
 *   profile: { about: 'Test user', profile_image: 'https://example.com/avatar.jpg' }
 * });
 */
export function mockFullAccount(overrides?: Partial<FullAccount>): FullAccount {
  return {
    name: "testuser",
    owner: {
      weight_threshold: 1,
      account_auths: [],
      key_auths: [["TEST_OWNER_KEY", 1]]
    },
    active: {
      weight_threshold: 1,
      account_auths: [],
      key_auths: [["TEST_ACTIVE_KEY", 1]]
    },
    posting: {
      weight_threshold: 1,
      account_auths: [],
      key_auths: [["TEST_POSTING_KEY", 1]]
    },
    memo_key: "TEST_MEMO_KEY",
    post_count: 100,
    created: "2020-01-01T00:00:00",
    reputation: "1000000000000",
    json_metadata: "{}",
    posting_json_metadata: "{}",
    last_vote_time: "2024-01-01T00:00:00",
    last_post: "2024-01-01T00:00:00",
    reward_hbd_balance: "0.000 HBD",
    reward_vesting_hive: "0.000000 VESTS",
    reward_hive_balance: "0.000 HIVE",
    reward_vesting_balance: "0.000000 VESTS",
    balance: "100.000 HIVE",
    vesting_shares: "1000000.000000 VESTS",
    hbd_balance: "50.000 HBD",
    savings_balance: "0.000 HIVE",
    savings_hbd_balance: "0.000 HBD",
    savings_hbd_seconds: "0",
    savings_hbd_last_interest_payment: "1970-01-01T00:00:00",
    savings_hbd_seconds_last_update: "1970-01-01T00:00:00",
    next_vesting_withdrawal: "1969-12-31T23:59:59",
    pending_claimed_accounts: 0,
    delegated_vesting_shares: "0.000000 VESTS",
    received_vesting_shares: "0.000000 VESTS",
    vesting_withdraw_rate: "0.000000 VESTS",
    to_withdraw: "0",
    withdrawn: "0",
    witness_votes: [],
    proxy: "",
    recovery_account: "steem",
    proxied_vsf_votes: [],
    voting_manabar: {
      current_mana: "10000",
      last_update_time: Date.now() / 1000
    },
    voting_power: 10000,
    downvote_manabar: {
      current_mana: "2500",
      last_update_time: Date.now() / 1000
    },
    profile: {
      name: "Test User",
      about: "Test account description",
      profile_image: "https://example.com/avatar.jpg"
    },
    ...overrides
  };
}

/**
 * Creates a mock Entry (post/comment) object with sensible defaults.
 * All fields can be overridden via the overrides parameter.
 *
 * @param overrides - Partial Entry to override default values
 * @returns A complete Entry object suitable for testing
 *
 * @example
 * const post = mockEntry({ author: 'alice', title: 'My Test Post' });
 *
 * @example
 * const comment = mockEntry({
 *   author: 'bob',
 *   parent_author: 'alice',
 *   parent_permlink: 'my-post',
 *   depth: 1
 * });
 */
export function mockEntry(overrides?: Partial<Entry>): Entry {
  const now = new Date().toISOString();

  return {
    active_votes: [],
    author: "testuser",
    author_payout_value: "0.000 HBD",
    author_reputation: 50,
    beneficiaries: [],
    blacklists: [],
    body: "This is a test post body with some content.",
    category: "test",
    children: 0,
    created: now,
    curator_payout_value: "0.000 HBD",
    depth: 0,
    is_paidout: false,
    json_metadata: {
      tags: ["test", "mock"],
      app: "ecency/test"
    },
    max_accepted_payout: "1000000.000 HBD",
    net_rshares: 0,
    parent_permlink: "test",
    payout: 0,
    payout_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    pending_payout_value: "0.000 HBD",
    percent_hbd: 10000,
    permlink: "test-permlink",
    post_id: 12345,
    promoted: "0.000 HBD",
    replies: [],
    stats: {
      flag_weight: 0,
      gray: false,
      hide: false,
      total_votes: 0
    },
    title: "Test Entry Title",
    updated: now,
    url: "/test/@testuser/test-permlink",
    ...overrides
  };
}

/**
 * Creates a mock Community object with sensible defaults.
 * All fields can be overridden via the overrides parameter.
 *
 * @param overrides - Partial Community to override default values
 * @returns A complete Community object suitable for testing
 *
 * @example
 * const community = mockCommunity({ name: 'hive-123456', title: 'Test Community' });
 *
 * @example
 * const nsfwCommunity = mockCommunity({
 *   name: 'hive-999999',
 *   is_nsfw: true,
 *   about: 'Adult content community'
 * });
 */
export function mockCommunity(overrides?: Partial<Community>): Community {
  return {
    about: "This is a test community for testing purposes.",
    admins: ["admin1", "admin2"],
    avatar_url: "https://example.com/community-avatar.jpg",
    created_at: "2020-01-01T00:00:00",
    description: "A test community",
    flag_text: "",
    id: 123456,
    is_nsfw: false,
    lang: "en",
    name: "hive-123456",
    num_authors: 100,
    num_pending: 5,
    subscribers: 1000,
    sum_pending: 0,
    settings: {},
    team: [
      ["owner1", "owner", "Owner"],
      ["admin1", "admin", "Admin"]
    ],
    title: "Test Community",
    type_id: 1,
    ...overrides
  };
}

/**
 * Creates a mock ActiveUser object with sensible defaults.
 * This represents the currently logged-in user in the application.
 *
 * @param overrides - Partial ActiveUser to override default values
 * @returns A complete ActiveUser object suitable for testing
 *
 * @example
 * const activeUser = mockActiveUser({ username: 'alice' });
 *
 * @example
 * const activeUserWithData = mockActiveUser({
 *   username: 'bob',
 *   data: mockFullAccount({ name: 'bob', reputation: '5000000000' })
 * });
 */
export function mockActiveUser(overrides?: Partial<ActiveUser>): ActiveUser {
  const username = overrides?.username ?? "testuser";
  const data = overrides?.data ?? mockFullAccount({ name: username });

  return {
    username,
    data,
    ...overrides
  };
}

// ============================================================================
// Modal & DOM Test Helpers
// ============================================================================

/**
 * Sets up modal container elements in the DOM that are required by modal components.
 * This should be called in beforeEach() when testing modal components.
 *
 * Modal components in Ecency use portals to render into specific container elements.
 * This function creates those elements so modals can render properly during tests.
 *
 * @example
 * describe('MyModal', () => {
 *   beforeEach(() => {
 *     setupModalContainers();
 *   });
 *
 *   afterEach(() => {
 *     cleanupModalContainers();
 *   });
 *
 *   test('renders modal', () => {
 *     render(<MyModal />, {
 *       container: document.getElementById('modal-dialog-container')
 *     });
 *   });
 * });
 */
export function setupModalContainers(): void {
  // Create modal dialog container
  const modalDialogContainer = document.createElement("div");
  modalDialogContainer.setAttribute("id", "modal-dialog-container");
  document.body.appendChild(modalDialogContainer);

  // Create modal overlay container
  const modalOverlayContainer = document.createElement("div");
  modalOverlayContainer.setAttribute("id", "modal-overlay-container");
  document.body.appendChild(modalOverlayContainer);
}

/**
 * Removes all modal container elements and clears the document body.
 * This should be called in afterEach() when testing modal components.
 *
 * @example
 * afterEach(() => {
 *   cleanupModalContainers();
 * });
 */
export function cleanupModalContainers(): void {
  document.body.innerHTML = "";
}

// ============================================================================
// Feature Flag Test Helpers
// ============================================================================

/**
 * Type representing the vision features configuration structure.
 * This matches the visionFeatures object in the config.
 */
export type VisionFeaturesConfig = {
  perks?: { enabled: boolean };
  userActivityTracking?: { enabled: boolean };
  points?: { enabled: boolean };
  decks?: { enabled: boolean };
  notifications?: {
    enabled: boolean;
    push?: { enabled: boolean };
  };
  imageServer?: { enabled: boolean };
  favourites?: { enabled: boolean };
  bookmarks?: { enabled: boolean };
  entries?: {
    rawContent?: { enabled: boolean };
  };
  referrals?: { enabled: boolean };
  gallery?: { enabled: boolean };
  drafts?: { enabled: boolean };
  schedules?: { enabled: boolean };
  fragments?: { enabled: boolean };
  discover?: {
    leaderboard?: { enabled: boolean };
    curation?: { enabled: boolean };
  };
  promotions?: { enabled: boolean };
  editHistory?: { enabled: boolean };
  chats?: { enabled: boolean };
  waves?: { enabled: boolean };
  accountRecovery?: { enabled: boolean };
  plausible?: {
    enabled: boolean;
    host?: string;
    siteId?: string;
    apiKey?: string;
  };
  publish?: {
    geoPicker?: {
      enabled: boolean;
      geocoderHost?: string;
      citiesDataUrl?: string;
      tileUrl?: string;
    };
  };
};

/**
 * Mocks the EcencyConfigManager feature flags for testing.
 * This allows you to test components with specific feature flags enabled or disabled.
 *
 * Note: This is a placeholder implementation. In practice, you would need to mock
 * the actual config module or use dependency injection to override feature flags.
 *
 * @param flags - Partial VisionFeaturesConfig to override
 *
 * @example
 * mockFeatureFlags({
 *   bookmarks: { enabled: true },
 *   favourites: { enabled: false }
 * });
 */
export function mockFeatureFlags(flags: Partial<VisionFeaturesConfig>): void {
  // This is a placeholder implementation
  // In actual usage, you would need to mock the config module:
  //
  // jest.mock('@/config', () => ({
  //   EcencyConfigManager: {
  //     CONFIG: {
  //       visionFeatures: { ...defaultFlags, ...flags }
  //     }
  //   }
  // }));
  //
  // For now, this serves as documentation of the intended usage
  console.warn("mockFeatureFlags is a placeholder - implement module mocking for actual usage");
}

// ============================================================================
// Test Data Builders
// ============================================================================

/**
 * Builder pattern for creating complex Entry objects with fluent API.
 * Useful when you need to create entries with specific relationships or complex state.
 *
 * @example
 * const entry = new EntryBuilder()
 *   .withAuthor('alice')
 *   .withTitle('My Post')
 *   .withVotes([{ voter: 'bob', rshares: 1000 }])
 *   .withComments(5)
 *   .build();
 */
export class EntryBuilder {
  private entry: Partial<Entry> = {};

  withAuthor(author: string): this {
    this.entry.author = author;
    return this;
  }

  withPermlink(permlink: string): this {
    this.entry.permlink = permlink;
    return this;
  }

  withTitle(title: string): this {
    this.entry.title = title;
    return this;
  }

  withBody(body: string): this {
    this.entry.body = body;
    return this;
  }

  withVotes(votes: Array<{ voter: string; rshares: number }>): this {
    this.entry.active_votes = votes;
    return this;
  }

  withComments(count: number): this {
    this.entry.children = count;
    return this;
  }

  withPayout(amount: number): this {
    this.entry.payout = amount;
    this.entry.pending_payout_value = `${amount.toFixed(3)} HBD`;
    return this;
  }

  asComment(parentAuthor: string, parentPermlink: string): this {
    this.entry.parent_author = parentAuthor;
    this.entry.parent_permlink = parentPermlink;
    this.entry.depth = 1;
    return this;
  }

  inCommunity(communityName: string, communityTitle: string): this {
    this.entry.community = communityName;
    this.entry.community_title = communityTitle;
    return this;
  }

  build(): Entry {
    return mockEntry(this.entry);
  }
}

/**
 * Builder pattern for creating complex FullAccount objects with fluent API.
 *
 * @example
 * const account = new AccountBuilder()
 *   .withUsername('alice')
 *   .withReputation('100000000000')
 *   .withBalance('1000.000 HIVE')
 *   .withProfile({ name: 'Alice', about: 'Test user' })
 *   .build();
 */
export class AccountBuilder {
  private account: Partial<FullAccount> = {};

  withUsername(name: string): this {
    this.account.name = name;
    return this;
  }

  withReputation(reputation: string | number): this {
    this.account.reputation = reputation;
    return this;
  }

  withBalance(balance: string): this {
    this.account.balance = balance;
    return this;
  }

  withHbdBalance(hbdBalance: string): this {
    this.account.hbd_balance = hbdBalance;
    return this;
  }

  withVestingShares(vestingShares: string): this {
    this.account.vesting_shares = vestingShares;
    return this;
  }

  withProfile(profile: Partial<FullAccount["profile"]>): this {
    this.account.profile = { ...this.account.profile, ...profile };
    return this;
  }

  withPostCount(count: number): this {
    this.account.post_count = count;
    return this;
  }

  build(): FullAccount {
    return mockFullAccount(this.account);
  }
}

// ============================================================================
// Async Test Helpers
// ============================================================================

/**
 * Waits for a specific time in milliseconds.
 * Useful for testing components with debounced or throttled behavior.
 *
 * @param ms - Number of milliseconds to wait
 *
 * @example
 * // Test debounced search
 * fireEvent.change(searchInput, { target: { value: 'test' } });
 * await waitForMs(500); // Wait for debounce
 * expect(mockSearchFn).toHaveBeenCalled();
 */
export function waitForMs(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ============================================================================
// Type Exports
// ============================================================================

/**
 * Re-export commonly used types for convenience in tests.
 */
export type { FullAccount, Entry, Community, ActiveUser };
export type { RenderOptions, RenderResult };
