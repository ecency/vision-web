# @ecency/sdk

Full-featured Hive blockchain SDK with built-in transaction signing, RPC failover, and first-class React Query support.

Built and maintained by [Ecency](https://ecency.com), an open-source social platform on the Hive blockchain.

## What's Inside

- **Built-in transaction engine** — create, sign, and broadcast Hive transactions with ECDSA secp256k1 cryptography, memo encryption, and full serialization for all 50 operation types (built on an improved version of [hive-tx](https://github.com/mahdiyari/hive-tx) by Mahdi Yari)
- **Multi-node RPC with health tracking** — automatic failover across Hive API nodes with per-node failure tracking, rate-limit detection, stale-head awareness, and quorum-based consensus calls
- **Query and mutation option builders** powered by [@tanstack/react-query](https://tanstack.com/query)
- **26 domain modules**: accounts, ai, analytics, auth, bad-actors, bridge, communities, core, games, hive-engine, integrations, market, notifications, operations, points, polls, posts, private-api, promotions, proposals, quests, resource-credits, search, support, wallet, witnesses
- Central configuration via `CONFIG` / `ConfigManager` (RPC nodes, QueryClient, DMCA filtering)

## Why React Query?

The Ecency SDK is built on **React Query** (TanStack Query) to provide a production-ready data synchronization layer out of the box. React Query transforms how Hive applications handle server state, eliminating common pitfalls and dramatically improving user experience.

### Key Benefits

#### 1. **Automatic Caching & Deduplication**
Multiple components can request the same data without redundant network calls. React Query automatically:
- Caches responses by query key
- Deduplicates concurrent requests
- Shares cached data across components instantly

```ts
// Both components use the same query - only 1 API call is made
// Component A
useQuery(getAccountFullQueryOptions("ecency"));

// Component B (rendered simultaneously)
useQuery(getAccountFullQueryOptions("ecency")); // ← Uses cached data
```

#### 2. **Background Synchronization**
Data automatically stays fresh without manual refetching. React Query:
- Refetches stale data on window focus
- Updates data on network reconnection
- Supports configurable background polling
- Prevents showing outdated information

```ts
// Data refetches automatically when user returns to tab
const { data } = useQuery({
  ...getPostsRankedQueryOptions("trending", "", "", 20),
  staleTime: 60000, // Consider fresh for 60s
  refetchInterval: 120000 // Poll every 2 minutes
});
```

#### 3. **Optimistic Updates**
Instant UI feedback before blockchain confirmation:

```ts
const { mutateAsync } = useAccountUpdate(username, auth);

await mutateAsync(
  { metadata: newProfile },
  {
    // Update UI immediately
    onMutate: (variables) => {
      queryClient.setQueryData(
        getAccountFullQueryOptions(username).queryKey,
        (old) => ({ ...old, ...variables.metadata })
      );
    },
    // Rollback on error
    onError: (err, variables, context) => {
      queryClient.setQueryData(
        getAccountFullQueryOptions(username).queryKey,
        context.previousData
      );
    }
  }
);
```

#### 4. **SSR & Prefetching**
First-class server-side rendering support:

```tsx
// Next.js App Router example
export async function generateMetadata({ params }) {
  const queryClient = new QueryClient();

  // Prefetch on server
  await queryClient.prefetchQuery(
    getAccountFullQueryOptions(params.username)
  );

  // Data is hydrated on client instantly
  return { title: /* ... */ };
}
```

#### 5. **Loading & Error States**
Built-in state management eliminates boilerplate:

```ts
const { data, isLoading, error, isRefetching } = useQuery(
  getAccountFullQueryOptions("ecency")
);

if (isLoading) return <Spinner />;
if (error) return <ErrorMessage error={error} />;

return <Profile data={data} isRefreshing={isRefetching} />;
```

#### 6. **Dependent Queries**
Chain queries with automatic dependency tracking:

```ts
// Step 1: Fetch account
const { data: account } = useQuery(getAccountFullQueryOptions(username));

// Step 2: Fetch wallet only after account loads
const { data: wallet } = useQuery({
  ...getAccountWalletAssetInfoQueryOptions(username, "HIVE"),
  enabled: !!account // Wait for account
});
```

#### 7. **Pagination & Infinite Scroll**
Built-in pagination utilities:

```ts
const {
  data,
  fetchNextPage,
  hasNextPage,
  isFetchingNextPage
} = useInfiniteQuery(
  getPostsRankedInfiniteQueryOptions("trending", "hive-engine")
);

// Automatically manages page state and cursor tracking
```

### Why This Matters for Hive Apps

Hive applications face unique challenges:
- **High API latency**: Blockchain RPC calls can be slow (100-500ms)
- **Rate limits**: Excessive requests can hit node rate limits
- **Stale data**: Blockchain data changes frequently (new posts, votes, transfers)
- **Complex state**: Managing loading states, errors, and cache invalidation manually is error-prone

The Ecency SDK with React Query solves all of these:

✅ **Reduced API calls** by 70-90% through intelligent caching
✅ **Instant UI updates** with optimistic mutations
✅ **Zero manual cache management** - React Query handles invalidation
✅ **Better UX** with background updates and retry logic
✅ **Faster perceived performance** with prefetching and SSR
✅ **Less code** - no custom loading/error/caching logic needed

### How Other Apps Can Benefit

Any Hive application can leverage this SDK to:

1. **Drop custom data fetching code** - Use pre-built query options for all common Hive operations
2. **Share cache across features** - One query for account data serves entire app
3. **Add real-time features** easily with `refetchInterval` and optimistic updates
4. **Improve SEO** with SSR-ready queries that prefetch on server
5. **Reduce bundle size** - Share the SDK's type-safe queries instead of custom fetch logic

**Example: Building a Hive blog reader**

```tsx
import { useQuery, useInfiniteQuery } from "@tanstack/react-query";
import {
  getAccountFullQueryOptions,
  getPostQueryOptions,
  getPostsRankedInfiniteQueryOptions
} from "@ecency/sdk";

// Profile page - automatic caching
function ProfilePage({ username }) {
  const { data: account, isLoading } = useQuery(
    getAccountFullQueryOptions(username)
  );
  // ✅ Cached automatically, shared across components
  // ✅ Refetches on window focus
  // ✅ Handles loading/error states
}

// Feed page - infinite scroll
function FeedPage() {
  const { data, fetchNextPage, hasNextPage } = useInfiniteQuery(
    getPostsRankedInfiniteQueryOptions("trending")
  );
  // ✅ Automatic pagination
  // ✅ Background updates
  // ✅ Deduplicates concurrent requests
}

// Post page - dependent queries
function PostPage({ author, permlink }) {
  const { data: post } = useQuery(
    getPostQueryOptions(author, permlink)
  );

  const { data: authorAccount } = useQuery({
    ...getAccountFullQueryOptions(post?.author),
    enabled: !!post // Wait for post to load
  });
  // ✅ Efficient dependent loading
  // ✅ Shares cache with ProfilePage above
}
```

**Zero manual cache management. Zero custom fetch logic. Production-ready data layer.**

## Server-Side / Non-React Usage

For server-side tools, CLI scripts, or any environment that doesn't use React, import from `@ecency/sdk/hive` to avoid pulling in React and React Query dependencies:

```ts
import { Transaction, PrivateKey, callRPC, config } from "@ecency/sdk/hive";

// Sign and broadcast a transaction without React
const tx = new Transaction();
// ... build and sign
```

The `@ecency/sdk/hive` entry point exports the built-in transaction engine (signing, serialization, RPC, crypto) with zero React dependencies. This keeps your server bundle lean.

## Installation

```sh
npm install @ecency/sdk @tanstack/react-query react
# or
yarn add @ecency/sdk @tanstack/react-query react
```

`@ecency/sdk` and `@ecency/sdk/wallets` import `@tanstack/react-query` (and through it `react`) when they load, so install both alongside the SDK. They are declared as optional peers only so that projects using just `@ecency/sdk/hive` are not made to install React; that entry works without them:

```sh
npm install @ecency/sdk
```

## Quick Start (React Query)

```ts
import { getAccountFullQueryOptions } from "@ecency/sdk";
import { useQuery } from "@tanstack/react-query";

const { data, isLoading } = useQuery(getAccountFullQueryOptions("ecency"));
```

## Configuration

The SDK uses a shared configuration singleton for the Hive RPC client and query client.

```ts
import { ConfigManager, makeQueryClient } from "@ecency/sdk";

// Optional: provide your own QueryClient
ConfigManager.setQueryClient(makeQueryClient());
```

If your app sets up a custom Hive client, configure it at startup so all SDK
modules share the same instance.

## Query Options vs Direct Calls

Most APIs are exposed as **query option builders** to keep caching consistent:

```ts
import { getPostsRankedQueryOptions } from "@ecency/sdk";

// Use in React Query hooks
useQuery(getPostsRankedQueryOptions("trending", "", "", 20));
```

Direct request helpers still exist for non-React contexts (e.g., server jobs).
Prefer query options in UI code.

## Mutations

Mutations are provided as hooks that wrap `useMutation`:

```ts
import { useAccountUpdate } from "@ecency/sdk";

const auth = {
  accessToken,
  postingKey,
  loginType
};

const { mutateAsync } = useAccountUpdate(username, auth);
await mutateAsync({ metadata });
```

`AuthContext` properties are optional. The example above works without an
explicit `broadcast` function; the SDK will use `postingKey` or `accessToken`
if provided. If your app needs custom broadcasting (Keychain, HiveAuth, mobile),
add the optional `broadcast` function as shown below.

## Broadcasting and Auth Context

The SDK does not manage storage or platform-specific signers. Instead, it uses an
`AuthContext` that you pass from the app:

```ts
import type { AuthContext } from "@ecency/sdk";

const auth: AuthContext = {
  accessToken,
  postingKey,
  loginType,
  broadcast: async (operations, authority = "posting") => {
    // App-specific broadcaster (Keychain, HiveAuth, mobile wallet)
    return myBroadcaster(operations, authority);
  }
};
```

If `auth.broadcast` is provided, the SDK will call it for posting broadcasts and
keychain/hiveauth flows. Otherwise it falls back to:

- `postingKey` (direct signing via built-in transaction engine)
- `accessToken` (Hivesigner)

## Active/Owner Key Signing

For operations that must be signed with Active or Owner authority, use
`useSignOperationByKey` and pass the appropriate private key:

```ts
import { useSignOperationByKey } from "@ecency/sdk";

const { mutateAsync } = useSignOperationByKey(username);
await mutateAsync({
  operation: ["account_update", { /* ... */ }],
  keyOrSeed: activeKey
});
```

If you want the SDK to broadcast Active/Owner operations through an external
signer (Keychain, HiveAuth, mobile), provide an `auth.broadcast` handler and
use the `authority` argument:

```ts
const auth = {
  broadcast: (ops, authority = "posting") => {
    return myBroadcaster(ops, authority);
  }
};
```

## Module Layout

```text
src/hive-tx/            built-in transaction engine (signing, serialization, RPC, crypto)

src/modules/
  accounts/           account data, relationships, mutations
  ai/                 AI helpers (queries and mutations)
  analytics/          activity tracking and stats
  auth/               login, tokens, and auth helpers
  bad-actors/         bad-actor list queries
  bridge/             bridge API helpers
  communities/        community queries and utils
  core/               config, client, query manager, helpers
  games/              game-related endpoints
  hive-engine/        hive-engine data helpers
  integrations/       external integrations (hivesigner, 3speak, etc.)
  market/             market data and pricing
  notifications/      notification queries and enums
  operations/         operation signing helpers
  points/             points queries and mutations
  polls/              poll queries and mutations
  posts/              post queries, mutations, utils
  private-api/         private API helpers
  promotions/         promotion queries
  proposals/          proposal queries and mutations
  quests/             quest queries and mutations
  resource-credits/   RC stats helpers
  search/             search queries
  support/            support queries and mutations
  wallet/             wallet-related queries and types
  witnesses/          witness queries and votes
```

## SSR / RSC Notes

- Query options are safe to use on the server, but hooks are client-only.
- If you use Next.js App Router, keep hook usage in client components.

## Versioning

See `CHANGELOG.md` for release notes.
