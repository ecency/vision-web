import { describe, expect, it } from 'vitest';
import { AUTH_METHODS, availableAuthMethods } from './auth-methods';

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
