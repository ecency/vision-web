// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HIVESIGNER_STATE_KEY } from '../constants';
import {
  completeHivesignerCallback,
  resetHivesignerCallbackCache,
} from './hivesigner-callback';

function meResponds(name: string | undefined, ok = true) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({
      ok,
      json: async () => (name ? { account: { name } } : {}),
    })),
  );
}

beforeEach(() => {
  sessionStorage.clear();
  resetHivesignerCallbackCache();
  vi.unstubAllGlobals();
  arriveAtCallback();
});

const CALLBACK = '?access_token=tok&username=alice&expires_in=604800&state=n1';

/** Arrive at /auth as the OAuth redirect would. */
function arriveAtCallback() {
  window.history.replaceState({}, '', `/auth${CALLBACK}`);
}

describe('hivesigner callback', () => {
  it('completes when the nonce matches and the token is alice', async () => {
    sessionStorage.setItem(HIVESIGNER_STATE_KEY, 'n1');
    meResponds('alice');

    const outcome = await completeHivesignerCallback();

    expect(outcome.ok).toBe(true);
    expect(outcome.ok && outcome.user.username).toBe('alice');
  });

  /**
   * StrictMode runs an effect's setup, cleanup and setup again on mount. The
   * nonce is consumed on the first run, so a second attempt would find it gone
   * and reject a valid login. Both calls must produce the same session.
   */
  it('survives the callback being handled twice for the same URL', async () => {
    sessionStorage.setItem(HIVESIGNER_STATE_KEY, 'n1');
    meResponds('alice');

    const [first, second] = await Promise.all([
      completeHivesignerCallback(),
      completeHivesignerCallback(),
    ]);

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
  });

  it('still rejects a replay after a reload, when the nonce is gone', async () => {
    sessionStorage.setItem(HIVESIGNER_STATE_KEY, 'n1');
    meResponds('alice');
    await completeHivesignerCallback();

    // A fresh page load: module state empty, nonce already consumed.
    resetHivesignerCallbackCache();
    arriveAtCallback();

    expect((await completeHivesignerCallback()).ok).toBe(false);
  });

  it('refuses an unsolicited token with no nonce of ours', async () => {
    meResponds('mallory');

    expect((await completeHivesignerCallback()).ok).toBe(false);
  });

  it('refuses a valid token presented for someone else', async () => {
    sessionStorage.setItem(HIVESIGNER_STATE_KEY, 'n1');
    meResponds('mallory');

    expect((await completeHivesignerCallback()).ok).toBe(false);
  });

  it('refuses when the identity endpoint cannot confirm the account', async () => {
    sessionStorage.setItem(HIVESIGNER_STATE_KEY, 'n1');
    meResponds(undefined, false);

    expect((await completeHivesignerCallback()).ok).toBe(false);
  });

  it('strips the token from the address bar even when it is refused', async () => {
    meResponds('mallory');

    // No nonce, so this is refused.
    expect((await completeHivesignerCallback()).ok).toBe(false);
    expect(window.location.search).toBe('');
  });
});
