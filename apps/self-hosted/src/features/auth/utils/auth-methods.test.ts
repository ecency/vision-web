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
  it('offers the two that work on a phone before the desktop-only one', () => {
    // All three can save since #1356, so the old tiebreaker (which of them can
    // finish the task at all) no longer separates them and the ranking falls to
    // the device. keychain is a desktop browser extension; the other two are
    // not, and hiveauth's wallet IS the phone.
    expect(orderAuthMethods(['keychain', 'hivesigner', 'hiveauth'])).toEqual([
      'hivesigner',
      'hiveauth',
      'keychain',
    ]);
  });

  it('leads with hivesigner, the only method that saves and works on a phone', () => {
    expect(orderAuthMethods(['hiveauth', 'keychain', 'hivesigner'])[0]).toBe(
      'hivesigner',
    );
  });

  it('leads with hiveauth on a default instance, where it is the phone-capable one', () => {
    // What availableAuthMethods hands this function on the stock config:
    // hivesigner is dropped for want of a client id. Both survivors can save
    // now, so the extension no longer has to lead on capability grounds, and
    // hiveauth is the one an owner can finish on the device in their hand.
    // This reverses the previous expectation deliberately.
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
      'hiveauth',
      'keychain',
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
    expect(ordered).toEqual(['hivesigner', 'hiveauth', 'keychain']);
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

  it('says yes for hiveauth, which signs the login challenge via HAS.challenge', () => {
    // The wrapper has no offline TRANSACTION signing, which is what the old
    // "false" here was really about. Signing a challenge is a separate command
    // and is all getHostingToken needs. Corrected in #1356.
    expect(canSaveConfiguration('hiveauth')).toBe(true);
  });

  it('says no for a method it has never heard of', () => {
    expect(canSaveConfiguration('made-up' as AuthMethod)).toBe(false);
  });
});
