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

export const CHAT_SESSION_URL = "/api/mattermost/session";

// A hung request must not stall chat for the rest of the page's life.
const RESET_TIMEOUT_MS = 10_000;

let pendingReset: Promise<void> | null = null;

export function resetChatSession(): Promise<void> {
  const reset: Promise<void> = fetch(CHAT_SESSION_URL, {
    method: "DELETE",
    credentials: "same-origin",
    // A logout can be followed by a navigation; let the request finish.
    keepalive: true,
    signal: typeof AbortSignal.timeout === "function" ? AbortSignal.timeout(RESET_TIMEOUT_MS) : undefined
  })
    .then(
      () => undefined,
      // Failure leaves the old cookie in place, and the server still answers
      // for whoever it belongs to. Never block chat on it.
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
