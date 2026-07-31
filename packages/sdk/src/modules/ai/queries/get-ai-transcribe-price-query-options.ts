import { queryOptions } from "@tanstack/react-query";
import { CONFIG, getBoundFetch, QueryKeys } from "../../core";
import type { AiTranscribePrice } from "../types";

/**
 * Dictation pricing. Kept on its own route rather than folded into
 * /private-api/ai-assist-price: that endpoint returns a list of flat-cost actions and
 * shipped clients render every entry as a selectable assist action, so adding a
 * metered one there would surface in older clients as an action they cannot perform.
 *
 * Everything except `free_remaining` is static, so this is cheap to hold and lets the
 * client price a clip locally while the user is still recording.
 */
export function getAiTranscribePriceQueryOptions(
  username: string | undefined,
  accessToken: string | undefined
) {
  return queryOptions({
    queryKey: QueryKeys.ai.transcribePrice(username),
    queryFn: async () => {
      const fetchApi = getBoundFetch();
      const response = await fetchApi(CONFIG.privateApiHost + "/private-api/ai-transcribe-price", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ code: accessToken })
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch AI transcribe price: ${response.status}`);
      }

      return (await response.json()) as AiTranscribePrice;
    },
    staleTime: 60_000,
    enabled: !!accessToken
  });
}
