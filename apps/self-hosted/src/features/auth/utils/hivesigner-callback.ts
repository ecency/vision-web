import type { AuthUser } from '../types';
import {
  consumeHivesignerState,
  parseHivesignerCallback,
  verifyHivesignerToken,
} from './hivesigner';

export type CallbackOutcome = { ok: true; user: AuthUser } | { ok: false };

/** The one attempt this page load makes at the callback it was opened with. */
let attempt: Promise<CallbackOutcome> | null = null;

/** Test seam: the module state otherwise leaks between cases. */
export function resetHivesignerCallbackCache(): void {
  attempt = null;
}

/**
 * Turn the callback this page was opened with into a session, or refuse it.
 *
 * Both checks fail closed. The state nonce proves the login started in this tab,
 * without which a crafted link would sign the visitor in as whoever the token
 * belongs to. Verifying the token against the account it claims stops a valid
 * token for one account being presented as another.
 *
 * Reaching /auth is always a fresh page load, since login leaves through
 * window.location, so one attempt per module lifetime is the whole story. It has
 * to be exactly one: the nonce can only be consumed once, and StrictMode replays
 * an effect's setup on mount, so a second attempt would find the nonce gone and
 * reject a valid login. Sharing the attempt does not weaken the protection, as
 * the nonce is still taken from sessionStorage exactly once.
 */
export function completeHivesignerCallback(): Promise<CallbackOutcome> {
  if (attempt) {
    return attempt;
  }

  const search = window.location.search;

  // Before any validation, and whatever the outcome. Rejecting a token stops it
  // becoming a session here, but it does not stop it being a live credential, so
  // it must not be left sitting in the address bar or in browser history.
  window.history.replaceState({}, '', window.location.pathname);

  attempt = (async (): Promise<CallbackOutcome> => {
    const params = new URLSearchParams(search);
    const callback = parseHivesignerCallback(search);

    // Consumed unconditionally so a failed attempt cannot be replayed.
    const stateOk = consumeHivesignerState(params.get('state'));

    if (!callback || !stateOk) {
      return { ok: false };
    }

    const verified = await verifyHivesignerToken(
      callback.accessToken,
      callback.username,
    );
    if (!verified) {
      return { ok: false };
    }

    return {
      ok: true,
      user: {
        username: callback.username,
        accessToken: callback.accessToken,
        loginType: 'hivesigner',
        expiresAt: Date.now() + callback.expiresIn * 1000,
      },
    };
  })();

  return attempt;
}
