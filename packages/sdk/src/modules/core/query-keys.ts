/**
 * Centralized query key definitions for all SDK queries.
 *
 * These key builders are the single source of truth for React Query cache keys.
 * Both SDK query options and web app consumers should reference these
 * instead of using inline string arrays.
 *
 * @example
 * ```typescript
 * import { QueryKeys } from "@ecency/sdk";
 *
 * // In query options
 * queryKey: QueryKeys.posts.entry(`/@${author}/${permlink}`)
 *
 * // In cache invalidation
 * queryClient.invalidateQueries({ queryKey: QueryKeys.posts.drafts(username) })
 * ```
 */
/** Strip trailing undefined values so the key works as a prefix for partialMatchKey */
function key(...parts: unknown[]): unknown[] {
  let end = parts.length;
  while (end > 0 && parts[end - 1] === undefined) {
    end--;
  }
  return parts.slice(0, end);
}

export const QueryKeys = {
  // ===========================================================================
  // Posts
  // ===========================================================================
  posts: {
    entry: (entryPath: string) => ["posts", "entry", entryPath],
    postHeader: (author: string, permlink?: string) =>
      ["posts", "post-header", author, permlink],
    content: (author: string, permlink: string) =>
      ["posts", "content", author, permlink],
    contentReplies: (author: string, permlink: string) =>
      ["posts", "content-replies", author, permlink],
    accountPosts: (
      username: string,
      filter: string,
      limit: number,
      observer: string
    ) => ["posts", "account-posts", username, filter, limit, observer],
    accountPostsPage: (
      username: string,
      filter: string,
      startAuthor: string,
      startPermlink: string,
      limit: number,
      observer: string
    ) =>
      [
        "posts",
        "account-posts-page",
        username,
        filter,
        startAuthor,
        startPermlink,
        limit,
        observer,
      ],
    userPostVote: (username: string, author: string, permlink: string) =>
      ["posts", "user-vote", username, author, permlink],
    reblogs: (username: string, limit: number) =>
      ["posts", "reblogs", username, limit],
    entryActiveVotes: (author?: string, permlink?: string) =>
      ["posts", "entry-active-votes", author, permlink],
    rebloggedBy: (author: string, permlink: string) =>
      ["posts", "reblogged-by", author, permlink],
    tips: (author: string, permlink: string) =>
      ["posts", "tips", author, permlink],
    normalize: (author: string, permlink: string) =>
      ["posts", "normalize", author, permlink],
    drafts: (activeUsername?: string) =>
      ["posts", "drafts", activeUsername],
    draftsInfinite: (activeUsername?: string, limit?: number) =>
      key("posts", "drafts", "infinite", activeUsername, limit),
    schedules: (activeUsername?: string) =>
      ["posts", "schedules", activeUsername],
    schedulesInfinite: (activeUsername?: string, limit?: number) =>
      key("posts", "schedules", "infinite", activeUsername, limit),
    fragments: (username?: string) =>
      ["posts", "fragments", username],
    fragmentsInfinite: (username?: string, limit?: number) =>
      key("posts", "fragments", "infinite", username, limit),
    images: (username?: string) => ["posts", "images", username],
    galleryImages: (activeUsername?: string) =>
      ["posts", "gallery-images", activeUsername],
    imagesInfinite: (username?: string, limit?: number) =>
      key("posts", "images", "infinite", username, limit),
    promoted: (type: string) => ["posts", "promoted", type],
    _promotedPrefix: ["posts", "promoted"],
    accountPostsBlogPrefix: (username: string) =>
      ["posts", "account-posts", username, "blog"] as const,
    postsRanked: (
      sort: string,
      tag: string,
      limit: number,
      observer: string
    ) => ["posts", "posts-ranked", sort, tag, limit, observer],
    postsRankedPage: (
      sort: string,
      startAuthor: string,
      startPermlink: string,
      limit: number,
      tag: string,
      observer: string
    ) =>
      [
        "posts",
        "posts-ranked-page",
        sort,
        startAuthor,
        startPermlink,
        limit,
        tag,
        observer,
      ],
    discussions: (
      author: string,
      permlink: string,
      order: string,
      observer: string
    ) => ["posts", "discussions", author, permlink, order, observer],
    discussion: (author: string, permlink: string, observer: string) =>
      ["posts", "discussion", author, permlink, observer],
    deletedEntry: (entryPath: string) =>
      ["posts", "deleted-entry", entryPath],
    commentHistory: (
      author: string,
      permlink: string,
      onlyMeta: boolean
    ) => ["posts", "comment-history", author, permlink, onlyMeta],
    trendingTags: () => ["posts", "trending-tags"],
    trendingTagsWithStats: (limit: number) =>
      ["posts", "trending-tags", "stats", limit],
    wavesFeed: (
      params: {
        containers?: string[];
        tag?: string;
        following?: string;
        author?: string;
        observer?: string;
        limit?: number;
      } = {}
    ) => [
      "posts",
      "waves",
      "feed",
      params.tag ?? "",
      params.following ?? "",
      params.author ?? "",
      params.observer ?? "",
      params.limit ?? 0,
      [...(params.containers ?? [])].sort().join(",")
    ],
    shortsFeed: (
      params: {
        containers?: string[];
        tag?: string;
        author?: string;
        observer?: string;
        limit?: number;
      } = {}
    ) => [
      "posts",
      "waves",
      "shorts",
      params.tag ?? "",
      params.author ?? "",
      params.observer ?? "",
      params.limit ?? 0,
      [...(params.containers ?? [])].sort().join(",")
    ],
    wavesByHost: (host: string) =>
      ["posts", "waves", "by-host", host],
    wavesByTag: (host: string, tag: string) =>
      ["posts", "waves", "by-tag", host, tag],
    wavesFollowing: (host: string, username: string) =>
      ["posts", "waves", "following", host, username],
    wavesTrendingTags: (host: string, hours: number) =>
      ["posts", "waves", "trending-tags", host, hours],
    wavesByAccount: (host: string, username: string) =>
      ["posts", "waves", "by-account", host, username],
    wavesTrendingAuthors: (host: string) =>
      ["posts", "waves", "trending-authors", host],
    _prefix: ["posts"],
  },

  // ===========================================================================
  // Accounts
  // ===========================================================================
  accounts: {
    full: (username?: string) => ["get-account-full", username],
    list: (...usernames: string[]) =>
      ["accounts", "list", ...usernames],
    friends: (
      following: string,
      mode: string,
      followType: string,
      limit: number
    ) => ["accounts", "friends", following, mode, followType, limit],
    searchFriends: (username: string, mode: string, query: string) =>
      ["accounts", "friends", "search", username, mode, query],
    subscriptions: (username: string) =>
      ["accounts", "subscriptions", username],
    followCount: (username: string) =>
      ["accounts", "follow-count", username],
    recoveries: (username: string) =>
      ["accounts", "recoveries", username],
    pendingRecovery: (username: string) =>
      ["accounts", "recoveries", username, "pending-request"],
    checkWalletPending: (username: string, code: string | null) =>
      ["accounts", "check-wallet-pending", username, code],
    mutedUsers: (username: string) =>
      ["accounts", "muted-users", username],
    following: (
      follower: string,
      startFollowing: string,
      followType: string,
      limit: number
    ) =>
      [
        "accounts",
        "following",
        follower,
        startFollowing,
        followType,
        limit,
      ],
    followers: (
      following: string,
      startFollower: string,
      followType: string,
      limit: number
    ) =>
      [
        "accounts",
        "followers",
        following,
        startFollower,
        followType,
        limit,
      ],
    search: (query: string, excludeList?: string[]) =>
      ["accounts", "search", query, excludeList],
    profiles: (accounts: string[], observer: string) =>
      ["accounts", "profiles", accounts, observer],
    lookup: (query: string, limit: number) =>
      ["accounts", "lookup", query, limit],
    transactions: (username: string, group: string, limit: number) =>
      ["accounts", "transactions", username, group, limit],
    favorites: (activeUsername?: string) =>
      ["accounts", "favorites", activeUsername],
    favoritesInfinite: (activeUsername?: string, limit?: number) =>
      key("accounts", "favorites", "infinite", activeUsername, limit),
    checkFavorite: (activeUsername: string, targetUsername: string) =>
      [
        "accounts",
        "favorites",
        "check",
        activeUsername,
        targetUsername,
      ],
    relations: (reference: string | undefined, target: string | undefined) =>
      ["accounts", "relations", reference, target],
    bots: () => ["accounts", "bots"],
    voteHistory: (username: string, limit: number) =>
      ["accounts", "vote-history", username, limit],
    reputations: (query: string, limit: number) =>
      ["accounts", "reputations", query, limit],
    bookmarks: (activeUsername?: string) =>
      ["accounts", "bookmarks", activeUsername],
    bookmarksInfinite: (activeUsername?: string, limit?: number) =>
      key("accounts", "bookmarks", "infinite", activeUsername, limit),
    referrals: (username: string) =>
      ["accounts", "referrals", username],
    referralsStats: (username: string) =>
      ["accounts", "referrals-stats", username],
    proMembers: () => ["accounts", "pro-members"],
    _prefix: ["accounts"],
  },

  // ===========================================================================
  // Notifications
  // ===========================================================================
  notifications: {
    announcements: () => ["notifications", "announcements"],
    spotlights: () => ["notifications", "spotlights"],
    list: (activeUsername?: string, filter?: string) =>
      ["notifications", activeUsername, filter],
    unreadCount: (activeUsername?: string) =>
      ["notifications", "unread", activeUsername],
    settings: (activeUsername?: string) =>
      ["notifications", "settings", activeUsername],
    _prefix: ["notifications"],
  },

  // ===========================================================================
  // Core
  // ===========================================================================
  core: {
    rewardFund: (fundName: string) =>
      ["core", "reward-fund", fundName],
    dynamicProps: () => ["core", "dynamic-props"],
    chainProperties: () => ["core", "chain-properties"],
    _prefix: ["core"],
  },

  // ===========================================================================
  // Communities
  // ===========================================================================
  communities: {
    single: (name?: string, observer?: string) =>
      ["community", "single", name, observer],
    /** Prefix key for matching all observer variants of a community */
    singlePrefix: (name: string) =>
      ["community", "single", name] as const,
    context: (username: string, communityName: string) =>
      ["community", "context", username, communityName],
    rewarded: () => ["communities", "rewarded"],
    list: (sort: string, query: string, limit: number) =>
      ["communities", "list", sort, query, limit],
    subscribers: (communityName: string) =>
      ["communities", "subscribers", communityName],
    subscribersInfinite: (communityName: string) =>
      ["communities", "subscribers", "infinite", communityName],
    accountNotifications: (account: string, limit: number) =>
      ["communities", "account-notifications", account, limit],
  },

  // ===========================================================================
  // Proposals
  // ===========================================================================
  proposals: {
    list: () => ["proposals", "list"],
    proposal: (id: number) => ["proposals", "proposal", id],
    votes: (proposalId: number, voter: string, limit: number) =>
      ["proposals", "votes", proposalId, voter, limit],
    votesPrefix: (proposalId: number) =>
      ["proposals", "votes", proposalId] as const,
    votesByUser: (voter: string) =>
      ["proposals", "votes", "by-user", voter],
  },

  // ===========================================================================
  // Search
  // ===========================================================================
  search: {
    topics: (q: string, limit: number) => ["search", "topics", q, limit],
    path: (q: string) => ["search", "path", q],
    account: (q: string, limit: number) =>
      ["search", "account", q, limit],
    results: (
      q: string,
      sort: string,
      hideLow: boolean | string,
      since?: string,
      scrollId?: string,
      votes?: number
    ) => {
      const normalizedHideLow = typeof hideLow === "string" ? hideLow === "1" || hideLow === "true" : hideLow;
      return ["search", q, sort, normalizedHideLow, since, scrollId, votes] as const;
    },
    controversialRising: (what: string, tag: string) =>
      ["search", "controversial-rising", what, tag],
    similarEntries: (author: string, permlink: string, content?: string) =>
      content
        ? ["search", "similar-entries", author, permlink, content]
        : ["search", "similar-entries", author, permlink],
    api: (
      q: string,
      sort: string,
      hideLow: boolean,
      since?: string,
      votes?: number,
      includeNsfw?: boolean
    ) => key("search", "api", q, sort, hideLow, since, votes, includeNsfw),
  },

  // ===========================================================================
  // Witnesses
  // ===========================================================================
  witnesses: {
    list: (limit: number) => ["witnesses", "list", limit],
    votes: (username: string | undefined) => ["witnesses", "votes", username],
    proxy: () => ["witnesses", "proxy"],
    voters: (
      witness: string,
      page: number,
      pageSize: number,
      sort: string,
      direction: string
    ) => ["witnesses", "voters", witness, page, pageSize, sort, direction],
    voterCount: (witness: string) =>
      ["witnesses", "voter-count", witness],
  },

  // ===========================================================================
  // Wallet
  // ===========================================================================
  wallet: {
    outgoingRcDelegations: (username: string, limit: number) =>
      ["wallet", "outgoing-rc-delegations", username, limit],
    vestingDelegations: (username: string, limit: number) =>
      ["wallet", "vesting-delegations", username, limit],
    withdrawRoutes: (account: string) =>
      ["wallet", "withdraw-routes", account],
    incomingRc: (username: string) =>
      ["wallet", "incoming-rc", username],
    conversionRequests: (account: string) =>
      ["wallet", "conversion-requests", account],
    receivedVestingShares: (username: string) =>
      ["wallet", "received-vesting-shares", username],
    savingsWithdraw: (account: string) =>
      ["wallet", "savings-withdraw", account],
    openOrders: (user: string) =>
      ["wallet", "open-orders", user],
    collateralizedConversionRequests: (account: string) =>
      ["wallet", "collateralized-conversion-requests", account],
    recurrentTransfers: (username: string) =>
      ["wallet", "recurrent-transfers", username],
    balanceHistory: (username: string, coinType: string, pageSize: number) =>
      ["wallet", "balance-history", username, coinType, pageSize],
    aggregatedHistory: (
      username: string,
      coinType: string,
      granularity?: "yearly" | "monthly" | "daily"
    ) =>
      granularity === undefined
        ? ["wallet", "aggregated-history", username, coinType]
        : ["wallet", "aggregated-history", username, coinType, granularity],
    portfolio: (
      username: string,
      onlyEnabled: string,
      currency: string
    ) =>
      ["wallet", "portfolio", "v2", username, onlyEnabled, currency],
  },

  // ===========================================================================
  // Assets
  // ===========================================================================
  assets: {
    hiveGeneralInfo: (username: string) =>
      ["assets", "hive", "general-info", username],
    hiveTransactions: (username: string, limit: number, filterKey: string) =>
      ["assets", "hive", "transactions", username, limit, filterKey],
    hiveWithdrawalRoutes: (username: string) =>
      ["assets", "hive", "withdrawal-routes", username],
    hiveMetrics: (bucketSeconds: number) =>
      ["assets", "hive", "metrics", bucketSeconds],
    hbdGeneralInfo: (username: string) =>
      ["assets", "hbd", "general-info", username],
    hbdTransactions: (
      username: string,
      limit: number,
      filterKey: string
    ) => ["assets", "hbd", "transactions", username, limit, filterKey],
    hivePowerGeneralInfo: (username: string) =>
      ["assets", "hive-power", "general-info", username],
    hivePowerDelegates: (username: string) =>
      ["assets", "hive-power", "delegates", username],
    hivePowerDelegatings: (username: string) =>
      ["assets", "hive-power", "delegatings", username],
    hivePowerTransactions: (
      username: string,
      limit: number,
      filterKey: string
    ) =>
      [
        "assets",
        "hive-power",
        "transactions",
        username,
        limit,
        filterKey,
      ],
    pointsGeneralInfo: (username: string) =>
      ["assets", "points", "general-info", username],
    pointsTransactions: (username: string, type: string) =>
      ["assets", "points", "transactions", username, type],
    ecencyAssetInfo: (username: string, asset: string, currency: string) =>
      ["ecency-wallets", "asset-info", username, asset, currency],
  },

  // ===========================================================================
  // Market
  // ===========================================================================
  market: {
    statistics: () => ["market", "statistics"],
    orderBook: (limit: number) => ["market", "order-book", limit],
    history: (seconds: number, startDate: number, endDate: number) =>
      ["market", "history", seconds, startDate, endDate],
    feedHistory: () => ["market", "feed-history"],
    hiveHbdStats: () => ["market", "hive-hbd-stats"],
    data: (
      coin: string,
      vsCurrency: string,
      fromTs: number,
      toTs: number
    ) => ["market", "data", coin, vsCurrency, fromTs, toTs],
    tradeHistory: (limit: number, start: number, end: number) =>
      ["market", "trade-history", limit, start, end],
    currentMedianHistoryPrice: () =>
      ["market", "current-median-history-price"],
  },

  // ===========================================================================
  // Analytics
  // ===========================================================================
  analytics: {
    discoverCuration: (duration: string) =>
      ["analytics", "discover-curation", duration],
    pageStats: (
      url: string,
      dimensions: string,
      metrics: string,
      dateRange: string
    ) =>
      ["analytics", "page-stats", url, dimensions, metrics, dateRange],
    discoverLeaderboard: (duration: string) =>
      ["analytics", "discover-leaderboard", duration],
  },

  // ===========================================================================
  // Promotions
  // ===========================================================================
  promotions: {
    promotePrice: () => ["promotions", "promote-price"],
    boostPlusPrices: () => ["promotions", "boost-plus-prices"],
    boostPlusAccounts: (account: string) =>
      ["promotions", "boost-plus-accounts", account],
  },

  // ===========================================================================
  // Resource Credits
  // ===========================================================================
  resourceCredits: {
    account: (username: string) =>
      ["resource-credits", "account", username],
    stats: () => ["resource-credits", "stats"],
    resourceParams: () => ["resource-credits", "resource-params"],
  },

  // ===========================================================================
  // Points
  // ===========================================================================
  points: {
    points: (username: string, filter: number) =>
      ["points", username, filter],
    _prefix: (username: string) => ["points", username],
  },

  // ===========================================================================
  // Polls
  // ===========================================================================
  polls: {
    details: (author: string, permlink: string) =>
      ["polls", "details", author, permlink],
    vote: (author?: string, permlink?: string) =>
      author && permlink
        ? ["polls", "vote", author, permlink]
        : ["polls", "vote"],
    _prefix: ["polls"],
  },

  // ===========================================================================
  // Operations
  // ===========================================================================
  operations: {
    chainProperties: () => ["operations", "chain-properties"],
  },

  // ===========================================================================
  // Games
  // ===========================================================================
  games: {
    statusCheck: (gameType: string, username: string) =>
      ["games", "status-check", gameType, username],
  },

  quests: {
    status: (username: string | undefined) => ["quests", "status", username],
  },

  // ===========================================================================
  // Newsletter (digest subscriptions + sender API)
  // ===========================================================================
  newsletter: {
    subscriptions: (username: string | undefined) => [
      "newsletter",
      "subscriptions",
      username,
    ],
    sender: (type: string, target: string, username: string | undefined) => [
      "newsletter",
      "sender",
      type,
      target,
      username,
    ],
    issues: (type: string, target: string, username: string | undefined) => [
      "newsletter",
      "issues",
      type,
      target,
      username,
    ],
    posts: (
      type: string,
      target: string,
      username: string | undefined,
      limit: number,
    ) => ["newsletter", "posts", type, target, username, limit],
    _prefix: ["newsletter"],
  },

  // ===========================================================================
  // Support Ecency
  // ===========================================================================
  support: {
    settings: (username: string | undefined) => ["support", "settings", username],
    _prefix: ["support"],
  },

  // ===========================================================================
  // Bad Actors
  // ===========================================================================
  badActors: {
    list: () => ["bad-actors", "list"],
    _prefix: ["bad-actors"],
  },

  // ===========================================================================
  // AI
  // ===========================================================================
  ai: {
    prices: () => ["ai", "prices"] as const,
    assistPrices: (username?: string) => ["ai", "assist-prices", username] as const,
    transcribePrice: (username?: string) => ["ai", "transcribe-price", username] as const,
    _prefix: ["ai"],
  },
} as const;
