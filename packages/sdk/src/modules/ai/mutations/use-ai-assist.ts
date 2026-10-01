import { CONFIG, getBoundFetch, getQueryClient, QueryKeys } from "@/modules/core";
import { useMutation } from "@tanstack/react-query";
import { makeIdempotencyKey } from "./make-idempotency-key";
import type { AiAssistResponse } from "../types";

export interface AiAssistParams {
  action: string;
  text: string;
  code?: string;
  // Pass the same key when asking again for a request whose result was never shown
  // (e.g. a dialog closed mid-request): the backend replays it instead of charging a
  // second time. If omitted a fresh key is generated per request. Same contract as
  // GenerateImageParams.
  idempotency_key?: string;
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

type Attempt =
  | { ok: true; data: AiAssistResponse }
  | { ok: false; status: number; text: string };

/**
 * POST one AI assist request. The idempotency key is reused on every retry of an
 * ambiguous outcome: 409 in_progress (polled until DEADLINE_MS), or a transport
 * failure, a body that could not be read, or a gateway error (at most
 * MAX_GATEWAY_RETRIES). Each attempt is aborted when the deadline expires, so the
 * whole call is bounded by it. Every other failure, and the last ambiguous one, is
 * thrown with `status` and the parsed body as `data` (transport errors as is).
 */
export async function aiAssistRequest(
  username: string,
  code: string,
  params: Pick<AiAssistParams, "action" | "text" | "idempotency_key">,
  { sleep = wait, now = Date.now }: AiAssistRequestOptions = {}
): Promise<AiAssistResponse> {
  const fetchApi = getBoundFetch();
  const body = JSON.stringify({
    code,
    us: username,
    action: params.action,
    text: params.text,
    idempotency_key: params.idempotency_key || makeIdempotencyKey(),
  });
  const deadline = now() + DEADLINE_MS;
  let gatewayRetries = 0;

  const retryWithin = async (delayMs: number): Promise<boolean> => {
    if (now() + delayMs >= deadline) return false;
    await sleep(delayMs);
    // A background tab's timers can fire late; never send past the deadline.
    return now() < deadline;
  };

  // Reading the body is part of the attempt: a connection lost after the headers
  // leaves the outcome as unknown as one lost before them.
  const attempt = async (): Promise<Attempt> => {
    const controller = typeof AbortController === "function" ? new AbortController() : undefined;
    const timer = controller
      ? setTimeout(() => controller.abort(), Math.max(0, deadline - now()))
      : undefined;
    try {
      const response = await fetchApi(CONFIG.privateApiHost + "/private-api/ai-assist", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body,
        signal: controller?.signal,
      });
      if (response.ok) {
        return { ok: true, data: (await response.json()) as AiAssistResponse };
      }
      // A definite status stays definite even if its error body cannot be read.
      let text = "";
      try {
        text = await response.text();
      } catch {
        // body unavailable
      }
      return { ok: false, status: response.status, text };
    } finally {
      clearTimeout(timer);
    }
  };

  for (;;) {
    let result: Attempt;
    try {
      result = await attempt();
    } catch (e) {
      if (gatewayRetries < MAX_GATEWAY_RETRIES && (await retryWithin(DEFAULT_RETRY_DELAY_MS))) {
        gatewayRetries++;
        continue;
      }
      throw e;
    }

    if (result.ok) {
      return result.data;
    }

    const { status, text } = result;
    let data: Record<string, unknown> = {};
    try {
      data = JSON.parse(text);
    } catch {
      // not JSON
    }

    if (status === 409 && data.error === "in_progress") {
      if (await retryWithin(retryDelayMs(data.retry_after))) continue;
    } else if (
      GATEWAY_STATUSES.has(status) &&
      gatewayRetries < MAX_GATEWAY_RETRIES &&
      (await retryWithin(DEFAULT_RETRY_DELAY_MS))
    ) {
      gatewayRetries++;
      continue;
    }

    throw Object.assign(
      new Error(`[SDK][AI][Assist] – failed with status ${status}${text ? `: ${text}` : ""}`),
      { status, data }
    );
  }
}

// What an assist touches: the Points balance and the per-action free counts. Run on
// failure too, since a request that failed after retries may still have been charged.
export function invalidateAiAssistCaches(username: string) {
  getQueryClient().invalidateQueries({
    queryKey: QueryKeys.points._prefix(username),
  });
  getQueryClient().invalidateQueries({
    queryKey: QueryKeys.ai.assistPrices(username),
  });
}

export function useAiAssist(
  username: string | undefined,
  accessToken: string | undefined,
) {
  return useMutation({
    mutationKey: QueryKeys.ai.assist(username),
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
    onSuccess: () => {
      if (username) invalidateAiAssistCaches(username);
    },
    onError: () => {
      if (username) invalidateAiAssistCaches(username);
    },
  });
}
