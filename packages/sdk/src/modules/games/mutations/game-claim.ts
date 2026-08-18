import { CONFIG, getBoundFetch } from "@/modules/core";
import { useMutation } from "@tanstack/react-query";
import { GameClaim } from "../types";
import { useRecordActivity } from "@/modules/analytics/mutations";

/**
 * POST a single game claim and return the parsed JSON body.
 *
 * A failed post-game comes back from the edge as an HTML gateway page (a 502 was
 * the trail on ECENCY-NEXT-1FCJ), and `response.json()` on that throws a bare
 * `SyntaxError` naming neither the endpoint nor the cause. Check the status and
 * the content type first, then fail with a STABLE, low-cardinality message
 * (content type + status, never the raw body) so these group as a single Sentry
 * issue instead of fragmenting on every distinct error page.
 *
 * Exported for unit testing; the hook below wraps it.
 */
export async function gameClaimRequest(
  code: string,
  gameType: "spin",
  key: string
): Promise<GameClaim> {
  const fetchApi = getBoundFetch();
  const response = await fetchApi(
    CONFIG.privateApiHost + "/private-api/post-game",
    {
      method: "POST",
      body: JSON.stringify({
        game_type: gameType,
        code,
        key,
      }),
      headers: {
        "Content-Type": "application/json",
      },
    }
  );

  // Media types are case-insensitive; normalise once and reuse in every branch.
  const contentType = (response.headers.get("content-type") ?? "")
    .split(";")[0]
    .trim()
    .toLowerCase();
  const body = await response.text();

  if (!response.ok) {
    // Only fold a short JSON error body into the message; an HTML gateway page
    // (e.g. 502/503) would otherwise fragment the Sentry group per distinct page.
    const detail =
      body && contentType.includes("json") ? `: ${body.slice(0, 200)}` : "";
    throw new Error(
      `[SDK][Games] – failed with status ${response.status}${detail}`
    );
  }

  if (!contentType.includes("json")) {
    throw new Error(
      `[SDK][Games] – expected JSON but received "${contentType || "empty"}" response (status ${response.status})`
    );
  }

  try {
    return JSON.parse(body) as GameClaim;
  } catch {
    throw new Error(
      `[SDK][Games] – malformed JSON response (status ${response.status})`
    );
  }
}

export function useGameClaim(
  username: string | undefined,
  code: string | undefined,
  gameType: "spin",
  key: string
) {
  const { mutateAsync: recordActivity } = useRecordActivity(
    username,
    "spin-rolled"
  );

  return useMutation({
    mutationKey: ["games", "post", gameType, username],
    mutationFn: async () => {
      if (!username || !code) {
        throw new Error("[SDK][Games] – missing auth");
      }

      return gameClaimRequest(code, gameType, key);
    },
    onSuccess() {
      recordActivity();
    },
  });
}
