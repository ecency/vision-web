import { loginWithHivesigner } from './auth-actions';

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
  if (!wantsSetup && !wantsLogin) return;

  params.delete(SETUP_PARAM);
  params.delete(LOGIN_PARAM);
  const qs = params.toString();
  window.history.replaceState(
    null,
    '',
    window.location.pathname + (qs ? `?${qs}` : '') + window.location.hash,
  );

  try {
    if (wantsSetup) sessionStorage.setItem(SETUP_PENDING_KEY, '1');
    if (wantsLogin) sessionStorage.setItem(LOGIN_REQUEST_KEY, 'hivesigner');
  } catch {}
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
