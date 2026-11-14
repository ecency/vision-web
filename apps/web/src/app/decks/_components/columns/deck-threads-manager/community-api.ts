import { ThreadItemEntry } from "./identifiable-entry";
import { entryKey, getPostsRankedQueryOptions } from "@ecency/sdk";
import { FetchQueryOptions } from "@tanstack/query-core";
import { QueryIdentifiers } from "@/core/react-query";
import { getQueryClient } from "@/core/react-query";

export async function fetchThreadsFromCommunity(
  host: string,
  community: string,
  lastContainer?: ThreadItemEntry
): Promise<ThreadItemEntry[]> {
  const threadItems = await getQueryClient().fetchQuery(
    getPostsRankedQueryOptions(
      "created",
      lastContainer?.author,
      lastContainer?.permlink,
      50,
      community
    )
  );

  const threadItemsWithHost = threadItems.map((item) => {
    const titleEnd = item.title.slice(item.title.length - 4, item.title.length);
    const bodyStart = item.body.slice(0, 4);
    if (titleEnd === " ..." && bodyStart === "... ") {
      item.body = `${item.title.slice(0, item.title.length - 4)}${item.body.slice(
        4,
        item.body.length
      )}`;
    }

    return {
      ...item,
      id: entryKey(item),
      host
    };
  });

  const lastContainerItem = threadItemsWithHost[threadItemsWithHost.length - 1];
  const threadItemsWithContainer = threadItemsWithHost.map((item) => ({
    ...item,
    container: lastContainerItem
  }));

  return threadItemsWithContainer as ThreadItemEntry[];
}

export function communityThreadsQuery(
  ...args: Parameters<typeof fetchThreadsFromCommunity>
): FetchQueryOptions<ThreadItemEntry[]> {
  return {
    queryKey: [QueryIdentifiers.COMMUNITY_THREADS, { ...args }],
    queryFn: () => fetchThreadsFromCommunity(...args)
  };
}
