import { CONFIG, getBoundFetch, getQueryClient, QueryKeys } from "@/modules/core";
import { useMutation } from "@tanstack/react-query";
import { makeIdempotencyKey } from "./make-idempotency-key";
import type { ListenStatus } from "../types";

export interface ListenUnlockParams {
  author: string;
  /** A freshly validated access token; the hook's token is used when omitted */
  code?: string;
  permlink: string;
  /** The post's last edit time as the client sees it (a hint for regeneration) */
  updated?: string;
  /**
   * Reuse the key of an unlock whose answer never arrived: the backend replays it
   * instead of charging again. A fresh one is generated when omitted.
   */
  idempotency_key?: string;
}

// Answers that leave the outcome unknown: the unlock may have been charged even
// though no answer reached us. Retried with the SAME key, which is a free replay.
const GATEWAY_STATUSES = new Set([502, 504, 520, 522, 524]);
const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 2000;

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * POST one unlock. Unlocking is quick (generation is asynchronous), so unlike AI
 * assist there is no in-progress polling: only transport and gateway failures are
 * retried, with the same key. Anything else is thrown with `status` and the parsed
 * body as `data` (402 insufficient_points, 422 unsupported, 409 idempotency_conflict).
 */
export async function listenUnlockRequest(
  code: string,
  params: ListenUnlockParams,
  sleep: (ms: number) => Promise<void> = wait
): Promise<ListenStatus> {
  const fetchApi = getBoundFetch();
  const body = JSON.stringify({
    code,
    author: params.author,
    permlink: params.permlink,
    idempotency_key: params.idempotency_key || makeIdempotencyKey(),
    ...(params.updated ? { updated: params.updated } : {}),
  });

  for (let attempt = 0; ; attempt++) {
    let response: Response;
    try {
      response = await fetchApi(CONFIG.privateApiHost + "/private-api/listen", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
      });
    } catch (e) {
      if (attempt < MAX_RETRIES) {
        await sleep(RETRY_DELAY_MS);
        continue;
      }
      throw e;
    }
    if (response.ok) {
      return (await response.json()) as ListenStatus;
    }
    if (GATEWAY_STATUSES.has(response.status) && attempt < MAX_RETRIES) {
      await sleep(RETRY_DELAY_MS);
      continue;
    }
    let text = "";
    try {
      text = await response.text();
    } catch {
      // body unavailable
    }
    let data: Record<string, unknown> = {};
    try {
      data = JSON.parse(text);
    } catch {
      // not JSON
    }
    throw Object.assign(
      new Error(`[SDK][AI][Listen] – unlock failed with status ${response.status}`),
      { status: response.status, data }
    );
  }
}

export function useListenUnlock(username: string | undefined, accessToken: string | undefined) {
  return useMutation({
    mutationKey: QueryKeys.ai.listenUnlock(username),
    mutationFn: async (params: ListenUnlockParams): Promise<ListenStatus> => {
      if (!username) {
        throw new Error("[SDK][AI][Listen] – username wasn't provided");
      }
      const code = params.code ?? accessToken;
      if (!code) {
        throw new Error("[SDK][AI][Listen] – access token wasn't found");
      }
      return listenUnlockRequest(code, params);
    },
    onSuccess: (data, params) => {
      if (!username) return;
      // The answer is the post's new status: show it at once, then let polling run.
      getQueryClient().setQueryData(
        QueryKeys.ai.listenStatus(params.author, params.permlink, username),
        data
      );
    },
    onError: (_error, params) => {
      if (!username) return;
      // The outcome may be unknown (a lost answer); ask for the real status.
      getQueryClient().invalidateQueries({
        queryKey: QueryKeys.ai.listenStatus(params.author, params.permlink, username),
      });
    },
    onSettled: () => {
      // Charged on success, and possibly on a failure whose answer was lost.
      if (username) getQueryClient().invalidateQueries({ queryKey: QueryKeys.points._prefix(username) });
    },
  });
}
