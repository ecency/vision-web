import { infiniteQueryOptions } from "@tanstack/react-query";
import { ConfigManager, QueryKeys } from "@/modules/core";
import { Entry, WaveEntry } from "../types";
import { normalizeWaveEntryFromApi } from "../utils/waves-helpers";

const DEFAULT_FEED_LIMIT = 20;

/** The 3Speak video a short embeds, as returned by esync /api/waves/shorts. */
export interface ShortVideo {
  platform: string;
  author: string;
  permlink: string;
  embed_url: string;
  thumbnail_url: string | null;
  duration_secs: number | null;
}

type ShortsFeedRow = Entry & {
  post_id: number;
  host?: string;
  video?: ShortVideo;
  _cursor?: string;
  container?: (Entry & { post_id: number }) | null;
  parent?: (Entry & { post_id: number }) | null;
};

export type ShortsFeedEntry = WaveEntry & {
  /** The embedded 3Speak video reference for the reels player. */
  video?: ShortVideo;
  _cursor?: string;
};

export interface ShortsFeedParams {
  /** Scope to one or more container accounts; omit for the full combined feed. */
  containers?: string[];
  /** Only shorts carrying this tag (across all containers). */
  tag?: string;
  /** Only this author's shorts (across all containers). */
  author?: string;
  /**
   * The viewing user; exclude authors they currently mute. Ecency's own
   * moderation mutes are applied by esync regardless of this value.
   */
  observer?: string;
  /** Page size (default 20). */
  limit?: number;
}

interface NormalizedShortsParams {
  containers: string[];
  tag?: string;
  author?: string;
  observer?: string;
  limit: number;
}

function normalizeParams(params: ShortsFeedParams): NormalizedShortsParams {
  return {
    containers: params.containers ?? [],
    tag: params.tag?.trim() || undefined,
    author: params.author?.trim().toLowerCase() || undefined,
    observer: params.observer?.trim().toLowerCase() || undefined,
    limit: params.limit ?? DEFAULT_FEED_LIMIT
  };
}

async function fetchShortsFeedPage(
  { containers, tag, author, observer, limit }: NormalizedShortsParams,
  cursor: string | undefined,
  signal?: AbortSignal
): Promise<ShortsFeedEntry[]> {
  const baseUrl = ConfigManager.getValidatedBaseUrl();
  const url = new URL("/private-api/waves/shorts", baseUrl);
  url.searchParams.set("limit", String(limit));
  if (cursor) {
    url.searchParams.set("cursor", cursor);
  }
  containers.forEach((container) => url.searchParams.append("container", container));
  if (tag) {
    url.searchParams.set("tag", tag);
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
    throw new Error(`Failed to fetch shorts feed: ${response.status}`);
  }

  const data = (await response.json()) as ShortsFeedRow[];

  if (!Array.isArray(data) || data.length === 0) {
    return [];
  }

  return data
    .map((row) => {
      const entry = normalizeWaveEntryFromApi(row, row.host ?? "");
      if (!entry) {
        return null;
      }
      return {
        ...entry,
        // A lightweight feed row may omit active_votes; EntryVoteBtn (which uses
        // this entry as React Query initialData) calls .some() on it, so default
        // to an empty array to avoid a crash before the full post query loads.
        active_votes: entry.active_votes ?? [],
        video: row.video,
        _cursor: row._cursor
      } as ShortsFeedEntry;
    })
    .filter((entry): entry is ShortsFeedEntry => Boolean(entry));
}

/**
 * Combined cross-container shorts (reels) feed: waves that embed a 3Speak video.
 *
 * Backed by esync /api/waves/shorts (via /private-api/waves/shorts). Same shape,
 * keyset pagination and filters as {@link getWavesFeedQueryOptions}, plus a
 * `video` block per item for the vertical reels player. There is no `following`
 * filter in v1.
 */
export function getShortsFeedQueryOptions(params: ShortsFeedParams = {}) {
  const normalized = normalizeParams(params);
  const { containers, tag, author, observer, limit } = normalized;

  return infiniteQueryOptions({
    queryKey: QueryKeys.posts.shortsFeed({ containers, tag, author, observer, limit }),
    initialPageParam: undefined as string | undefined,

    queryFn: ({ pageParam, signal }) => fetchShortsFeedPage(normalized, pageParam, signal),

    // Keyset pagination: a short page (fewer than `limit` rows) ends the feed;
    // on a full page the server returns the next cursor on the last row.
    getNextPageParam: (lastPage: ShortsFeedEntry[]) => {
      if (lastPage.length < limit) {
        return undefined;
      }
      return lastPage[lastPage.length - 1]?._cursor;
    }
  });
}
