import { describe, expect, it } from 'vitest';
import { safeWebsiteUrl } from './safe-website';

describe('safeWebsiteUrl', () => {
  it('passes http(s) URLs through and prefixes bare domains', () => {
    expect(safeWebsiteUrl('https://example.com/blog')).toBe(
      'https://example.com/blog',
    );
    expect(safeWebsiteUrl('http://example.com')).toBe('http://example.com');
    expect(safeWebsiteUrl('example.com')).toBe('https://example.com');
    expect(safeWebsiteUrl('  example.com  ')).toBe('https://example.com');
  });

  it('refuses everything that is not a web URL', () => {
    // The field is authored on-chain; a scheme smuggled into it must render
    // as nothing, never as a clickable href.
    expect(safeWebsiteUrl('javascript:alert(1)')).toBeNull();
    expect(safeWebsiteUrl('data:text/html,x')).toBeNull();
    expect(safeWebsiteUrl('not a url at all')).toBeNull();
    expect(safeWebsiteUrl('')).toBeNull();
    expect(safeWebsiteUrl(undefined)).toBeNull();
    expect(safeWebsiteUrl(42)).toBeNull();
  });
});
