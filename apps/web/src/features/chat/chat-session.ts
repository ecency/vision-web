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

import Cookies from "js-cookie";
import { ACTIVE_USER_COOKIE_NAME } from "@/consts";
import { getQueryClient } from "@/core/react-query";
import { ChatAccountInactiveError, ChatSessionChangedError } from "./chat-session-errors";

export const CHAT_SESSION_URL = "/api/mattermost/session";

/**
 * Request header naming the account this tab's chat request is for. The chat
 * session cookies are shared by every tab, so after another tab switched
 * account they belong to that one; the server refuses them for a request that
 * names another account.
 */
export const CHAT_ACCOUNT_HEADER = "X-Chat-Account";
/** The same for the chat websocket, which cannot send headers. */
export const CHAT_ACCOUNT_QUERY_PARAM = "account";

// A hung request must not stall chat for the rest of the page's life.
const RESET_TIMEOUT_MS = 10_000;

// Every reset still in flight. A newer one does not replace an older one: the
// older DELETE's expiry could otherwise land after the next bootstrap.
const pendingResets = new Set<Promise<void>>();
// Bumped by every reset, so work started for one account can tell that the
// browser has moved on (a fast A -> B -> A switch).
let generation = 0;

export function chatSessionGeneration(): number {
  return generation;
}

// This tab's account, read from the global store, which registers the reader
// (it imports this module, so this module must not import it).
let readTabAccount: (() => string | undefined) | null = null;

export function registerChatTabAccountReader(reader: () => string | undefined): void {
  readTabAccount = reader;
}

// Set by the websocket module when it loads. chat-session sits in every
// page's graph (the global store imports it), the websocket must not.
let closeChatSocket: (() => void) | null = null;

/** The websocket module registers how to close the open chat socket. */
export function registerChatSocketCloser(closer: () => void): void {
  closeChatSocket = closer;
}

/**
 * Prefix of the chat bootstrap query key (`[...prefix, username, community]`).
 * The 401 recovery finds and refreshes the bootstrap by it.
 */
export const CHAT_BOOTSTRAP_QUERY_PREFIX = ["mattermost-bootstrap"] as const;

/** Every chat query: "mattermost-<what>" keys and ["mattermost", ...] ones. */
export function isChatQueryKey(queryKey: readonly unknown[]): boolean {
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

// Every chat bootstrap request in flight. A reset aborts them: one sent for
// the previous account could otherwise answer after the next account's
// bootstrap and leave its own session cookie behind (#2087 review).
const pendingBootstraps = new Set<AbortController>();

function abortPendingBootstraps(): void {
  pendingBootstraps.forEach((controller) => controller.abort());
  pendingBootstraps.clear();
}

/**
 * Sends a chat bootstrap request that a session reset aborts. An aborted one
 * rejects with ChatSessionChangedError, like one the reset caught before sending.
 */
export async function chatBootstrapFetch(input: string, init: RequestInit): Promise<Response> {
  const controller = typeof AbortController === "function" ? new AbortController() : undefined;
  if (controller) pendingBootstraps.add(controller);
  try {
    return await chatSessionFetch(input, { ...init, signal: controller?.signal });
  } catch (error) {
    if (controller?.signal.aborted) throw new ChatSessionChangedError();
    throw error;
  } finally {
    if (controller) pendingBootstraps.delete(controller);
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

/**
 * Ends this tab's chat session: drops the client state and, unless
 * `expireServerSession` is false, expires the session cookies on the server.
 * Pass false when the cookies are not this tab's account's any more (another
 * tab already made another account active), so the expiry would only wipe
 * that account's session.
 */
export function resetChatSession(
  { expireServerSession = true }: { expireServerSession?: boolean } = {}
): Promise<void> {
  generation += 1;
  clearChatClientState();
  abortPendingBootstraps();
  if (!expireServerSession) {
    return Promise.resolve();
  }

  const controller = typeof AbortController === "function" ? new AbortController() : undefined;
  let request: Promise<unknown>;
  try {
    request = fetch(CHAT_SESSION_URL, {
      method: "DELETE",
      credentials: "same-origin",
      // A logout can be followed by a navigation; let the request finish.
      keepalive: true,
      signal: controller?.signal
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
      // Past its wait the request must not answer any more: chat requests go
      // ahead now, and its expiry would land on the session they set up.
      // A no-op when it already finished.
      controller?.abort();
      pendingResets.delete(reset);
    });

  pendingResets.add(reset);
  return reset;
}

/**
 * Resolves once no chat session reset is in flight: every one started before,
 * and any started while waiting (a second switch in quick succession).
 */
export async function chatSessionSettled(): Promise<void> {
  while (pendingResets.size > 0) {
    await Promise.all(Array.from(pendingResets));
  }
}

/**
 * `fetch` for chat API requests: waits for a pending session reset first, so a
 * request made right after a logout or switch cannot run as the previous
 * account, and a new account's bootstrap cannot have its fresh cookie wiped by
 * a late expiry.
 */
/**
 * This tab's account for chat, or null when it has none. Throws
 * ChatAccountInactiveError when another tab made another account (or none)
 * the browser's active one: the shared session cookies are not this tab's
 * account's any more, so it must send nothing with them (#2087 review).
 */
export function chatTabAccount(): string | null {
  const tabAccount = readTabAccount?.()?.toLowerCase();
  if (!tabAccount) return null;
  const browserAccount = Cookies.get(ACTIVE_USER_COOKIE_NAME);
  if (browserAccount?.toLowerCase() !== tabAccount) {
    throw new ChatAccountInactiveError(browserAccount);
  }
  return tabAccount;
}

export async function chatSessionFetch(input: string, init?: RequestInit): Promise<Response> {
  await chatSessionSettled();

  let tabAccount: string | null;
  try {
    tabAccount = chatTabAccount();
  } catch (error) {
    // Its socket would come back as the other account on the next reconnect.
    try {
      closeChatSocket?.();
    } catch {
      // The request is refused either way.
    }
    throw error;
  }
  if (!tabAccount) {
    return fetch(input, init);
  }
  // The other tab can still switch before this request arrives: name the
  // account so the server refuses a session issued to another one.
  const headers = new Headers(init?.headers);
  headers.set(CHAT_ACCOUNT_HEADER, tabAccount);
  return fetch(input, { ...init, headers });
}
