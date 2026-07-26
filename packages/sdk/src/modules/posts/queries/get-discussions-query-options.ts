import { CONFIG, QueryKeys } from "@/modules/core";
import { queryOptions } from "@tanstack/react-query";
import { Entry } from "../types";
import { filterDmcaEntry } from "../utils/filter-dmca-entries";
import { getDiscussion } from "@/modules/bridge";
import { callRPC } from "@/modules/core/hive-tx";

export enum SortOrder {
  trending = "trending",
  author_reputation = "author_reputation",
  votes = "votes",
  created = "created",
}

function parseAsset(value: string): { amount: number; symbol: string } {
  const match = value.match(/^(\d+\.?\d*)\s*([A-Z]+)$/);
  if (!match) return { amount: 0, symbol: "" };
  return {
    amount: parseFloat(match[1]),
    symbol: match[2],
  };
}

export function sortDiscussions(
  entry: Entry,
  discussion: Entry[],
  order: SortOrder
) {
  const allPayout = (c: Entry) =>
    parseAsset(c.pending_payout_value).amount +
    parseAsset(c.author_payout_value).amount +
    parseAsset(c.curator_payout_value).amount;

  const absNegative = (a: Entry) => a.net_rshares < 0;
  const isPinned = (a: Entry) =>
    entry.json_metadata?.pinned_reply === `${a.author}/${a.permlink}`;

  const sortOrders = {
    trending: (a: Entry, b: Entry) => {
      if (absNegative(a)) {
        return 1;
      }

      if (absNegative(b)) {
        return -1;
      }

      const _a = allPayout(a);
      const _b = allPayout(b);
      if (_a !== _b) {
        return _b - _a;
      }

      return 0;
    },
    author_reputation: (a: Entry, b: Entry) => {
      const keyA = a.author_reputation;
      const keyB = b.author_reputation;

      if (keyA > keyB) return -1;
      if (keyA < keyB) return 1;

      return 0;
    },
    votes: (a: Entry, b: Entry) => {
      const keyA = a.children;
      const keyB = b.children;

      if (keyA > keyB) return -1;
      if (keyA < keyB) return 1;

      return 0;
    },
    created: (a: Entry, b: Entry) => {
      if (absNegative(a)) {
        return 1;
      }

      if (absNegative(b)) {
        return -1;
      }

      const keyA = Date.parse(a.created);
      const keyB = Date.parse(b.created);

      if (keyA > keyB) return -1;
      if (keyA < keyB) return 1;

      return 0;
    },
  };

  const sorted = discussion.sort(sortOrders[order]);
  const pinnedIndex = sorted.findIndex((i) => isPinned(i));
  const pinned = sorted[pinnedIndex];
  if (pinnedIndex >= 0) {
    sorted.splice(pinnedIndex, 1);
    sorted.unshift(pinned);
  }
  return sorted;
}

export function getDiscussionsQueryOptions(
  entry: Entry,
  order: SortOrder = SortOrder.created,
  enabled: boolean = true,
  observer?: string
) {
  // Anonymous readers fall back to CONFIG.defaultObserver rather than the post
  // author. Author-as-observer only helps the minority of authors who curate a
  // mute list; everyone else's comment section came back unfiltered, so the
  // shared moderation account is the better default for logged-out traffic.
  const resolvedObserver = observer || CONFIG.defaultObserver;

  return queryOptions({
    queryKey: QueryKeys.posts.discussions(entry?.author, entry?.permlink, order, resolvedObserver),
    queryFn: async () => {
      if (!entry) {
        return [];
      }

      const response = await callRPC("bridge.get_discussion", {
        author: entry.author,
        permlink: entry.permlink,
        observer: resolvedObserver,
      });

      const results = response
        ? Array.from(Object.values(response as Record<string, Entry>))
        : [];
      return filterDmcaEntry(results);
    },
    enabled: enabled && !!entry,
    select: (data: Entry[]) => sortDiscussions(entry, data, order),
    // Preserve optimistic entries during refetch by using structural sharing
    // This ensures newly added comments (is_optimistic: true) aren't wiped out
    // when blockchain hasn't indexed them yet
    structuralSharing: (oldData, newData) => {
      if (!oldData || !newData) return newData;

      // Find optimistic entries in old data that aren't in new data yet
      const optimisticEntries = (oldData as Entry[]).filter(
        (entry: Entry) => entry.is_optimistic === true
      );

      const fetchedPermlinks = new Set(
        (newData as Entry[]).map((e: Entry) => `${e.author}/${e.permlink}`)
      );

      const missingOptimistic = optimisticEntries.filter(
        (opt: Entry) => !fetchedPermlinks.has(`${opt.author}/${opt.permlink}`)
      );

      // If there are optimistic entries missing from new data, preserve them
      if (missingOptimistic.length > 0) {
        return [...(newData as Entry[]), ...missingOptimistic];
      }

      return newData;
    },
  });
}

export function getDiscussionQueryOptions(
  author: string,
  permlink: string,
  observer?: string,
  enabled = true
) {
  const resolvedObserver = observer || CONFIG.defaultObserver;

  return queryOptions({
    queryKey: QueryKeys.posts.discussion(author, permlink, resolvedObserver),
    enabled: enabled && !!author && !!permlink,
    queryFn: async () =>
      getDiscussion(author, permlink, resolvedObserver) as Promise<Record<
        string,
        Entry
      > | null>,
  });
}
