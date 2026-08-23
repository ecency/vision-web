import { infiniteQueryOptions, queryOptions } from "@tanstack/react-query";
import { ConfigManager, QueryKeys } from "@/modules/core";
import { Entry, WaveEntry } from "../types";
import { normalizeWaveEntryFromApi } from "../utils/waves-helpers";

const DEFAULT_FEED_LIMIT = 20;

type WavesFeedRow = Entry & {
  post_id: number;
  // The wave's container account (e.g. ecency.waves, leothreads), so a mixed
  // cross-container feed can be rendered and acted on per item.
  host?: string;
  // Opaque keyset cursor pointing just past this row.
  _cursor?: string;
  container?: (Entry & { post_id: number }) | null;
  parent?: (Entry & { post_id: number }) | null;
};

export type WavesFeedEntry = WaveEntry & { _cursor?: string };

export interface WavesFeedParams {
  /** Scope to one or more container accounts; omit for the full combined feed. */
  containers?: string[];
  /** Only waves carrying this tag (across all containers). */
  tag?: string;
  /** Only waves from accounts this user follows (across all containers). */
  following?: string;
  /** Only this author's waves (across all containers); the per-author feed. */
  author?: string;
  /**
   * The viewing user; exclude authors they currently mute. Ecency's own
   * moderation mutes are applied by esync regardless of this value, so leaving
   * it unset drops the viewer's personal mutes, not the platform ones.
   */
  observer?: string;
  /** Page size (default 20). */
  limit?: number;
}

interface NormalizedFeedParams {
  containers: string[];
  tag?: string;
  following?: string;
  author?: string;
  observer?: string;
  limit: number;
}

function normalizeParams(params: WavesFeedParams): NormalizedFeedParams {
  return {
    containers: params.containers ?? [],
    tag: params.tag?.trim() || undefined,
    following: params.following?.trim().toLowerCase() || undefined,
    author: params.author?.trim().toLowerCase() || undefined,
    observer: params.observer?.trim().toLowerCase() || undefined,
    limit: params.limit ?? DEFAULT_FEED_LIMIT
  };
}

async function fetchWavesFeedPage(
  { containers, tag, following, author, observer, limit }: NormalizedFeedParams,
  cursor: string | undefined,
  signal?: AbortSignal
): Promise<WavesFeedEntry[]> {
  const baseUrl = ConfigManager.getValidatedBaseUrl();
  const url = new URL("/private-api/waves/feed", baseUrl);
  url.searchParams.set("limit", String(limit));
  if (cursor) {
    url.searchParams.set("cursor", cursor);
  }
  containers.forEach((container) => url.searchParams.append("container", container));
  if (tag) {
    url.searchParams.set("tag", tag);
  }
  if (following) {
    url.searchParams.set("following", following);
  }
  if (author) {
    url.searchParams.set("author", author);
  }
  if (observer) {
    url.searchParams.set("observer", observer);
  }

  const response = await fetch(url.toString(), {
    method: "GET",
    signal
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch waves feed: ${response.status}`);
  }

  const data = (await response.json()) as WavesFeedRow[];

  if (!Array.isArray(data) || data.length === 0) {
    return [];
  }

  return data
    .map((row) => {
      const entry = normalizeWaveEntryFromApi(row, row.host ?? "");
      if (!entry) {
        return null;
      }
      return { ...entry, _cursor: row._cursor } as WavesFeedEntry;
    })
    .filter((entry): entry is WavesFeedEntry => Boolean(entry));
}

/**
 * Combined cross-container waves feed (the chronological "For You" stream, and
 * the Following / Tag feeds via filters).
 *
 * A single esync-backed call returns the newest waves across every indexed
 * container, already merged and time-ordered, with keyset (cursor) pagination,
 * replacing the per-container chain-RPC scan. The optional `tag` / `following`
 * filters narrow the same stream without changing the cursor.
 */
export function getWavesFeedQueryOptions(params: WavesFeedParams = {}) {
  const normalized = normalizeParams(params);
  const { containers, tag, following, author, observer, limit } = normalized;

  return infiniteQueryOptions({
    queryKey: QueryKeys.posts.wavesFeed({ containers, tag, following, author, observer, limit }),
    initialPageParam: undefined as string | undefined,

    queryFn: ({ pageParam, signal }) => fetchWavesFeedPage(normalized, pageParam, signal),

    // Keyset pagination. A short page (fewer than `limit` rows) is the
    // end-of-feed signal; on a full page the server always returns the next
    // cursor on the last row. Stopping (rather than looping) is the safe
    // fallback if that cursor were ever absent.
    getNextPageParam: (lastPage: WavesFeedEntry[]) => {
      if (lastPage.length < limit) {
        return undefined;
      }
      return lastPage[lastPage.length - 1]?._cursor;
    }
  });
}

/**
 * Page-one of the combined feed as a plain (non-infinite) query under a distinct
 * key, for the "new waves" poll. Separate from {@link getWavesFeedQueryOptions}
 * so refreshing it never truncates the infinite feed's loaded pages.
 */
export function getWavesLatestFeedQueryOptions(params: WavesFeedParams = {}) {
  const normalized = normalizeParams(params);
  const { containers, tag, following, author, observer, limit } = normalized;

  return queryOptions({
    queryKey: [
      ...QueryKeys.posts.wavesFeed({ containers, tag, following, author, observer, limit }),
      "latest"
    ],
    staleTime: 0,
    queryFn: ({ signal }) => fetchWavesFeedPage(normalized, undefined, signal)
  });
}
