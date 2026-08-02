import { afterEach, describe, expect, it } from 'vitest';
import {
  internalSecret,
  internalSecretOk,
  MIN_INTERNAL_SECRET_LENGTH,
} from './internal';

const STRONG = 'a'.repeat(MIN_INTERNAL_SECRET_LENGTH);
const original = process.env.HOSTING_INTERNAL_SECRET;

afterEach(() => {
  if (original === undefined) delete process.env.HOSTING_INTERNAL_SECRET;
  else process.env.HOSTING_INTERNAL_SECRET = original;
});

/**
 * These routes activate subscriptions, attach custom domains and grant free Pro
 * terms, and this secret is the only thing in front of them. JWT_SECRET is
 * floored at 32 characters; this one had no floor, so a short operator-chosen
 * value was accepted and could be guessed.
 */
describe('internal shared secret', () => {
  it('accepts a secret of the required length', () => {
    process.env.HOSTING_INTERNAL_SECRET = STRONG;

    expect(internalSecret()).toBe(STRONG);
    expect(internalSecretOk(STRONG)).toBe(true);
  });

  it('refuses a secret shorter than the floor, even when it matches', () => {
    const weak = 'short-secret';
    process.env.HOSTING_INTERNAL_SECRET = weak;

    expect(internalSecret()).toBe(null);
    expect(internalSecretOk(weak)).toBe(false);
  });

  it('refuses a secret one character below the floor', () => {
    const almost = 'a'.repeat(MIN_INTERNAL_SECRET_LENGTH - 1);
    process.env.HOSTING_INTERNAL_SECRET = almost;

    expect(internalSecretOk(almost)).toBe(false);
  });

  it('fails closed when the secret is unset', () => {
    delete process.env.HOSTING_INTERNAL_SECRET;

    expect(internalSecret()).toBe(null);
    expect(internalSecretOk('')).toBe(false);
    expect(internalSecretOk(undefined)).toBe(false);
    expect(internalSecretOk(STRONG)).toBe(false);
  });

  it('rejects a wrong secret of the right length', () => {
    process.env.HOSTING_INTERNAL_SECRET = STRONG;

    expect(internalSecretOk('b'.repeat(MIN_INTERNAL_SECRET_LENGTH))).toBe(false);
  });

  it('rejects a multi-byte value of the same string length without throwing', () => {
    // timingSafeEqual throws on a byte-length mismatch, and two strings of equal
    // length can encode to different byte counts, which would turn a rejected
    // secret into a 500 rather than a 403.
    process.env.HOSTING_INTERNAL_SECRET = STRONG;
    const sameLengthDifferentBytes = `${'a'.repeat(MIN_INTERNAL_SECRET_LENGTH - 1)}\u00e9`;

    expect(sameLengthDifferentBytes.length).toBe(STRONG.length);
    expect(Buffer.from(sameLengthDifferentBytes).length).not.toBe(
      Buffer.from(STRONG).length,
    );
    expect(() => internalSecretOk(sameLengthDifferentBytes)).not.toThrow();
    expect(internalSecretOk(sameLengthDifferentBytes)).toBe(false);
  });

  it('rejects a value that is merely a prefix of the secret', () => {
    process.env.HOSTING_INTERNAL_SECRET = STRONG;

    expect(internalSecretOk(STRONG.slice(0, -1))).toBe(false);
  });
});
