import type { DehydratedState, QueryClient } from "@tanstack/react-query";
import type { Entry } from "@/entities";

/**
 * Drop the full `active_votes` array from entries in a dehydrated React Query
 * state before it is streamed to the client.
 *
 * `bridge.get_post` / `bridge.get_ranked_posts` return every vote as a
 * `{ voter, rshares }` record. On a high-vote post or a tag/community feed that
 * is tens to hundreds of KB of voter data that:
 *   - anonymous visitors (the bulk of cold-load / crawler traffic) never read, and
 *   - logged-in clients only read after hydration to colour the vote button.
 * The full voter list shown in the votes dialog is already fetched on demand
 * (`getEntryActiveVotesQueryOptions`) when the dialog opens, so the eager copy is
 * redundant. Removing it shrinks the streamed payload + client JSON parse /
 * hydration cost (a TTI/INP/bandwidth win — the LCP text already paints from HTML).
 *
 * Hydration-safety: we only strip entries that also carry `stats.total_votes`, so
 * every consumer keeps a stable vote COUNT (`isHiddenPost` reads it), and we CLONE
 * rather than mutate — the server render and SEO indexability read the live
 * (un-dehydrated) cache, which keeps the full data.
 */

function isStripableEntry(value: unknown): value is Entry {
  if (!value || typeof value !== "object") {
    return false;
  }
  const entry = value as Entry;
  // Strip only when a vote COUNT survives elsewhere, so consumers stay
  // hydration-stable: posts carry it on stats.total_votes; search results carry
  // it as a top-level total_votes.
  //
  // net_votes is deliberately NOT accepted. It is upvotes MINUS downvotes, not a
  // voter count — live posts show active_votes 848 vs net_votes 820, and 453 vs
  // 423. entry-votes reads
  // `stats.total_votes || active_votes.length || net_votes || total_votes`, so
  // stripping a shape whose only count is net_votes (condenser_api.get_content
  // has no stats object) would drop the displayed number to the net figure.
  //
  // Nothing needs it: the entry page keeps that metadata-only condenser query
  // out of the dehydrated payload entirely, so no such entry reaches the client
  // there. Accepting it here would buy nothing and leave this shared helper —
  // also used by the feed and profile routes — able to undercount.
  const hasCount =
    typeof entry.stats?.total_votes === "number" || typeof entry.total_votes === "number";
  return Array.isArray(entry.active_votes) && entry.active_votes.length > 0 && hasCount;
}

function stripEntry<T>(value: T): T {
  return isStripableEntry(value) ? ({ ...value, active_votes: [] } as T) : value;
}

function stripEntryArray<T>(items: T[]): T[] {
  let changed = false;
  const next = items.map((item) => {
    const stripped = stripEntry(item);
    if (stripped !== item) {
      changed = true;
    }
    return stripped;
  });
  return changed ? next : items;
}

// A feed page is either an Entry[] (ranked/account posts) or a search response
// object that holds the entries under `results`.
function stripPage(page: unknown): unknown {
  if (Array.isArray(page)) {
    return stripEntryArray(page);
  }
  if (page && typeof page === "object" && Array.isArray((page as { results?: unknown }).results)) {
    const results = stripEntryArray((page as { results: unknown[] }).results);
    return results === (page as { results: unknown[] }).results ? page : { ...page, results };
  }
  return page;
}

function stripQueryData(data: unknown): unknown {
  if (!data || typeof data !== "object") {
    return data;
  }
  // Infinite query (feed / profile / community): { pages: Page[], pageParams }
  if (Array.isArray((data as { pages?: unknown }).pages)) {
    const pages = (data as { pages: unknown[] }).pages;
    let changed = false;
    const next = pages.map((page) => {
      const stripped = stripPage(page);
      if (stripped !== page) {
        changed = true;
      }
      return stripped;
    });
    return changed ? { ...data, pages: next } : data;
  }
  // Plain array of entries (e.g. a discussion list)
  if (Array.isArray(data)) {
    return stripEntryArray(data as unknown[]);
  }
  // Single entry (post / wave page)
  const single = stripEntry(data);
  if (single !== data) {
    return single;
  }
  // Otherwise it may be a keyed map of entries (e.g. a raw bridge.get_discussion
  // object: { "author/permlink": Entry, ... }). Strip any value that is itself a
  // stripable entry and leave everything else untouched.
  return stripKeyedEntries(data as Record<string, unknown>);
}

