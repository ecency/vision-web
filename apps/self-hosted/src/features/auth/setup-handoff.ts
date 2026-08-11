import { loginWithHivesigner } from './auth-actions';

/**
 * The signed-in handoff from the signup success screen, and the first-run
 * setup moment on the instance.
 *
 * The success screen deep-links to the new instance with `?setup=1` and, for
 * a Hivesigner session on ecency.com, `?login=hivesigner`. The login param
 * only STARTS this instance's own OAuth flow: the state nonce is issued here
 * and verified by /auth exactly like a manual login, so identity is never
 * accepted from URL parameters (the bug class a dedicated /auth route exists
 * to prevent). The setup intent survives the OAuth round trip in
 * sessionStorage, and once the owner is looking at their site the settings
 * panel opens by itself.
 */

export const SETUP_PARAM = 'setup';
export const LOGIN_PARAM = 'login';

const SETUP_PENDING_KEY = 'ecency:setup-pending';
const firstRunKey = (account: string) =>
  `ecency:setup-seen:${account.toLowerCase()}`;

export interface SetupHandoffContext {
  /** Hivesigner is offered on this instance and nobody is signed in yet. */
  canLoginWithHivesigner: boolean;
  /** Injectable for tests; defaults to the real redirect. */
  beginHivesignerLogin?: () => void;
}

/**
 * Read and consume the handoff params. Idempotent against reloads: the params
 * are stripped from the URL before anything else happens, so a refresh cannot
 * replay a login redirect.
 */
export function consumeSetupHandoff(context: SetupHandoffContext): void {
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
    window.location.pathname + (qs ? `?${qs}` : ''),
  );

  if (wantsSetup) {
    try {
      sessionStorage.setItem(SETUP_PENDING_KEY, '1');
    } catch {}
  }

  if (wantsLogin && context.canLoginWithHivesigner) {
    (context.beginHivesignerLogin ?? loginWithHivesigner)();
  }
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
