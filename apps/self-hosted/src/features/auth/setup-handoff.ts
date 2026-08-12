import { loginWithHivesigner } from './auth-actions';
import { exchangeHandoffCode } from './utils/handoff-exchange';
import { resolveHivesignerAccount } from './utils/hivesigner';
import type { AuthUser } from './types';

/**
 * The signed-in handoff from the signup success screen, and the first-run
 * setup moment on the instance.
 *
 * The success screen deep-links to the new instance with `?setup=1` and, for
 * a Hivesigner session on ecency.com, `?login=hivesigner`. Both params are
 * captured at BOOT, before React renders anything: effect order between
 * components must never decide whether the intent is seen (child effects run
 * before parent effects, so a component checking a flag its parent's effect
 * sets would miss it on the first load). Capture only stores intents and
 * strips the URL; acting on them happens where the context lives.
 *
 * The login intent only STARTS this instance's own OAuth flow: the state
 * nonce is issued here and verified by /auth exactly like a manual login, so
 * identity is never accepted from URL parameters (the bug class a dedicated
 * /auth route exists to prevent). The setup intent survives the OAuth round
 * trip in sessionStorage, and once the owner is looking at their site the
 * settings panel opens by itself.
 */

export const SETUP_PARAM = 'setup';
export const LOGIN_PARAM = 'login';

/**
 * The carried session token, captured from the URL FRAGMENT at boot and held
 * in module memory only: a fragment never reaches any server or log, the URL
 * is scrubbed before React renders, and nothing persists a bearer that was
 * not first verified. Every ecency.com login method holds a
 * Hivesigner-compatible access token, so this carries the session over for
 * all of them; identity is never taken from the URL, it is resolved from
 * Hivesigner /me by the token itself.
 */
let carriedToken: string | null = null;

/**
 * The one-time handoff CODE, the successor to the bearer fragment: minted by
 * the hosting API at click time on ecency.com and worthless after a single
 * exchange or a few minutes. The bearer path above stays until every
 * deployed ecency.com sends codes.
 */
let carriedCode: string | null = null;

/** The one attempt this page load makes at the carried session, shared so
 * every effect replay observes the same outcome (see actOnTokenHandoff). */
let handoffAttempt: Promise<AuthUser | null> | null = null;

/** Test seam: module memory otherwise leaks between cases. */
export function resetCarriedToken(): void {
  carriedToken = null;
  carriedCode = null;
  handoffAttempt = null;
}

const SETUP_PENDING_KEY = 'ecency:setup-pending';
const LOGIN_REQUEST_KEY = 'ecency:setup-login-request';
const firstRunKey = (account: string) =>
  `ecency:setup-seen:${account.toLowerCase()}`;

/**
 * Read the handoff params into sessionStorage intents and strip them from the
 * URL (other params and the hash fragment survive). Runs at boot, before
 * React; idempotent against reloads because the params are gone afterwards.
 */
export function captureSetupParams(): void {
  if (typeof window === 'undefined') return;
  const params = new URLSearchParams(window.location.search);
  const wantsSetup = params.get(SETUP_PARAM) === '1';
  const wantsLogin = params.get(LOGIN_PARAM) === 'hivesigner';

  // The handoff fragment is `#hs=<token>` and owns the whole hash when
  // present; any other fragment passes through untouched. The decode must not
  // be able to throw: this runs before anything renders, so a crafted
  // `#hs=%` link would otherwise blank the page permanently (the fragment
  // survives reloads until scrubbed). Undecodable means no token, but the
  // scrub below still runs.
  let hash = window.location.hash;
  if (hash.startsWith('#hs=')) {
    try {
      carriedToken = decodeURIComponent(hash.slice(4)) || null;
    } catch {
      carriedToken = null;
    }
    hash = '';
  } else if (hash.startsWith('#hc=')) {
    try {
      carriedCode = decodeURIComponent(hash.slice(4)) || null;
    } catch {
      carriedCode = null;
    }
    hash = '';
  }

  if (!wantsSetup && !wantsLogin && hash === window.location.hash) return;

  params.delete(SETUP_PARAM);
  params.delete(LOGIN_PARAM);
  const qs = params.toString();
  window.history.replaceState(
    null,
    '',
    window.location.pathname + (qs ? `?${qs}` : '') + hash,
  );

  try {
    if (wantsSetup) sessionStorage.setItem(SETUP_PENDING_KEY, '1');
    if (wantsLogin) sessionStorage.setItem(LOGIN_REQUEST_KEY, 'hivesigner');
  } catch {}
}

export interface TokenHandoffContext {
  /** Sessions are off entirely on this instance; drop the token unseen. */
  isAuthEnabled: boolean;
  /** Somebody is already signed in; the carried session is moot. */
  isAuthenticated: boolean;
  /**
   * The instance owner (nullable but must be passed): the carried session is
   * only ever for landing the owner on their own new site, so any other
   * account is refused. No owner known means refuse.
   */
  ownerUsername: string | null | undefined;
  /** Injectable for tests; defaults to the real Hivesigner /me lookup. */
  resolveAccount?: (token: string) => Promise<string | null>;
  /** Injectable for tests; defaults to the real hosting-API exchange. */
  exchangeCode?: (
    code: string,
  ) => Promise<{ accessToken: string; username: string } | null>;
}

