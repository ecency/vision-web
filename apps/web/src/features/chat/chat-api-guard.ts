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

import Cookies from "js-cookie";
import { ACTIVE_USER_COOKIE_NAME, CHAT_SESSION_HEADER } from "@/consts";
import { useGlobalStore } from "@/core/global-store";
import { getQueryClient } from "@/core/react-query";
import { chatSessionFetch, isChatQueryKey } from "./chat-session";

const DEFAULT_PAUSE_MS = 10 * 60_000; // matches the edge rate-limit block window
const MAX_PAUSE_MS = 15 * 60_000;
const MAX_POLL_MS = 10 * 60_000;

let pausedUntil = 0;

// A 401 means the chat cookie is gone or belongs to another account: ask the
// bootstrap again (it sets the cookie), at most once a minute.
const REBOOTSTRAP_AFTER_401_MS = 60_000;
let lastRebootstrapAt = 0;
// Bootstraps after a 401 with no successful chat call since. Past the cap a
// broken session stops re-bootstrapping until a chat call works again or the
// tab's account changes.
const MAX_UNCONFIRMED_REBOOTSTRAPS = 3;
let unconfirmedRebootstraps = 0;
let rebootstrapAccount: string | undefined;

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
  unconfirmedRebootstraps = 0;
  rebootstrapAccount = undefined;
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

/**
 * Whether a 401 may ask the bootstrap again. Not when another tab made another
 * account active (the `active_user` cookie): this tab would put its account's
 * chat cookie back over that one's, and the other tab would do the same, every
 * minute. Not without a mounted bootstrap, not more than once a minute, and
 * not past the cap.
 */
function shouldRebootstrap(): boolean {
  const tabAccount = useGlobalStore.getState().activeUser?.username?.toLowerCase();
  const browserAccount = Cookies.get(ACTIVE_USER_COOKIE_NAME)?.toLowerCase();
  if (!tabAccount || tabAccount !== browserAccount) return false;

  // Only a mounted bootstrap (the chat pages) runs again on an invalidation.
  // Elsewhere the 401 renews nothing, so it must not spend the throttle or
  // the cap that /chats needs later.
  const bootstrapMounted =
    getQueryClient().getQueryCache().findAll({ queryKey: ["mattermost-bootstrap"], type: "active" })
      .length > 0;
  if (!bootstrapMounted) return false;

  if (tabAccount !== rebootstrapAccount) {
    rebootstrapAccount = tabAccount;
    unconfirmedRebootstraps = 0;
  }
  if (unconfirmedRebootstraps >= MAX_UNCONFIRMED_REBOOTSTRAPS) return false;
  return Date.now() - lastRebootstrapAt >= REBOOTSTRAP_AFTER_401_MS;
}

/**
 * Runs the bootstrap again (it sets the chat cookie). The chat queries that
 * failed on the 401 gave up before the new cookie landed, so once a bootstrap
 * succeeds they run again too. Without a mounted bootstrap (pages other than
 * /chats) nothing is renewed and nothing else is refetched.
 */
async function rebootstrapChat(): Promise<void> {
  const queryClient = getQueryClient();
  const since = Date.now();
  await queryClient.invalidateQueries({ queryKey: ["mattermost-bootstrap"] });
  const renewed = queryClient
    .getQueryCache()
    .findAll({ queryKey: ["mattermost-bootstrap"] })
    .some((query) => query.state.status === "success" && query.state.dataUpdatedAt >= since);
  if (!renewed) return;
  await queryClient.invalidateQueries({
    predicate: (query) =>
      isChatQueryKey(query.queryKey) && query.queryKey[0] !== "mattermost-bootstrap"
  });
}

export async function chatApiFetch(input: string, init?: RequestInit): Promise<Response> {
  const remaining = chatApiPauseRemaining();
  if (remaining > 0) {
    throw new Error(`Chat API paused for ${Math.ceil(remaining / 1000)}s after rate limiting`);
  }

  // After a logout or switch, waits for the previous account's chat cookie to
  // be expired so this request cannot run as that account.
  const res = await chatSessionFetch(input, init);

  // Only an answer given with a session confirms one: the unread badge
  // answers 200 zeros without a session, every minute (#2023).
  if (res.ok && res.headers.get(CHAT_SESSION_HEADER) !== "none") {
    unconfirmedRebootstraps = 0;
  } else if (res.status === 401 && shouldRebootstrap()) {
    lastRebootstrapAt = Date.now();
    unconfirmedRebootstraps += 1;
    void rebootstrapChat().catch(() => undefined);
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
