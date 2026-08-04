import { describe, expect, it } from 'vitest';
import type { AuthMethod } from '../types';
import {
  AUTH_METHODS,
  availableAuthMethods,
  canSaveConfiguration,
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
 * Ranked by what completes the task the login page advertises, which is
 * configuring the site. `hiveauth` cannot save a configuration change at all
 * (`getHostingToken` has no case for it and throws), so leading with it sent an
 * owner through sign-in, the panel and an edit before telling them to log in
 * again with something else. `config-saving-capability.test.ts` holds the
 * capability list to the switch that decides it.
 */
describe('the order methods are offered in', () => {
  it('offers both saving methods before the one that cannot save', () => {
    expect(orderAuthMethods(['keychain', 'hivesigner', 'hiveauth'])).toEqual([
      'hivesigner',
      'keychain',
      'hiveauth',
    ]);
  });

  it('leads with hivesigner, the only method that saves and works on a phone', () => {
    expect(orderAuthMethods(['hiveauth', 'keychain', 'hivesigner'])[0]).toBe(
      'hivesigner',
    );
  });

  it('still puts the extension ahead of hiveauth on a default instance', () => {
    // What availableAuthMethods actually hands this function on the stock
    // config: hivesigner is dropped for want of a client id, so the only
    // method left that can save is the extension, and it has to come first
    // even though it cannot complete on a phone. Nothing offered on a stock
    // instance both saves and works on a phone, which is why the hint says so.
    const offered = availableAuthMethods(
      ['keychain', 'hivesigner', 'hiveauth'],
      null,
    );
    expect(orderAuthMethods(offered)).toEqual(['keychain', 'hiveauth']);
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
    expect(ordered).toEqual(['keychain', 'hiveauth', 'made-up']);
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

/**
 * Duplicates.
 *
 * The page renders one card per entry, keyed by the method name. The shape this
 * replaced tested `includes()` per known method, so a config naming one twice
 * still rendered it once; mapping the list renders it twice, under one React
 * key. The config is not validated at runtime, so the list has to arrive
 * already unique.
 */
describe('a method configured more than once', () => {
  it('is offered exactly one card', () => {
    expect(orderAuthMethods(['keychain', 'keychain', 'hiveauth'])).toEqual([
      'keychain',
      'hiveauth',
    ]);
  });

  it('produces a list whose entries are unique, so React keys cannot collide', () => {
    const ordered = orderAuthMethods([
      'hiveauth',
      'keychain',
      'hiveauth',
      'keychain',
      'hivesigner',
      'hivesigner',
    ]);
    expect(new Set(ordered).size).toBe(ordered.length);
    expect(ordered).toEqual(['hivesigner', 'keychain', 'hiveauth']);
  });

  it('deduplicates an unknown method too, and still does not rank it', () => {
    const ordered = orderAuthMethods([
      'made-up',
      'hiveauth',
      'made-up',
    ] as unknown as AuthMethod[]);
    expect(ordered).toEqual(['hiveauth', 'made-up']);
  });

  it('keeps the first occurrence, so a duplicate cannot move an unranked method up', () => {
    const ordered = orderAuthMethods([
      'zzz',
      'aaa',
      'zzz',
    ] as unknown as AuthMethod[]);
    expect(ordered).toEqual(['zzz', 'aaa']);
  });
});

/**
 * The capability the ordering is derived from. The list itself is held to
 * `hosting-token.ts` by `config-saving-capability.test.ts`; here it only has to
 * answer the question the page asks it.
 */
describe('which methods can save a configuration change', () => {
  it('says yes for the two the hosting API can mint a token from', () => {
    expect(canSaveConfiguration('hivesigner')).toBe(true);
    expect(canSaveConfiguration('keychain')).toBe(true);
  });

  it('says no for hiveauth, which cannot sign the login challenge', () => {
    expect(canSaveConfiguration('hiveauth')).toBe(false);
  });

  it('says no for a method it has never heard of', () => {
    expect(canSaveConfiguration('made-up' as AuthMethod)).toBe(false);
  });
});
