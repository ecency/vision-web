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
