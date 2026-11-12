import { ConfigManager, getBoundFetch, QueryKeys } from "@/modules/core";
import { queryOptions } from "@tanstack/react-query";
import { normalizeEntry } from "../utils/normalize-entry";

// TODO: replace any with Entry
export function getPromotedPostsQuery<T extends any>(
  type: "feed" | "waves" = "feed"
) {
  return queryOptions({
    queryKey: QueryKeys.posts.promoted(type),
    queryFn: async () => {
      const baseUrl = ConfigManager.getValidatedBaseUrl();
      const url = new URL("/private-api/promoted-entries", baseUrl);
      if (type === "waves") {
        url.searchParams.append("short_content", "1");
      }

      const fetchApi = getBoundFetch();
      const response = await fetchApi(url.toString(), {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
      });
      const data = await response.json();
      // These rows carry raw active_votes: normalize them like bridge reads
      // (no observer, so the vote is stated as unknown and looked up).
      return (Array.isArray(data)
        ? data.map((row) => (row && typeof row === "object" ? normalizeEntry(row, "") : row))
        : data) as T[];
    },
  });
}
