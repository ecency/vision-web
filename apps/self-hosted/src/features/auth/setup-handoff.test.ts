// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearSetupPending,
  consumeSetupHandoff,
  hasSeenFirstRun,
  isSetupPending,
  markFirstRunSeen,
} from './setup-handoff';

describe('setup handoff', () => {
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    window.history.replaceState(null, '', '/');
  });

  it('consumes ?setup=1 into a pending intent and strips the URL', () => {
    window.history.replaceState(null, '', '/?setup=1&filter=posts');
    consumeSetupHandoff({ canLoginWithHivesigner: false });
    expect(isSetupPending()).toBe(true);
    // Other params survive; a refresh cannot replay the handoff.
    expect(window.location.search).toBe('?filter=posts');
    consumeSetupHandoff({ canLoginWithHivesigner: false });
    clearSetupPending();
    expect(isSetupPending()).toBe(false);
  });

  it('starts the instance-side Hivesigner flow only when offered and signed out', () => {
    const begin = vi.fn();
    window.history.replaceState(null, '', '/?login=hivesigner&setup=1');
    consumeSetupHandoff({ canLoginWithHivesigner: true, beginHivesignerLogin: begin });
    expect(begin).toHaveBeenCalledTimes(1);
    // The setup intent is stored BEFORE the redirect, so it survives the round trip.
    expect(isSetupPending()).toBe(true);
    expect(window.location.search).toBe('');
  });

  it('drops the login request when Hivesigner is not available', () => {
    const begin = vi.fn();
    window.history.replaceState(null, '', '/?login=hivesigner');
    consumeSetupHandoff({ canLoginWithHivesigner: false, beginHivesignerLogin: begin });
    expect(begin).not.toHaveBeenCalled();
    expect(window.location.search).toBe('');
  });

  it('does nothing at all without handoff params', () => {
    const begin = vi.fn();
    window.history.replaceState(null, '', '/?filter=posts');
    consumeSetupHandoff({ canLoginWithHivesigner: true, beginHivesignerLogin: begin });
    expect(begin).not.toHaveBeenCalled();
    expect(isSetupPending()).toBe(false);
    expect(window.location.search).toBe('?filter=posts');
  });

  it('first-run is per account and one-time', () => {
    expect(hasSeenFirstRun('alice')).toBe(false);
    markFirstRunSeen('Alice');
    expect(hasSeenFirstRun('alice')).toBe(true);
    expect(hasSeenFirstRun('bob')).toBe(false);
  });
});
