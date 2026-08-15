import { vi } from "vitest";
import { TextDecoder, TextEncoder } from "util";

// Polyfill for jsdom environment — use defineProperty because jsdom v26
// shadows simple global assignments with its own window descriptors.
Object.defineProperty(globalThis, "TextEncoder", {
  value: TextEncoder,
  writable: true,
  configurable: true
});
Object.defineProperty(globalThis, "TextDecoder", {
  value: TextDecoder,
  writable: true,
  configurable: true
});

// jsdom has no IntersectionObserver. Stub it so components using
// react-in-viewport (DetectBottom, HydrateOnVisible, EntryListItem) don't throw
// in tests; it never fires, so observed elements stay "not in viewport".
if (!("IntersectionObserver" in globalThis)) {
  class IntersectionObserverStub {
    readonly root = null;
    readonly rootMargin = "";
    readonly thresholds = [];
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() {
      return [];
    }
  }
  Object.defineProperty(globalThis, "IntersectionObserver", {
    value: IntersectionObserverStub,
    writable: true,
    configurable: true
  });
}

// Mock uuid to avoid crypto dependency issues
vi.mock("uuid", () => ({
  v4: vi.fn(() => "test-uuid-1234")
}));

vi.mock("i18next", () => ({
  __esModule: true,
  default: {
    t: vi.fn((key) => key),
    init: vi.fn(),
    changeLanguage: vi.fn(),
    on: vi.fn()
  }
}));

vi.mock("@ecency/sdk", async () => ({
  // The moderation rules are pure functions with no dependencies, and components
  // call them during render, so hand out the real implementations from source
  // (not dist, which is only rebuilt on a labelled release).
  ...(await vi.importActual<Record<string, unknown>>(
    "../../../../packages/sdk/src/modules/moderation"
  )),
  PrivateKey: { fromString: vi.fn(), fromLogin: vi.fn(), from: vi.fn() },
  PublicKey: { fromString: vi.fn(), from: vi.fn() },
  Signature: { from: vi.fn() },
  Transaction: vi.fn(),
  Memo: { encode: vi.fn(), decode: vi.fn() },
  callRPC: vi.fn(),
  callRPCBroadcast: vi.fn(),
  callREST: vi.fn(),
  callWithQuorum: vi.fn(),
  config: { nodes: [], timeout: 1000, address_prefix: "STM" },
  utils: { operations: {}, makeBitMaskFilter: vi.fn() },
  // Keep a SINGLE vi.mock("@ecency/sdk") factory: vitest 4 no longer merges
  // duplicate vi.mock() calls for the same module (the first factory wins), so
  // a second factory's exports (e.g. hiveTxUtils) silently went missing and
  // broke specs that import them transitively.
  ConfigManager: { setQueryClient: vi.fn(), setQueryClientResolver: vi.fn() },
  CONFIG: {
    hiveNodes: [],
    privateApiHost: "https://ecency.com",
    imageHost: "https://images.ecency.com"
  },
  getBookmarksQueryOptions: vi.fn(),
  getAccountFullQueryOptions: vi.fn(() => ({ queryKey: ["account"], queryFn: vi.fn() })),
  getAccountDelegationsQueryOptions: vi.fn((username) => ({
    queryKey: ["assets", "account-delegations", username],
    queryFn: vi.fn()
  })),
  getBoostPlusPricesQueryOptions: vi.fn(() => ({ queryKey: ["boost-prices"], queryFn: vi.fn() })),
  getPointsQueryOptions: vi.fn(() => ({ queryKey: ["points"], queryFn: vi.fn() })),
  getProMembersQueryOptions: vi.fn(() => ({ queryKey: ["accounts", "pro-members"], queryFn: vi.fn() })),
  getTrendingTagsQueryOptions: vi.fn((limit?: number) => ({
    queryKey: ["tags", "trending", limit],
    queryFn: vi.fn(() => []),
    initialPageParam: "",
    getNextPageParam: () => undefined
  })),
  // Real pure impl (no deps) so pro-config's isProMember + its spec behave like production.
  proMembersSet: (members?: string[]) =>
    new Set((members ?? []).map((m: string) => m.toLowerCase())),
  getQuestsQueryOptions: vi.fn((username?: string) => ({
    queryKey: ["quests", "status", username],
    queryFn: vi.fn(),
    enabled: !!username
  })),
  getQuestCatalogEntry: vi.fn((tier: string, id: string) =>
    tier === "daily" && id === "post"
      ? { id: "post", tier: "daily", goal: 1, i18nKey: "post", icon: "pencil" }
      : undefined
  ),
  // Real pure impls (no deps) so the composer's short-reply hint behaves like production.
  QUEST_MIN_CONTENT_LENGTH: 25,
  measureQuestContentLength: (body?: string | null) =>
    Array.from((body ?? "").replace(/https?:\/\/\S+/g, "")).length,
  earnsQuestContentCredit: (body?: string | null) =>
    Array.from((body ?? "").replace(/https?:\/\/\S+/g, "")).length > 25,
  // Only the key builders the web app reaches for directly. Pure string arrays, so a
  // partial stand-in is safe; add more branches as consumers need them.
  QueryKeys: {
    quests: { status: (username?: string) => ["quests", "status", username] },
    accounts: {
      full: (username?: string) => ["get-account-full", username],
      mutedUsers: (username?: string) => ["accounts", "muted-users", username]
    }
  },
  getSpotlightsQueryOptions: vi.fn(() => ({
    queryKey: ["notifications", "spotlights"],
    queryFn: vi.fn()
  })),
  getBoostPlusAccountPricesQueryOptions: vi.fn(() => ({
    queryKey: ["boost-account"],
    queryFn: vi.fn()
  })),
  getAccountRcQueryOptions: vi.fn(() => ({
    queryKey: ["resource-credits", "account"],
    queryFn: vi.fn()
  })),
  getRcStatsQueryOptions: vi.fn(() => ({
    queryKey: ["resource-credits", "stats"],
    queryFn: vi.fn()
  })),
  estimateRcPrecheck: vi.fn(() => ({
    ready: false,
    willLikelyFail: false,
    currentMana: 0,
    maxMana: 0,
    avgCost: 0,
    estimatedCost: 0,
    deficit: 0,
    remaining: 0
  })),
  getRcDelegationPricesQueryOptions: vi.fn(() => ({
    queryKey: ["rc-delegation-prices"],
    queryFn: vi.fn()
  })),
  getRcDelegationActiveQueryOptions: vi.fn(() => ({
    queryKey: ["rc-delegation-active"],
    queryFn: vi.fn()
  })),
  useRcDelegation: vi.fn(() => ({ mutateAsync: vi.fn() })),
  buildRcDelegationOp: vi.fn(() => ({})),
  getDeletedEntryQueryOptions: vi.fn((author, permlink) => ({
    queryKey: ["posts", "deleted-entry", `@${author}/${permlink}`],
    queryFn: vi.fn()
  })),
  getEntryActiveVotesQueryOptions: vi.fn((entry) => ({
    queryKey: ["posts", "active-votes", entry?.author, entry?.permlink],
    queryFn: vi.fn()
  })),
  getDynamicPropsQueryOptions: vi.fn(() => ({
    queryKey: ["dynamic-props"],
    queryFn: vi.fn()
  })),
  votingPower: vi.fn(() => 0),
  votingValue: vi.fn(() => 0),
  useBookmarkAdd: vi.fn(),
  useBookmarkDelete: vi.fn(),
  useAccountRevokeKey: vi.fn(() => ({ mutateAsync: vi.fn() })),
  usrActivity: vi.fn(),
  buildProfileMetadata: vi.fn(),
  parseProfileMetadata: vi.fn(),
  canRevokeFromAuthority: vi.fn(() => true),
  buildRevokeKeysOp: vi.fn(() => ({})),
  // hive-tx compat layer re-exports
  broadcastOperations: vi.fn(),
  isWif: vi.fn(() => false),
  sha256: vi.fn(() => new Uint8Array(32)),
  calculateVPMana: vi.fn(() => ({ percentage: 10000, current_mana: 0, max_mana: 0 })),
  calculateRCMana: vi.fn(() => ({ percentage: 10000, current_mana: 0, max_mana: 0 })),
  hiveTxUtils: { operations: {}, makeBitMaskFilter: vi.fn() },
  hiveTxConfig: { nodes: [], timeout: 1000, address_prefix: "STM" },
  dedupeAndSortKeyAuths: vi.fn((...args: any[]) => args[0] || []),
  buildGrantPostingPermissionOp: vi.fn(),
  // The search query builder is pure logic with no dependencies, and several
  // components now import it from the SDK rather than from @/utils. Stubbing it
  // would make every spec that parses or builds a query assert against nothing,
  // so hand back the real implementation.
  ...(await import("../../../../packages/sdk/src/modules/search/query-builder"))
}));

