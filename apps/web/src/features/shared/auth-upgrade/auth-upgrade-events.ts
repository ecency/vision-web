import {
  clearSessionActiveKey,
  getSessionActiveKey,
  setSessionActiveKey
} from "@/utils/session-active-key";
import * as ls from "@/utils/local-storage";

/**
 * Imperative API for the auth upgrade dialog.
 *
 * Used by the web broadcast adapter to show a dialog when the user needs to
 * provide a different auth method (e.g., active key for an active-key operation
 * when logged in with posting key only).
 *
 * Pattern follows the existing feedback system (CustomEvent-based imperative UI).
 */

type AuthMethod = "hivesigner" | "keychain" | "key" | false;

let pendingResolve: ((method: AuthMethod) => void) | null = null;
/** Authority the open dialog is collecting for. Only an active-authority key is
 * worth keeping: it is the one the adapter reads back for later broadcasts, so
 * a posting key stored under it would fail every active operation in the tab. */
let pendingAuthority: string | null = null;
/** Account the open dialog was raised for. The dialog can outlive an account
 * switch, so the key it collects belongs to this account, not to whoever
 * happens to be active by the time the user submits it. */
let pendingUsername: string | null = null;
/** A posting key entered in the dialog, handed to the one retry that follows
 * (adapter.getPostingKey) and then dropped. Unlike the active key it is not
 * held: posting ops have their own fallbacks, and the login's own method
 * (an extension, HiveSigner) should sign the next one once it works again. */
let handedPostingKey: { key: string; username: string | null } | null = null;

/**
 * Called by the broadcast adapter's showAuthUpgradeUI to show the dialog and wait for user choice.
 */
export function requestAuthUpgrade(
  authority: string,
  operation: string
): Promise<AuthMethod> {
  // If there's already a pending request, cancel it so it doesn't hang forever
  if (pendingResolve) {
    pendingResolve(false);
    pendingResolve = null;
  }
  pendingAuthority = authority;
  pendingUsername = (ls.get("active_user") as string | null) ?? null;
  handedPostingKey = null;

  // An active-authority dialog only opens when no key was stored or the stored
  // one was rejected, so whatever is held is of no use. Dropping it keeps a
  // wrong key from failing every later broadcast in the tab. A posting-authority
  // upgrade says nothing about the active key, so that one leaves it alone.
  if (authority === "active") {
    clearTempActiveKey();
  }

  return new Promise((resolve) => {
    pendingResolve = resolve;
    window.dispatchEvent(
      new CustomEvent("ecency-auth-upgrade", {
        detail: { authority, operation }
      })
    );
  });
}

/**
 * Called by the dialog when the user makes a choice (or cancels).
 */
export function resolveAuthUpgrade(
  method: AuthMethod,
  key?: string,
  /**
   * The account the key was derived for. The dialog derives a master password or
   * seed against the store's active user at submit time, which an account switch
   * made while it was open would have changed, so the dialog is the only place
   * that knows whose key this is. Falls back to the account the dialog opened
   * for, which is the same thing unless such a switch happened.
   */
  derivedFor?: string
) {
  if (key && pendingAuthority === "active") {
    // Held for the rest of the page, so a run of active-authority operations
    // (tipping a feed's worth of posts) asks for the key once.
    setSessionActiveKey(key, derivedFor ?? pendingUsername ?? undefined);
  } else if (key && pendingAuthority === "posting") {
    handedPostingKey = { key, username: derivedFor ?? pendingUsername };
  }
  pendingResolve?.(method);
  pendingResolve = null;
  pendingAuthority = null;
  pendingUsername = null;
}

/**
 * Called by adapter.getActiveKey() to retrieve the key entered in the dialog.
 * Non-destructive read. The key is returned only to the account that entered
 * it and lasts as long as the page.
 */
export function getTempActiveKey(username?: string): string | null {
  return getSessionActiveKey(username);
}

/**
 * Called by adapter.getPostingKey() for the retry after a posting-authority
 * dialog. Returns the key entered there once, and only to the account it was
 * entered for.
 */
export function takeHandedPostingKey(username: string): string | null {
  if (!handedPostingKey || handedPostingKey.username !== username) return null;
  const { key } = handedPostingKey;
  handedPostingKey = null;
  return key;
}

/**
 * Clears the stored active key. Called when a new auth upgrade flow starts,
 * and on logout or account switch.
 */
export function clearTempActiveKey() {
  clearSessionActiveKey();
}

/** @deprecated Use getTempActiveKey() instead — non-destructive read */
export const consumeTempActiveKey = getTempActiveKey;
