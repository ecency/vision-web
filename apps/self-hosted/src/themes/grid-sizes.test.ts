// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { computeThemeGridSizes } from './grid-sizes';

const VARS = ['--theme-grid-columns-tablet', '--theme-grid-columns-desktop'];

describe('computeThemeGridSizes', () => {
  afterEach(() => {
    for (const name of VARS) {
      document.documentElement.style.removeProperty(name);
    }
  });

  it('derives the sizes hint from the theme column variables', () => {
    // One column everywhere, the Reader and Journal shape.
    document.documentElement.style.setProperty('--theme-grid-columns-tablet', '1');
    document.documentElement.style.setProperty('--theme-grid-columns-desktop', '1');
    expect(computeThemeGridSizes('reader')).toBe(
      '(max-width: 767px) 100vw, (max-width: 1023px) 100vw, 100vw',
    );

    // Two columns everywhere, the Minimal and Developer shape.
    document.documentElement.style.setProperty('--theme-grid-columns-tablet', '2');
    document.documentElement.style.setProperty('--theme-grid-columns-desktop', '2');
    expect(computeThemeGridSizes('minimal')).toBe(
      '(max-width: 767px) 100vw, (max-width: 1023px) 50vw, 50vw',
    );
  });

  it('falls back to the default two-then-three grid when variables are absent or junk', () => {
    expect(computeThemeGridSizes('medium')).toBe(
      '(max-width: 767px) 100vw, (max-width: 1023px) 50vw, 33vw',
    );

    document.documentElement.style.setProperty('--theme-grid-columns-tablet', 'banana');
    document.documentElement.style.setProperty('--theme-grid-columns-desktop', '-2');
    expect(computeThemeGridSizes('medium')).toBe(
      '(max-width: 767px) 100vw, (max-width: 1023px) 50vw, 33vw',
    );
  });
});
