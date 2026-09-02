import { CONFIG, getBoundFetch, normalizeToWrappedResponse, QueryKeys } from "@/modules/core";
import { infiniteQueryOptions, queryOptions } from "@tanstack/react-query";
import { AccountFavoriteTag } from "../types";

/**
 * The hashtags the active user follows, newest first.
 * @param activeUsername - The logged-in user's username
 * @param code - Access token for authentication
 */
export function getFavoriteTagsQueryOptions(
  activeUsername: string | undefined,
  code: string | undefined
) {
  return queryOptions({
    queryKey: QueryKeys.accounts.favoriteTags(activeUsername),
    enabled: !!activeUsername && !!code,
    queryFn: async () => {
      if (!activeUsername || !code) {
        throw new Error("[SDK][Accounts][FavoriteTags] – missing auth");
      }
      const fetchApi = getBoundFetch();
      const response = await fetchApi(
        CONFIG.privateApiHost + "/private-api/favorite-tags",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ code }),
        }
      );
      if (!response.ok) {
        throw new Error(`Failed to fetch favorite tags: ${response.status}`);
      }
      return (await response.json()) as AccountFavoriteTag[];
    },
  });
}

export function getFavoriteTagsInfiniteQueryOptions(
  activeUsername: string | undefined,
  code: string | undefined,
  limit: number = 10
) {
  return infiniteQueryOptions({
    queryKey: QueryKeys.accounts.favoriteTagsInfinite(activeUsername, limit),
    queryFn: async ({ pageParam = 0 }) => {
      if (!activeUsername || !code) {
        return {
          data: [],
          pagination: {
            total: 0,
            limit,
            offset: 0,
            has_next: false,
          },
        };
      }

      const fetchApi = getBoundFetch();
      const response = await fetchApi(
        `${CONFIG.privateApiHost}/private-api/favorite-tags?format=wrapped&offset=${pageParam}&limit=${limit}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ code }),
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to fetch favorite tags: ${response.status}`);
      }

      const json = await response.json();
      return normalizeToWrappedResponse<AccountFavoriteTag>(json, limit);
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage) => {
      if (lastPage.pagination.has_next) {
        return lastPage.pagination.offset + lastPage.pagination.limit;
      }
      return undefined;
    },
    enabled: !!activeUsername && !!code,
  });
}