/**
 * Turn a captured token into a signed-in session, once per page load.
 *
 * Identity comes from Hivesigner /me and nowhere else: a forged link with a
 * random token resolves to nothing, and a real token resolves to exactly the
 * account it belongs to. That alone is not enough, though. Without a further
 * gate, a crafted link carrying a stranger's real token would silently sign
 * the visitor in as that stranger (login CSRF); the /auth route's state nonce
 * cannot exist here because the flow starts on ecency.com, so the equivalent
 * fail-closed gate is that the resolved account must BE the instance owner —
 * the only account this handoff exists to land.
 *
 * The token is consumed on the first call whatever the outcome, so a failed
 * resolve cannot be retried into a different result and nothing holds the
 * bearer afterwards. The attempt itself is shared module-wide: StrictMode
 * replays an effect's setup on mount, so a second run must await the first
 * attempt's outcome instead of finding the token gone and dropping the
 * session (the same shape hivesigner-callback.ts uses for its nonce).
 */
export function actOnTokenHandoff(
  context: TokenHandoffContext,
): Promise<AuthUser | null> {
  if (handoffAttempt) return handoffAttempt;

  const token = carriedToken;
  const code = carriedCode;
  if (!token && !code) return Promise.resolve(null);
  carriedToken = null;
  carriedCode = null;

  handoffAttempt = (async (): Promise<AuthUser | null> => {
    if (!context.isAuthEnabled || context.isAuthenticated) return null;

    let account: string | null = null;
    let sessionToken: string | null = null;

    if (code) {
      // The code path: one exchange at the hosting API returns the session
      // and the identity the API resolved from Hivesigner AT MINT TIME. The
      // owner gate below still decides whether it may sign in here.
      const exchanged = await (context.exchangeCode ?? exchangeHandoffCode)(
        code,
      );
      if (!exchanged) return null;
      account = exchanged.username.toLowerCase();
      sessionToken = exchanged.accessToken;
    } else if (token) {
      account = await (context.resolveAccount ?? resolveHivesignerAccount)(
        token,
      );
      sessionToken = token;
    }
    if (!account || !sessionToken) return null;

    const owner = context.ownerUsername?.trim().toLowerCase();
    if (!owner || account.toLowerCase() !== owner) return null;

    return {
      username: account,
      accessToken: sessionToken,
      loginType: 'hivesigner',
      // The carried token's real TTL is not knowable here; a conservative day
      // keeps the session honest and the periodic expiry check in the provider
      // logs it out cleanly. Any earlier upstream expiry just fails a broadcast
      // into the normal re-login prompt.
      expiresAt: Date.now() + 24 * 60 * 60 * 1000,
    };
  })();

  return handoffAttempt;
}

/** The captured login intent, if any. Reading does not consume it. */
export function peekLoginRequest(): 'hivesigner' | null {
  try {
    return sessionStorage.getItem(LOGIN_REQUEST_KEY) === 'hivesigner'
      ? 'hivesigner'
      : null;
  } catch {
    return null;
  }
}

export function clearLoginRequest(): void {
  try {
    sessionStorage.removeItem(LOGIN_REQUEST_KEY);
  } catch {}
}

export interface LoginRequestContext {
  /** Hivesigner is offered on this instance. */
  canLoginWithHivesigner: boolean;
  /** Somebody is already signed in; the request is moot. */
  isAuthenticated: boolean;
  /** Injectable for tests; defaults to the real redirect. */
  beginHivesignerLogin?: () => void;
}

/**
 * Act on a captured login intent exactly once: start the instance's own
 * Hivesigner flow when it is offered and nobody is signed in, and otherwise
 * drop the request (the setup intent still opens the panel after whatever
 * login the owner performs manually). Safe to call on every relevant state
 * change; the intent is cleared on the first call that can decide.
 */
export function actOnLoginRequest(context: LoginRequestContext): void {
  if (peekLoginRequest() !== 'hivesigner') return;
  // Already signed in: the request is moot, drop it.
  if (context.isAuthenticated) {
    clearLoginRequest();
    return;
  }
  // Not offered YET: keep the intent instead of dropping it, so a config that
  // gains the Hivesigner client a moment later (or the next full load) can
  // still honor the headline auto-login instead of silently never firing.
  if (!context.canLoginWithHivesigner) return;
  clearLoginRequest();
  (context.beginHivesignerLogin ?? loginWithHivesigner)();
}

export function isSetupPending(): boolean {
  try {
    return sessionStorage.getItem(SETUP_PENDING_KEY) === '1';
  } catch {
    return false;
  }
}

export function clearSetupPending(): void {
  try {
    sessionStorage.removeItem(SETUP_PENDING_KEY);
  } catch {}
}

/** First visit as owner: the one-time setup checklist gate, per account. */
export function hasSeenFirstRun(account: string): boolean {
  try {
    return localStorage.getItem(firstRunKey(account)) === '1';
  } catch {
    return true;
  }
}

export function markFirstRunSeen(account: string): void {
  try {
    localStorage.setItem(firstRunKey(account), '1');
  } catch {}
}
