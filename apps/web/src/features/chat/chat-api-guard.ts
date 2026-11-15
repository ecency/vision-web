/**
 * Shared guard for chat polling requests.
 *
 * Two protections:
 * 1. `chatApiFetch` opens a module-wide pause when the edge answers 429, so
 *    every chat poller stops calling the API for the rate-limit window instead
 *    of hammering into it.
 * 2. `chatPollInterval` computes a failure-aware refetch interval: normal
 *    cadence while healthy, exponential backoff while the endpoint errors.
 *    A broken chat session or an origin incident must never turn the pollers
 *    into a request storm.
 */

import { getQueryClient } from "@/core/react-query";
import { chatSessionFetch } from "./chat-session";

const DEFAULT_PAUSE_MS = 10 * 60_000; // matches the edge rate-limit block window
const MAX_PAUSE_MS = 15 * 60_000;
const MAX_POLL_MS = 10 * 60_000;

let pausedUntil = 0;

// A 401 means the chat cookie is gone or belongs to another account: ask the
// bootstrap again (it sets the cookie), at most once a minute.
const REBOOTSTRAP_AFTER_401_MS = 60_000;
let lastRebootstrapAt = 0;

/**
 * `errorUpdateCount` at the last successful fetch, per query hash. Consecutive
 * failures = current `errorUpdateCount` minus this baseline. Needed because
 * `fetchFailureCount` resets to 0 whenever a new fetch starts, so with low/no
 * retry it can never grow across poll cycles.
 */
const errorBaselines = new Map<string, number>();

export function chatApiPauseRemaining(now = Date.now()): number {
  return Math.max(0, pausedUntil - now);
}

/** Test-only helper. */
export function resetChatApiGuard(): void {
  pausedUntil = 0;
  lastRebootstrapAt = 0;
  errorBaselines.clear();
}

function parseRetryAfterMs(header: string | null): number {
  if (header) {
    const seconds = Number(header);
    if (Number.isFinite(seconds) && seconds > 0) {
      return seconds * 1000;
    }
    // Retry-After may also be an HTTP date
    const at = Date.parse(header);
    if (!Number.isNaN(at) && at > Date.now()) {
      return at - Date.now();
    }
  }
  return DEFAULT_PAUSE_MS;
}

export async function chatApiFetch(input: string, init?: RequestInit): Promise<Response> {
  const remaining = chatApiPauseRemaining();
  if (remaining > 0) {
    throw new Error(`Chat API paused for ${Math.ceil(remaining / 1000)}s after rate limiting`);
  }

  // After a logout or switch, waits for the previous account's chat cookie to
  // be expired so this request cannot run as that account.
  const res = await chatSessionFetch(input, init);

  if (res.status === 401 && Date.now() - lastRebootstrapAt >= REBOOTSTRAP_AFTER_401_MS) {
    lastRebootstrapAt = Date.now();
    void getQueryClient()
      .invalidateQueries({ queryKey: ["mattermost-bootstrap"] })
      .catch(() => undefined);
  }

  if (res.status === 429) {
    const pauseMs = Math.min(parseRetryAfterMs(res.headers.get("Retry-After")), MAX_PAUSE_MS);
    // Math.max: a concurrent in-flight 429 with a shorter window must not
    // shorten an already-open pause.
    pausedUntil = Math.max(pausedUntil, Date.now() + pauseMs);
  }

  return res;
}

export interface ChatPollQuery {
  queryHash: string;
  state: {
    status: string;
    fetchFailureCount: number;
    errorUpdateCount: number;
  };
}

/**
 * Failure-aware polling interval for React Query `refetchInterval` callbacks.
 * Healthy query -> `baseMs`. Erroring query -> `baseMs * 2^consecutiveFailures`,
 * capped at 10 minutes. While the guard pause is open, waits at least the
 * remaining pause so the next poll lands after the rate-limit window.
 */
export function chatPollInterval(baseMs: number, query: ChatPollQuery): number {
  const paused = chatApiPauseRemaining();
  if (paused > 0) {
    return Math.max(baseMs, paused);
  }

  const { status, fetchFailureCount, errorUpdateCount } = query.state;

  if (status !== "error") {
    errorBaselines.set(query.queryHash, errorUpdateCount);
    return baseMs;
  }

  let baseline = errorBaselines.get(query.queryHash);
  if (baseline === undefined) {
    // First sighting is already in error: count it as one failure.
    baseline = errorUpdateCount - 1;
    errorBaselines.set(query.queryHash, baseline);
  }

  const failures = Math.max(errorUpdateCount - baseline, fetchFailureCount, 1);
  return Math.min(baseMs * Math.pow(2, failures), MAX_POLL_MS);
}