vi.mock("@/features/post-renderer", () => ({
  EcencyRenderer: () => null,
  setupPostEnhancements: vi.fn()
}));

// ProBadge fetches the Pro roster with useQuery. It's now embedded in shared
// author labels (ProfilePopover, WavesListItemHeader, NotificationListItem, ...),
// so every container spec that renders those with a plain render() — no
// QueryClientProvider — would otherwise throw "No QueryClient set". Stub it to a
// provider-free no-op here; the badge's real membership behavior is covered by
// its own specs (pro-config + profile-popover-author), which override this mock.
vi.mock("@/features/pro/pro-badge", () => ({
  ProBadge: () => null
}));

vi.mock("@ecency/wallets", () => ({
  validateKey: vi.fn(),
  validateWif: vi.fn(),
  EXTERNAL_BLOCKCHAINS: [],
  useGetHiveEngineTokensBalances: vi.fn(),
  EcencyWalletCurrency: {
    BTC: "BTC",
    ETH: "ETH",
    BNB: "BNB",
    SOL: "SOL"
  }
}));

vi.mock("@/core/hooks/use-active-account", () => ({
  useActiveAccount: vi.fn(() => ({
    activeUser: null,
    username: null,
    account: null,
    isLoading: false,
    isPending: false,
    isError: false,
    isSuccess: false,
    error: null,
    refetch: vi.fn()
  }))
}));

vi.mock("react-tweet", () => ({}));
vi.mock("@/utils", () => ({
  random: vi.fn(),
  getAccessToken: vi.fn(() => "mock-token")
}));
