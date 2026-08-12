// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  actOnLoginRequest,
  captureSetupParams,
  clearSetupPending,
  hasSeenFirstRun,
  isSetupPending,
  markFirstRunSeen,
  peekLoginRequest,
} from './setup-handoff';

describe('setup handoff', () => {
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    window.history.replaceState(null, '', '/');
  });

  it('captures ?setup=1 into a pending intent and strips the URL', () => {
    window.history.replaceState(null, '', '/?setup=1&filter=posts');
    captureSetupParams();
    expect(isSetupPending()).toBe(true);
    // Other params survive; a refresh cannot replay the handoff.
    expect(window.location.search).toBe('?filter=posts');
    clearSetupPending();
    expect(isSetupPending()).toBe(false);
  });

  it('preserves the hash fragment when stripping params', () => {
    window.history.replaceState(null, '', '/page?setup=1#section');
    captureSetupParams();
    expect(window.location.hash).toBe('#section');
    expect(window.location.search).toBe('');
    expect(isSetupPending()).toBe(true);
  });

  it('stores the login intent for whoever has the context to act on it', () => {
    window.history.replaceState(null, '', '/?login=hivesigner&setup=1');
    captureSetupParams();
    // Both intents are stored BEFORE any component effect can run, so effect
    // ordering between components can never decide whether they are seen.
    expect(peekLoginRequest()).toBe('hivesigner');
    expect(isSetupPending()).toBe(true);
    expect(window.location.search).toBe('');
  });

  it('acts on a login request once: starts the flow when offered and signed out', () => {
    window.history.replaceState(null, '', '/?login=hivesigner');
    captureSetupParams();
    const begin = vi.fn();
    actOnLoginRequest({
      canLoginWithHivesigner: true,
      isAuthenticated: false,
      beginHivesignerLogin: begin,
    });
    expect(begin).toHaveBeenCalledTimes(1);
    // Decided and cleared: a second run cannot double-redirect.
    actOnLoginRequest({
      canLoginWithHivesigner: true,
      isAuthenticated: false,
      beginHivesignerLogin: begin,
    });
    expect(begin).toHaveBeenCalledTimes(1);
  });

  it('drops the request when signed in, but RETAINS it while the method is unavailable', () => {
    const begin = vi.fn();
    window.history.replaceState(null, '', '/?login=hivesigner');
    captureSetupParams();
    actOnLoginRequest({
      canLoginWithHivesigner: true,
      isAuthenticated: true,
      beginHivesignerLogin: begin,
    });
    expect(begin).not.toHaveBeenCalled();
    expect(peekLoginRequest()).toBeNull();

    window.history.replaceState(null, '', '/?login=hivesigner');
    captureSetupParams();
    actOnLoginRequest({
      canLoginWithHivesigner: false,
      isAuthenticated: false,
      beginHivesignerLogin: begin,
    });
    expect(begin).not.toHaveBeenCalled();
    // Retained: a client id that registers a moment later (or the next load)
    // can still honor the auto-login instead of silently never firing.
    expect(peekLoginRequest()).toBe('hivesigner');
    actOnLoginRequest({
      canLoginWithHivesigner: true,
      isAuthenticated: false,
      beginHivesignerLogin: begin,
    });
    expect(begin).toHaveBeenCalledTimes(1);
  });

  it('does nothing at all without handoff params', () => {
    window.history.replaceState(null, '', '/?filter=posts');
    captureSetupParams();
    expect(isSetupPending()).toBe(false);
    expect(peekLoginRequest()).toBeNull();
    expect(window.location.search).toBe('?filter=posts');
  });

  it('first-run is per account and one-time', () => {
    expect(hasSeenFirstRun('alice')).toBe(false);
    markFirstRunSeen('Alice');
    expect(hasSeenFirstRun('alice')).toBe(true);
    expect(hasSeenFirstRun('bob')).toBe(false);
  });
});

