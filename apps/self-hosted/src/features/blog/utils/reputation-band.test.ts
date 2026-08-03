import { describe, expect, it } from 'vitest';
import { resolveReputation } from './reputation-band';

describe('resolveReputation', () => {
  it('bands the converted reputation scale', () => {
    expect(resolveReputation(1)).toEqual({ band: 'new', score: 1 });
    expect(resolveReputation(39.9)).toEqual({ band: 'new', score: 39 });
    expect(resolveReputation(40)).toEqual({ band: 'established', score: 40 });
    expect(resolveReputation(69.9)).toEqual({
      band: 'established',
      score: 69,
    });
    expect(resolveReputation(70)).toEqual({ band: 'longstanding', score: 70 });
    expect(resolveReputation(83)).toEqual({ band: 'longstanding', score: 83 });
  });

  it('says nothing at zero', () => {
    // getAccountFullQueryOptions degrades to reputation 0 when the bridge
    // profile call fails, so a band label here would assert an account age the
    // app has not established.
    expect(resolveReputation(0)).toBeNull();
    expect(resolveReputation(-5)).toBeNull();
  });

  it('says nothing for a value that is not a finite number', () => {
    for (const value of [undefined, null, '55', Number.NaN, Infinity, {}, []]) {
      expect(resolveReputation(value)).toBeNull();
    }
  });
});
