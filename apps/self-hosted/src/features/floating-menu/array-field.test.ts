import { describe, expect, it } from 'vitest';
import {
  INVALID_ARRAY_MESSAGE,
  NON_PRIMITIVE_ARRAY_MESSAGE,
  validateArrayDraft,
  validateArrayEntries,
} from './array-field';

const AUTH_METHODS = ['keychain', 'hivesigner', 'hiveauth'] as const;

describe('list fields without a fixed set of values', () => {
  it('takes any list of plain values', () => {
    expect(validateArrayDraft('["blog", "posts"]')).toEqual({
      value: ['blog', 'posts'],
      error: null,
    });
    expect(validateArrayDraft('[1, 5, 10]')).toEqual({
      value: [1, 5, 10],
      error: null,
    });
  });

  it('refuses text that is not a list, without applying anything', () => {
    for (const draft of ['not json', '{"a": 1}', '"blog"', '']) {
      expect(validateArrayDraft(draft)).toEqual({
        value: null,
        error: INVALID_ARRAY_MESSAGE,
      });
    }
  });

  /**
   * The hosting API drops an array holding an object or a null and still
   * answers 200, so a value taken here would look saved and never be.
   */
  it('refuses objects, arrays and nulls inside the list', () => {
    expect(validateArrayDraft('[{"value": "blog"}]')).toEqual({
      value: null,
      error: NON_PRIMITIVE_ARRAY_MESSAGE,
    });
    expect(validateArrayDraft('[["blog"]]')).toEqual({
      value: null,
      error: NON_PRIMITIVE_ARRAY_MESSAGE,
    });
    expect(validateArrayDraft('["blog", null]')).toEqual({
      value: null,
      error: NON_PRIMITIVE_ARRAY_MESSAGE,
    });
  });
});

/**
 * `features.auth.methods` is the case this exists for: the login page renders a
 * method it knows or nothing at all, so a misspelled name is accepted by the
 * config and then does nothing, with no way for the owner to tell.
 */
describe('login methods, checked against the set the app can serve', () => {
  it('takes the methods the app can complete', () => {
    expect(
      validateArrayDraft('["keychain", "hivesigner"]', AUTH_METHODS),
    ).toEqual({ value: ['keychain', 'hivesigner'], error: null });
  });

  it('names the misspelling and the valid options, and applies nothing', () => {
    const result = validateArrayDraft('["keychain", "hivesign"]', AUTH_METHODS);

    expect(result.value).toBe(null);
    expect(result.error).toContain('"hivesign"');
    expect(result.error).toContain('keychain, hivesigner, hiveauth');
    // The valid neighbour must not be reported as the problem.
    expect(result.error).not.toContain('"keychain"');
  });

  it('reports every unknown entry, not just the first', () => {
    const result = validateArrayDraft('["hivesign", "keycahin"]', AUTH_METHODS);

    expect(result.error).toContain('"hivesign"');
    expect(result.error).toContain('"keycahin"');
  });

  it('rejects a non-string entry where names are expected', () => {
    expect(validateArrayEntries([42], AUTH_METHODS)).not.toBe(null);
    expect(validateArrayEntries([true], AUTH_METHODS)).not.toBe(null);
  });

  it('accepts an empty list, which offers no login at all', () => {
    expect(validateArrayEntries([], AUTH_METHODS)).toBe(null);
  });

  /** An entry already in the saved config has to be reported on open. */
  it('checks a stored value, not only typed text', () => {
    expect(validateArrayEntries(['keychain'], AUTH_METHODS)).toBe(null);
    expect(validateArrayEntries(['hivesign'], AUTH_METHODS)).toContain(
      '"hivesign"',
    );
  });
});
