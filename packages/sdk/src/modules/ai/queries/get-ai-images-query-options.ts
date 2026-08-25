import { queryOptions } from "@tanstack/react-query";
import { CONFIG, getBoundFetch, QueryKeys } from "../../core";
import type { AiImageHistoryItem } from "../types";

/**
 * Per-user AI image generation history (the backend's last 20 successful generations).
 * The backend resolves the user from the validated code, so no username is sent; the
 * key still carries it so each account caches its own history.
 */
export function getAiImagesQueryOptions(username: string | undefined, accessToken: string) {
  return queryOptions({
    queryKey: QueryKeys.ai.images(username),
    queryFn: async () => {
      const fetchApi = getBoundFetch();
      const response = await fetchApi(CONFIG.privateApiHost + "/private-api/ai-images", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ code: accessToken }),
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch AI image history: ${response.status}`);
      }

      return (await response.json()) as AiImageHistoryItem[];
    },
    staleTime: 30_000,
    enabled: !!username && !!accessToken,
  });
}
