import { QueryKeys } from "@/modules/core";
import { InfiniteData, infiniteQueryOptions, queryOptions } from "@tanstack/react-query";
import { Entry } from "../types";
import { filterDmcaEntry } from "../utils/filter-dmca-entries";
import { getAccountPosts } from "@/modules/bridge";

type PageParam = {
  author: string | undefined;
  permlink: string | undefined;
  hasNextPage: boolean;
};
type Page = Entry[];

export function getAccountPostsInfiniteQueryOptions(
  username: string | undefined,
  filter = "posts",
  limit = 20,
  observer = "",
  enabled = true
) {
  return infiniteQueryOptions<
    Page,
    Error,
    InfiniteData<Page, PageParam>,
    (string | number)[],
    PageParam
  >({
    queryKey: QueryKeys.posts.accountPosts(username ?? "", filter, limit, observer),
    enabled: !!username && enabled,
    initialPageParam: {
      author: undefined,
      permlink: undefined,
      hasNextPage: true,
    } as PageParam,

    queryFn: async ({ pageParam, signal }) => {
      if (!pageParam?.hasNextPage || !username) return [];

      const response = await getAccountPosts(
        filter,
        username,
        pageParam.author ?? "",
        pageParam.permlink ?? "",
        limit,
        observer,
        signal
      );

      return filterDmcaEntry(response ?? []) as Entry[];
    },

    getNextPageParam: (lastPage: Page): PageParam | undefined => {
      const last = lastPage?.[lastPage.length - 1];
      // Only consider there's a next page if we got a full page of results
      // A partial page means we've reached the end
      const hasNextPage = (lastPage?.length ?? 0) === limit;

      if (!hasNextPage) {
        return undefined;
      }

      return {
        author: last?.author,
        permlink: last?.permlink,
        hasNextPage,
      };
    },
  });
}

export function getAccountPostsQueryOptions(
  username: string | undefined,
  filter = "posts",
  start_author: string = "",
  start_permlink: string = "",
  limit = 20,
  observer = "",
  enabled = true
) {
  return queryOptions({
    queryKey: QueryKeys.posts.accountPostsPage(username ?? "", filter, start_author, start_permlink, limit, observer),
    enabled: !!username && enabled,
    queryFn: async ({ signal } = {} as any) => {
      if (!username) {
        return [];
      }

      const response = await getAccountPosts(
        filter,
        username,
        start_author,
        start_permlink,
        limit,
        observer,
        signal
      );

      return filterDmcaEntry(response ?? []) as Entry[];
    },
  });
}
