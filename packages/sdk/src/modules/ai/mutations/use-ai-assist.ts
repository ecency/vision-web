import { CONFIG, getBoundFetch, getQueryClient, QueryKeys } from "@/modules/core";
import { useMutation } from "@tanstack/react-query";
import { makeIdempotencyKey } from "./make-idempotency-key";
import type { AiAssistResponse } from "../types";

export interface AiAssistParams {
  action: string;
  text: string;
  code?: string;
}

// Answers that leave the outcome unknown: the assist may have run, and been charged,
// even though no result reached us. Retrying with the SAME key returns that result
// for free instead of paying for a second one. A fresh key per attempt would defeat
// the dedupe in exactly the case it exists for.
//
// A gateway error can also hide a definite failure the backend already refunded,
// so gateway answers get only a couple of retries. 409 in_progress means the first
// attempt is still running; polling it is free, so it continues until an overall
// deadline long enough for that attempt to have finished either way.
const GATEWAY_STATUSES = new Set([502, 504, 520, 522, 524]);
const MAX_GATEWAY_RETRIES = 2;
const DEADLINE_MS = 150_000;
const DEFAULT_RETRY_DELAY_MS = 3000;
const MAX_RETRY_DELAY_MS = 10_000;

function retryDelayMs(retryAfter: unknown): number {
  const seconds = typeof retryAfter === "number" ? retryAfter : Number.NaN;
  if (!Number.isFinite(seconds) || seconds <= 0) return DEFAULT_RETRY_DELAY_MS;
  return Math.min(seconds * 1000, MAX_RETRY_DELAY_MS);
}

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export interface AiAssistRequestOptions {
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}

/**
 * POST one AI assist request. The idempotency key is generated once and reused on
 * every retry of an ambiguous answer: a transport failure or gateway error (at most
 * MAX_GATEWAY_RETRIES), or 409 in_progress (polled until DEADLINE_MS). Every other
 * failure, and the last ambiguous one, is thrown with `status` and the parsed body
 * as `data`.
 */
export async function aiAssistRequest(
  username: string,
  code: string,
  params: Pick<AiAssistParams, "action" | "text">,
  { sleep = wait, now = Date.now }: AiAssistRequestOptions = {}
): Promise<AiAssistResponse> {
  const fetchApi = getBoundFetch();
  const body = JSON.stringify({
    code,
    us: username,
    action: params.action,
    text: params.text,
    idempotency_key: makeIdempotencyKey(),
  });
  const deadline = now() + DEADLINE_MS;
  let gatewayRetries = 0;

  const retryWithin = async (delayMs: number): Promise<boolean> => {
    if (now() + delayMs >= deadline) return false;
    await sleep(delayMs);
    return true;
  };

  for (;;) {
    let response: Response;
    try {
      response = await fetchApi(CONFIG.privateApiHost + "/private-api/ai-assist", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body,
      });
    } catch (e) {
      if ((e as { name?: string } | null)?.name === "AbortError") throw e;
      if (gatewayRetries < MAX_GATEWAY_RETRIES && (await retryWithin(DEFAULT_RETRY_DELAY_MS))) {
        gatewayRetries++;
        continue;
      }
      throw e;
    }

    if (response.ok) {
      return (await response.json()) as AiAssistResponse;
    }

    const text = await response.text();
    let parsed: Record<string, unknown> = {};
    try {
      parsed = JSON.parse(text);
    } catch {
      // not JSON
    }

    if (response.status === 409 && parsed.error === "in_progress") {
      if (await retryWithin(retryDelayMs(parsed.retry_after))) continue;
    } else if (
      GATEWAY_STATUSES.has(response.status) &&
      gatewayRetries < MAX_GATEWAY_RETRIES &&
      (await retryWithin(DEFAULT_RETRY_DELAY_MS))
    ) {
      gatewayRetries++;
      continue;
    }

    const err = new Error(
      `[SDK][AI][Assist] – failed with status ${response.status}${text ? `: ${text}` : ""}`
    );
    (err as any).status = response.status;
    (err as any).data = parsed;
    throw err;
  }
}

export function useAiAssist(
  username: string | undefined,
  accessToken: string | undefined,
) {
  return useMutation({
    mutationKey: ["ai", "assist"],
    mutationFn: async (params: AiAssistParams): Promise<AiAssistResponse> => {
      if (!username) {
        throw new Error(
          "[SDK][AI][Assist] – username wasn't provided"
        );
      }

      if (!accessToken) {
        throw new Error(
          "[SDK][AI][Assist] – access token wasn't found"
        );
      }

      return aiAssistRequest(username, params.code ?? accessToken, params);
    },
    onSuccess: (data) => {
      if (username) {
        // Invalidate points cache if cost was charged
        if (data.cost > 0) {
          getQueryClient().invalidateQueries({
            queryKey: QueryKeys.points._prefix(username),
          });
        }
        // Invalidate assist prices to refresh free_remaining counts
        getQueryClient().invalidateQueries({
          queryKey: QueryKeys.ai.assistPrices(username),
        });
      }
    },
    // A failure after retries may still have been charged (a lost response, or a
    // request still in progress), so refresh the balance and free counts anyway.
    onError: () => {
      if (username) {
        getQueryClient().invalidateQueries({
          queryKey: QueryKeys.points._prefix(username),
        });
        getQueryClient().invalidateQueries({
          queryKey: QueryKeys.ai.assistPrices(username),
        });
      }
    },
  });
}
