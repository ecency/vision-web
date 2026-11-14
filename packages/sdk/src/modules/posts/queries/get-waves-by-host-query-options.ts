import { InfiniteData, infiniteQueryOptions } from "@tanstack/react-query";
import { QueryKeys } from "@/modules/core";
import { Entry, WaveEntry } from "../types";
import {
  getVisibleFirstLevelThreadItems,
  mapThreadItemsToWaveEntries
} from "../utils/waves-helpers";
import { bridgeV2Call } from "@/modules/bridge/requests";
import { entryKey, normalizeEntry } from "../utils/normalize-entry";

const THREAD_CONTAINER_BATCH_SIZE = 5;
const MAX_CONTAINERS_TO_SCAN = 50;

interface ThreadsResult {
  entries: WaveEntry[];
}

async function getThreads(
  host: string,
  pageParam?: WaveEntry
): Promise<ThreadsResult | null> {
  let startAuthor = pageParam?.author;
  let startPermlink = pageParam?.permlink;
  let scannedContainers = 0;
  let skipContainerKey = pageParam ? entryKey(pageParam) : undefined;

  while (scannedContainers < MAX_CONTAINERS_TO_SCAN) {
    interface AccountPostsParams {
      sort: string;
      account: string;
      limit: number;
      start_author?: string;
      start_permlink?: string;
    }

    const rpcParams: AccountPostsParams = {
      sort: "posts", // ProfileFilter.posts
      account: host,
      limit: THREAD_CONTAINER_BATCH_SIZE,
      ...(startAuthor ? { start_author: startAuthor } : {}),
      ...(startPermlink ? { start_permlink: startPermlink } : {})
    };

    let containers: WaveEntry[];
    try {
      // No observer: the containers are only scanned for their threads.
      const raw = await bridgeV2Call<WaveEntry[] | null>(
        "get_account_posts",
        rpcParams as unknown as Record<string, unknown>
      );
      containers = Array.isArray(raw)
        ? (raw.map((c) => normalizeEntry(c, "")) as unknown as WaveEntry[])
        : (raw as unknown as WaveEntry[]);
    } catch (err) {
      console.error("[SDK] getThreads get_account_posts error:", err);
      return null;
    }

    if (!containers || containers.length === 0) {
      return null;
    }

    const normalizedContainers = containers.map((container) => {
      container.id = entryKey(container);
      container.host = host;
      return container;
    });

    for (const container of normalizedContainers) {
      if (skipContainerKey && container.id === skipContainerKey) {
        skipContainerKey = undefined;
        continue;
      }

      scannedContainers += 1;

      if (container.stats?.gray) {
        startAuthor = container.author;
        startPermlink = container.permlink;
        continue;
      }

      let visibleItems: Entry[];
      try {
        visibleItems = await getVisibleFirstLevelThreadItems(container);
      } catch (err) {
        // A transient bridge.get_discussion failure (RPC timeout, node error, or
        // an oversized response on a large late-day container) must not collapse
        // the whole feed. Treat this container as temporarily unavailable and scan
        // the next one — mirroring the empty-container handling below and the
        // get_account_posts guard above. The query's refetch interval retries it.
        console.error("[SDK] getThreads get_discussion error:", err);
        startAuthor = container.author;
        startPermlink = container.permlink;
        continue;
      }

      if (visibleItems.length === 0) {
        startAuthor = container.author;
        startPermlink = container.permlink;
        continue;
      }

      return {
        entries: mapThreadItemsToWaveEntries(visibleItems, container, host)
      };
    }

    const lastContainer = normalizedContainers[normalizedContainers.length - 1];

    if (!lastContainer) {
      return null;
    }

    startAuthor = lastContainer.author;
    startPermlink = lastContainer.permlink;
  }

  return null;
}

// Page = array of WaveEntry; Cursor = WaveEntry (container) or undefined
type WavesPage = WaveEntry[];
type WavesCursor = WaveEntry | undefined;

export function getWavesByHostQueryOptions(host: string) {
  return infiniteQueryOptions<
    WavesPage,
    Error,
    InfiniteData<WavesPage, WavesCursor>,
    string[],
    WavesCursor
  >({
    queryKey: QueryKeys.posts.wavesByHost(host),
    initialPageParam: undefined as WavesCursor,

    queryFn: async ({ pageParam }: { pageParam: WavesCursor }) => {
      const result = await getThreads(host, pageParam);
      if (!result) return []; // no items to show for this page

      return result.entries;
    },

    getNextPageParam: (lastPage: WavesPage): WavesCursor => lastPage?.[0]?.container,
  });
}
