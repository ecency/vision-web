import {
  InfiniteData,
  infiniteQueryOptions,
  queryOptions
} from "@tanstack/react-query";
import { QueryKeys } from "@/modules/core";
import { Subscription } from "../types";
import { callRPC } from "@/modules/core/hive-tx";

/**
 * hivemind caps `bridge.list_subscribers` at 100 rows per call, regardless of a
 * larger requested limit.
 */
export const SUBSCRIBERS_PAGE_SIZE = 100;

type SubscribersPage = Subscription[];
type SubscribersCursor = string | null;

/**
 * Fetches one page of subscribers.
 *
 * `last` is omitted on the first page rather than passed as an empty string:
 * hivemind reads `""` as a real cursor positioned before the first account and
 * returns zero rows.
 */
async function fetchSubscribersPage(
  communityName: string,
  last: SubscribersCursor
): Promise<SubscribersPage> {
  const response = await callRPC("bridge.list_subscribers", {
    community: communityName,
    limit: SUBSCRIBERS_PAGE_SIZE,
    ...(last ? { last } : {})
  });
  return (response as Subscription[] | null) ?? [];
}

/**
 * Get the first page of subscribers for a community.
 *
 * @deprecated Returns at most {@link SUBSCRIBERS_PAGE_SIZE} subscribers, which
 * for most communities is a small fraction of the total while looking like the
 * complete list. Prefer {@link getCommunitySubscribersInfiniteQueryOptions}
 * unless a single page is genuinely all that is wanted.
 *
 * @param communityName - The community name (e.g., "hive-123456")
 */
export function getCommunitySubscribersQueryOptions(communityName: string) {
  return queryOptions({
    queryKey: QueryKeys.communities.subscribers(communityName),
    queryFn: async () => fetchSubscribersPage(communityName, null),
    staleTime: 60000
  });
}

/**
 * Get all subscribers for a community, paged with hivemind's `last` cursor.
 *
 * @param communityName - The community name (e.g., "hive-123456")
 */
export function getCommunitySubscribersInfiniteQueryOptions(
  communityName: string
) {
  return infiniteQueryOptions<
    SubscribersPage,
    Error,
    InfiniteData<SubscribersPage, SubscribersCursor>,
    string[],
    SubscribersCursor
  >({
    queryKey: QueryKeys.communities.subscribersInfinite(communityName),
    initialPageParam: null as SubscribersCursor,
    queryFn: async ({ pageParam }: { pageParam: SubscribersCursor }) =>
      fetchSubscribersPage(communityName, pageParam),
    // The cursor is the previous page's last account name. A short page is the
    // end of the list.
    getNextPageParam: (lastPage: SubscribersPage): SubscribersCursor =>
      lastPage?.length >= SUBSCRIBERS_PAGE_SIZE
        ? lastPage[lastPage.length - 1]?.[0] ?? null
        : null,
    staleTime: 60000
  });
}
