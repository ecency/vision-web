import { describe, expect, it } from 'vitest';
import type { AuthMethod } from '../types';
import {
  AUTH_METHODS,
  availableAuthMethods,
  orderAuthMethods,
} from './auth-methods';

/**
 * What a reader is offered. Hivesigner without a registered client can only end
 * in an OAuth error, so it must not reach the login page at all: the owner is
 * told about it in the configuration editor, which only the owner can open.
 */
describe('methods offered to a visitor', () => {
  it('drops hivesigner when the instance has no client id', () => {
    expect(
      availableAuthMethods(['keychain', 'hivesigner', 'hiveauth'], null),
    ).toEqual(['keychain', 'hiveauth']);
  });

  it('offers hivesigner once the instance has a client id', () => {
    expect(
      availableAuthMethods(['keychain', 'hivesigner'], 'myblog.app'),
    ).toEqual(['keychain', 'hivesigner']);
  });

  it('leaves the other methods alone either way', () => {
    expect(availableAuthMethods(['keychain', 'hiveauth'], null)).toEqual([
      'keychain',
      'hiveauth',
    ]);
  });

  it('offers nothing when no methods are configured', () => {
    expect(availableAuthMethods(undefined, 'myblog.app')).toEqual([]);
  });

  it('lists exactly the methods the login page can render', () => {
    expect([...AUTH_METHODS]).toEqual(['keychain', 'hivesigner', 'hiveauth']);
  });
});

/**
 * The order they are offered in.
 *
 * `keychain` needs a desktop browser extension. On a phone its card is an
 * install prompt for software the device cannot run, so offering it first made
 * the first thing an owner read on their own site a dead end. Nothing else on
 * this page can be device-aware without asking the browser, so the fix is the
 * static order: whatever completes anywhere goes first.
 */
describe('the order methods are offered in', () => {
  it('offers the extension last, after the methods a phone can finish', () => {
    expect(orderAuthMethods(['keychain', 'hivesigner', 'hiveauth'])).toEqual([
      'hiveauth',
      'hivesigner',
      'keychain',
    ]);
  });

  it('puts hiveauth first on a default instance, which has no hivesigner client', () => {
    // What availableAuthMethods actually hands this function on the stock
    // config: hivesigner is already gone, so the phone-capable method has to
    // come out in front of the extension or the page opens on the dead end.
    const offered = availableAuthMethods(
      ['keychain', 'hivesigner', 'hiveauth'],
      null,
    );
    expect(orderAuthMethods(offered)).toEqual(['hiveauth', 'keychain']);
  });

  it('is a reordering, never a filter', () => {
    const configured: AuthMethod[] = ['keychain', 'hiveauth'];
    const ordered = orderAuthMethods(configured);
    expect([...ordered].sort()).toEqual([...configured].sort());
    expect(ordered).toHaveLength(configured.length);
  });

  it('keeps an unranked method rather than dropping it', () => {
    // The config type is not enforced at runtime, and availableAuthMethods
    // casts rather than filters, so an unknown name reaches this function. It
    // must survive to the page, which decides what to do with it.
    const ordered = orderAuthMethods([
      'made-up',
      'keychain',
      'hiveauth',
    ] as unknown as AuthMethod[]);
    expect(ordered).toEqual(['hiveauth', 'keychain', 'made-up']);
  });

  it('keeps unranked methods in the order they were configured', () => {
    const ordered = orderAuthMethods([
      'zzz',
      'aaa',
      'hiveauth',
    ] as unknown as AuthMethod[]);
    expect(ordered).toEqual(['hiveauth', 'zzz', 'aaa']);
  });

  it('does not mutate the list it was given', () => {
    const configured: AuthMethod[] = ['keychain', 'hiveauth'];
    orderAuthMethods(configured);
    expect(configured).toEqual(['keychain', 'hiveauth']);
  });

  it('offers nothing when nothing is available', () => {
    expect(orderAuthMethods([])).toEqual([]);
  });
});