describe('carried-session token handoff', () => {
  beforeEach(async () => {
    const { resetCarriedToken } = await import('./setup-handoff');
    resetCarriedToken();
    sessionStorage.clear();
    localStorage.clear();
    window.history.replaceState(null, '', '/');
  });

  it('captures the #hs fragment at boot, scrubs it and keeps other params', async () => {
    const { actOnTokenHandoff } = await import('./setup-handoff');
    window.history.replaceState(null, '', '/?setup=1#hs=tok-abc');
    captureSetupParams();
    // The bearer is gone from the URL before anything renders...
    expect(window.location.hash).toBe('');
    expect(window.location.search).toBe('');
    expect(isSetupPending()).toBe(true);
    // ...and lives only in module memory until the one decisive act.
    const resolve = vi.fn(async () => 'alice');
    const user = await actOnTokenHandoff({
      isAuthEnabled: true,
      isAuthenticated: false,
      ownerUsername: 'alice',
      resolveAccount: resolve,
    });
    expect(resolve).toHaveBeenCalledWith('tok-abc');
    expect(user).toMatchObject({
      username: 'alice',
      accessToken: 'tok-abc',
      loginType: 'hivesigner',
    });
  });

  it('identity comes from the resolver, never the URL, and one act consumes the token', async () => {
    const { actOnTokenHandoff } = await import('./setup-handoff');
    window.history.replaceState(null, '', '/#hs=tok-xyz');
    captureSetupParams();
    const resolve = vi.fn(async () => null); // forged or expired token
    const first = await actOnTokenHandoff({
      isAuthEnabled: true,
      isAuthenticated: false,
      ownerUsername: 'alice',
      resolveAccount: resolve,
    });
    expect(first).toBeNull();
    // Consumed whatever the outcome: a second run cannot retry the bearer.
    const second = await actOnTokenHandoff({
      isAuthEnabled: true,
      isAuthenticated: false,
      ownerUsername: 'alice',
      resolveAccount: resolve,
    });
    expect(second).toBeNull();
    expect(resolve).toHaveBeenCalledTimes(1);
  });

  it('shares the one attempt across effect replays instead of dropping the session', async () => {
    // StrictMode replays an effect's setup on mount: run 1 consumes the token,
    // run 1's cleanup discards its result, run 2 must still land the session.
    const { actOnTokenHandoff } = await import('./setup-handoff');
    window.history.replaceState(null, '', '/#hs=tok-replay');
    captureSetupParams();
    const resolve = vi.fn(async () => 'alice');
    const context = {
      isAuthEnabled: true,
      isAuthenticated: false,
      ownerUsername: 'alice',
      resolveAccount: resolve,
    };
    const first = actOnTokenHandoff(context); // run 1, result discarded
    const second = await actOnTokenHandoff(context); // run 2 lands it
    expect(second).toMatchObject({ username: 'alice', accessToken: 'tok-replay' });
    expect(await first).toBe(second);
    expect(resolve).toHaveBeenCalledTimes(1);
  });

  it('refuses any account that is not the instance owner (login CSRF gate)', async () => {
    const { actOnTokenHandoff, resetCarriedToken } = await import('./setup-handoff');
    // A visitor clicks a crafted link carrying a REAL token for the
    // attacker's own account: /me resolves it, but it is not the owner.
    window.history.replaceState(null, '', '/#hs=tok-mallory');
    captureSetupParams();
    const resolveMallory = vi.fn(async () => 'mallory');
    expect(
      await actOnTokenHandoff({
        isAuthEnabled: true,
        isAuthenticated: false,
        ownerUsername: 'alice',
        resolveAccount: resolveMallory,
      }),
    ).toBeNull();

    // No owner known means refuse, never fall open.
    resetCarriedToken();
    window.history.replaceState(null, '', '/#hs=tok-x');
    captureSetupParams();
    expect(
      await actOnTokenHandoff({
        isAuthEnabled: true,
        isAuthenticated: false,
        ownerUsername: undefined,
        resolveAccount: vi.fn(async () => 'alice'),
      }),
    ).toBeNull();

    // The owner matches case-insensitively (account names are lowercase on
    // chain, but a hand-typed config field may not be).
    resetCarriedToken();
    window.history.replaceState(null, '', '/#hs=tok-owner');
    captureSetupParams();
    expect(
      await actOnTokenHandoff({
        isAuthEnabled: true,
        isAuthenticated: false,
        ownerUsername: 'Alice ',
        resolveAccount: vi.fn(async () => 'alice'),
      }),
    ).toMatchObject({ username: 'alice' });
  });

  it('drops the token unseen when auth is off or somebody is signed in', async () => {
    const { actOnTokenHandoff, resetCarriedToken } = await import('./setup-handoff');
    window.history.replaceState(null, '', '/#hs=tok-1');
    captureSetupParams();
    const resolve = vi.fn(async () => 'alice');
    expect(
      await actOnTokenHandoff({
        isAuthEnabled: false,
        isAuthenticated: false,
        ownerUsername: 'alice',
        resolveAccount: resolve,
      }),
    ).toBeNull();
    expect(resolve).not.toHaveBeenCalled();

    resetCarriedToken();
    window.history.replaceState(null, '', '/#hs=tok-2');
    captureSetupParams();
    expect(
      await actOnTokenHandoff({
        isAuthEnabled: true,
        isAuthenticated: true,
        ownerUsername: 'alice',
        resolveAccount: resolve,
      }),
    ).toBeNull();
    expect(resolve).not.toHaveBeenCalled();
  });

  it('survives a malformed fragment: no token, but the URL is still scrubbed', async () => {
    // captureSetupParams runs before anything renders, so a crafted `#hs=%`
    // link must not be able to throw and blank the page.
    const { actOnTokenHandoff } = await import('./setup-handoff');
    window.history.replaceState(null, '', '/#hs=%');
    expect(() => captureSetupParams()).not.toThrow();
    expect(window.location.hash).toBe('');
    const resolve = vi.fn(async () => 'alice');
    expect(
      await actOnTokenHandoff({
        isAuthEnabled: true,
        isAuthenticated: false,
        ownerUsername: 'alice',
        resolveAccount: resolve,
      }),
    ).toBeNull();
    expect(resolve).not.toHaveBeenCalled();
  });

  it('captures a #hc code, exchanges it once and owner-gates the result', async () => {
    const { actOnTokenHandoff } = await import('./setup-handoff');
    window.history.replaceState(null, '', '/?setup=1#hc=code-abc');
    captureSetupParams();
    // The code is gone from the URL before anything renders...
    expect(window.location.hash).toBe('');
    expect(isSetupPending()).toBe(true);

    const exchange = vi.fn(async () => ({
      accessToken: 'tok-from-exchange',
      username: 'alice',
    }));
    const context = {
      isAuthEnabled: true,
      isAuthenticated: false,
      ownerUsername: 'alice',
      exchangeCode: exchange,
    };
    const user = await actOnTokenHandoff(context);
    expect(exchange).toHaveBeenCalledWith('code-abc');
    expect(user).toMatchObject({
      username: 'alice',
      accessToken: 'tok-from-exchange',
      loginType: 'hivesigner',
    });
    // One attempt per page load: a replay observes the same outcome without
    // a second exchange (the code is single-use server-side anyway).
    expect(await actOnTokenHandoff(context)).toBe(user);
    expect(exchange).toHaveBeenCalledTimes(1);
  });

  it('refuses an exchanged session for anyone but the owner', async () => {
    const { actOnTokenHandoff } = await import('./setup-handoff');
    window.history.replaceState(null, '', '/#hc=code-mallory');
    captureSetupParams();
    expect(
      await actOnTokenHandoff({
        isAuthEnabled: true,
        isAuthenticated: false,
        ownerUsername: 'alice',
        exchangeCode: vi.fn(async () => ({
          accessToken: 'tok-m',
          username: 'mallory',
        })),
      }),
    ).toBeNull();
  });

  it('survives a malformed #hc fragment: no code, but the URL is scrubbed', async () => {
    const { actOnTokenHandoff } = await import('./setup-handoff');
    window.history.replaceState(null, '', '/#hc=%');
    expect(() => captureSetupParams()).not.toThrow();
    expect(window.location.hash).toBe('');
    const exchange = vi.fn();
    expect(
      await actOnTokenHandoff({
        isAuthEnabled: true,
        isAuthenticated: false,
        ownerUsername: 'alice',
        exchangeCode: exchange,
      }),
    ).toBeNull();
    expect(exchange).not.toHaveBeenCalled();
  });

  it('leaves a foreign fragment untouched', () => {
    window.history.replaceState(null, '', '/page#section-2');
    captureSetupParams();
    expect(window.location.hash).toBe('#section-2');
  });
});
