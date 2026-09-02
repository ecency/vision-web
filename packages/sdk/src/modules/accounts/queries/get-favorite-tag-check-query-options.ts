import { CONFIG, getBoundFetch, QueryKeys } from "@/modules/core";
import { queryOptions } from "@tanstack/react-query";
import { normalizeTag } from "../utils/normalize-tag";

/**
 * Whether the active user follows a hashtag.
 *
 * The tag is normalised here, so `#Photography` and `photography` share one cache
 * entry and one request. A value that is not a usable tag (or a community name)
 * disables the query and reads as "not followed".
 * @param activeUsername - The logged-in user's username
 * @param code - Access token for authentication
 * @param tag - The tag to check, in any spelling
 */
export function getFavoriteTagCheckQueryOptions(
  activeUsername: string | undefined,
  code: string | undefined,
  tag: string | undefined
) {
  const normalized = normalizeTag(tag);

  return queryOptions({
    queryKey: QueryKeys.accounts.checkFavoriteTag(activeUsername ?? "", normalized ?? ""),
    enabled: !!activeUsername && !!code && normalized !== null,
    queryFn: async () => {
      if (!activeUsername || !code) {
        throw new Error("[SDK][Accounts][FavoriteTags] – missing auth");
      }
      if (normalized === null) {
        return false;
      }
      const fetchApi = getBoundFetch();
      const response = await fetchApi(
        CONFIG.privateApiHost + "/private-api/favorite-tags-check",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            code,
            tag: normalized,
          }),
        }
      );

      if (!response.ok) {
        throw new Error(
          `[SDK][Accounts][FavoriteTags] – favorite-tags-check failed with status ${response.status}: ${response.statusText}`
        );
      }

      const result = await response.json();
      if (typeof result !== "boolean") {
        throw new Error(
          `[SDK][Accounts][FavoriteTags] – favorite-tags-check returned invalid type: expected boolean, got ${typeof result}`
        );
      }

      return result;
    },
  });
}
