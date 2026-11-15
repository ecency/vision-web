import { Account, ActiveUser } from "@/entities";
import * as ls from "@/utils/local-storage";
import Cookies from "js-cookie";
import { ACTIVE_USER_COOKIE_NAME } from "@/consts";
import { sentry } from "@/core/sentry/lazy-sentry";
import { clearSessionActiveKey } from "@/utils/session-active-key";
import { resetChatSession } from "@/features/chat/chat-session";
import { dropCachedAccountResponses } from "@/core/pwa-account-cache";

const makeActiveUser = (username: string): ActiveUser => ({
  username,
  data: {
    name: username
  } as Account
});

const load = (name?: string | null): ActiveUser | null => {
  const username = name ?? ls.get("active_user");

  if (username && ls.get(`user_${username}`)) {
    return makeActiveUser(username);
  }

  return null;
};

export function createAuthenticationState() {
  return {
    activeUser: null as ActiveUser | null
  };
}

export type AuthenticationState = ReturnType<typeof createAuthenticationState>;

export const createAuthenticationActions = (
  // `set` merges into the combined global store, so this action can also clear
  // cross-module state (the in-memory signing key) on every active-user change.
  set: (state: Partial<AuthenticationState & { signingKey: string | null }>) => void,
  getState: () => AuthenticationState
) => ({
  setActiveUser: (name: string | null) => {
    const currentUsername = getState().activeUser?.username;

    if (name === currentUsername) {
      return;
    }

    const nextActiveUser = name ? load(name) : null;

    // Logout or switch away from a signed-in account: its chat session cookie
    // must not carry over (#2023). A page load restoring the persisted account
    // starts from null and keeps the session it already has.
    if (currentUsername) {
      // A sync throw here must not abort the logout itself.
      try {
        void resetChatSession();
      } catch {
        // The server-side account binding still keeps the old session out.
      }
      // Answers the service worker cached for the previous account.
      try {
        void dropCachedAccountResponses().catch(() => undefined);
      } catch {
        // Never block a logout on the cache.
      }
    }

    if (name) {
      ls.set("active_user", name);
      Cookies.set(ACTIVE_USER_COOKIE_NAME, name, { expires: 365 });
      // Clear any previous account's signing key so it can never pre-fill or be
      // reused under the newly activated account. Login sets the key AFTER
      // activating the user, so this does not wipe a fresh login's key.
      set({ activeUser: nextActiveUser, signingKey: null });
      // Unconditional on purpose. A held key cannot predate this document, so a
      // page load restoring the persisted username has nothing to lose here.
      // Making a security-relevant clear depend on store state would turn into a
      // cross-account leak the day the key gains any persistent backing.
      clearSessionActiveKey();

      sentry.setUser({
        username: name
      });
    } else {
      ls.remove("active_user");
      Cookies.remove(ACTIVE_USER_COOKIE_NAME);
      // Logout: drop the in-memory signing key alongside the active user.
      set({ activeUser: nextActiveUser, signingKey: null });
      clearSessionActiveKey();
      sentry.setUser(null);
    }
  }
});