function stripKeyedEntries(obj: Record<string, unknown>): Record<string, unknown> {
  let changed = false;
  const next: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    const stripped = stripEntry(value);
    if (stripped !== value) {
      changed = true;
    }
    next[key] = stripped;
  }
  return changed ? next : obj;
}

export function stripActiveVotesFromDehydratedState(
  state: DehydratedState,
  currentUser?: string
): DehydratedState {
  // Only strip for ANONYMOUS requests. Logged-in requests keep the full
  // active_votes: isVoted (the "you voted" highlight) reads them client-side
  // after auth loads, and a logged-in cache variant only ever holds public vote
  // data. Anonymous / crawler requests never need isVoted, and their cache
  // variant carries no user-specific data, so stripping there is safe and
  // shrinks the payload that the bulk of cold-load / SEO traffic downloads.
  if (currentUser) {
    return state;
  }
  return {
    ...state,
    queries: state.queries.map((query) => {
      const data = query.state?.data;
      const stripped = stripQueryData(data);
      if (stripped === data) {
        return query;
      }
      return { ...query, state: { ...query.state, data: stripped } };
    })
  };
}

/**
 * Strip active_votes from a feed value passed DIRECTLY as a React prop (e.g. a
 * profile page's `initialFeed` InfiniteData). Such props are serialized into the
 * RSC component tree — a separate channel from the dehydrated React Query state —
 * so stripActiveVotesFromDehydratedState alone does not cover them. Anonymous-only,
 * same as the dehydrated-state strip.
 */
export function stripActiveVotesFromValue<T>(value: T, currentUser?: string): T {
  if (currentUser) {
    return value;
  }
  return stripQueryData(value) as T;
}

/**
 * Strip every entry-bearing query in a request-scoped cache IN PLACE, and return
 * the stored object that corresponds to `value`.
 *
 * Prefer this over stripping the dehydrated state and the props separately.
 * SSR data reaches the client through two channels — the dehydrated React Query
 * state and props serialized into the RSC tree — and React Flight dedupes by
 * REFERENCE. Producing a separate clone per channel makes Flight serialize the
 * whole payload (post bodies included) twice, which can cost more than the voter
 * arrays save. Rewriting the cache instead means `dehydrate()` emits the very
 * object the page also passes as a prop, so there is exactly one copy.
 *
 * ⚠️ `setQueryData` applies structural sharing (replaceEqualDeep) and stores —
 * and returns — a THIRD object that is neither the previous value nor the one
 * handed to it. That is why this returns the STORED reference rather than the
 * clone: using the clone would silently reintroduce the duplicate.
 *
 * Anonymous-only, like the other two helpers: logged-in requests keep the full
 * arrays because active_votes is the only source of the viewer's own vote.
 */
export function stripAnonEntryCacheInPlace<T>(
  queryClient: QueryClient,
  value: T,
  currentUser?: string
): T {
  if (currentUser) {
    return value;
  }

  let result = value;
  for (const query of queryClient.getQueryCache().getAll()) {
    const data = query.state.data;
    const stripped = stripQueryData(data);
    if (stripped === data) {
      continue;
    }
    const stored = queryClient.setQueryData(query.queryKey, stripped) ?? stripped;
    // Identity bridge: hand the caller back the object now in the cache, so the
    // prop it renders and the dehydrated copy are the same reference.
    if (data === (value as unknown)) {
      result = stored as T;
    }
  }
  return result;
}
