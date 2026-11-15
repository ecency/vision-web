/**
 * The chat session is an httpOnly cookie set by the chat bootstrap. It is not
 * tied to the Ecency account in the browser, so on logout or an account switch
 * it has to be expired server side, or chat calls keep running as the previous
 * account (#2023).
 *
 * The expiry is a request, so it races whatever the newly active account does
 * next: the navbar unread badge refetches under the new username at once, and
 * the bootstrap's Set-Cookie for the new account must not land before the
 * expiry does. Chat requests therefore wait for `chatSessionSettled()`.
 */

import { getQueryClient } from "@/core/react-query";

export const CHAT_SESSION_URL = "/api/mattermost/session";

// A hung request must not stall chat for the rest of the page's life.
const RESET_TIMEOUT_MS = 10_000;

let pendingReset: Promise<void> | null = null;

// Set by the websocket module when it loads. chat-session sits in every
// page's graph (the global store imports it), the websocket must not.
let closeChatSocket: (() => void) | null = null;

/** The websocket module registers how to close the open chat socket. */
export function registerChatSocketCloser(closer: () => void): void {
  closeChatSocket = closer;
}

/** Every chat query: "mattermost-<what>" keys and ["mattermost", ...] ones. */
function isChatQueryKey(queryKey: readonly unknown[]): boolean {
  const head = queryKey[0];
  return typeof head === "string" && (head === "mattermost" || head.startsWith("mattermost-"));
}

/**
 * Drops what the browser holds of the previous account's chat: the cached
 * chat queries and the open websocket. A cached bootstrap is the important
 * one: switching A -> B -> A within its staleTime found A's bootstrap still
 * fresh, so nothing set A's cookie again and every chat call answered 401.
 */
function clearChatClientState(): void {
  try {
    getQueryClient().removeQueries({ predicate: (query) => isChatQueryKey(query.queryKey) });
  } catch {
    // Never block a logout on the cache.
  }
  try {
    closeChatSocket?.();
  } catch {
    // Same for the socket.
  }
}

/** Resolves when `promise` settles or after `ms`, whichever is first. */
function settleWithin(promise: Promise<unknown>, ms: number): Promise<void> {
  // Not AbortSignal.timeout: older Safari does not have it.
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<void>((resolve) => {
    timer = setTimeout(resolve, ms);
  });
  return Promise.race([promise.then(() => undefined), timeout]).finally(() => {
    if (timer !== undefined) clearTimeout(timer);
  });
}

export function resetChatSession(): Promise<void> {
  clearChatClientState();

  let request: Promise<unknown>;
  try {
    request = fetch(CHAT_SESSION_URL, {
      method: "DELETE",
      credentials: "same-origin",
      // A logout can be followed by a navigation; let the request finish.
      keepalive: true
    });
  } catch (error) {
    request = Promise.reject(error);
  }

  const reset: Promise<void> = settleWithin(request, RESET_TIMEOUT_MS)
    .then(
      () => undefined,
      // Failure leaves the old cookie in place; the server-side account
      // binding keeps it from answering for the new account. Never block chat
      // on it.
      () => undefined
    )
    .finally(() => {
      if (pendingReset === reset) {
        pendingReset = null;
      }
    });

  pendingReset = reset;
  return reset;
}

/**
 * Resolves once no chat session reset is in flight, including one started while
 * waiting (a second switch in quick succession).
 */
export async function chatSessionSettled(): Promise<void> {
  while (pendingReset) {
    await pendingReset;
  }
}

/**
 * `fetch` for chat API requests: waits for a pending session reset first, so a
 * request made right after a logout or switch cannot run as the previous
 * account, and a new account's bootstrap cannot have its fresh cookie wiped by
 * a late expiry.
 */
export async function chatSessionFetch(input: string, init?: RequestInit): Promise<Response> {
  await chatSessionSettled();
  return fetch(input, init);
}
