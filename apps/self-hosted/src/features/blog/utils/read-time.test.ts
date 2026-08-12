import { describe, expect, it } from 'vitest';
import { estimateReadMinutes } from './read-time';

const words = (n: number) => Array.from({ length: n }, (_, i) => `w${i}`).join(' ');

describe('estimateReadMinutes', () => {
  it('ceils to minutes at 225 wpm', () => {
    expect(estimateReadMinutes(words(10))).toBe(1);
    expect(estimateReadMinutes(words(225))).toBe(1);
    expect(estimateReadMinutes(words(226))).toBe(2);
    expect(estimateReadMinutes(words(700))).toBe(4);
  });

  it('does not count markup or image references as reading', () => {
    const noisy = [
      '![cover](https://img.example/x.png)',
      '<center><img src="https://img.example/y.png" /></center>',
      '## heading words still count',
      words(5),
    ].join('\n');
    expect(estimateReadMinutes(noisy)).toBe(1);
    // A link's label reads, its target does not.
    expect(estimateReadMinutes('[label](https://example.com)')).toBe(1);
  });

  it('answers null for nothing readable, never "0 min read"', () => {
    expect(estimateReadMinutes('')).toBeNull();
    expect(estimateReadMinutes('![x](https://a.b/c.png)')).toBeNull();
    expect(estimateReadMinutes(undefined)).toBeNull();
  });
});
