// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { getRssFeedUrl } from './rss-feed-url';

describe('getRssFeedUrl', () => {
  it('returns blog RSS URL for blog type', () => {
    expect(getRssFeedUrl('blog', 'alice', undefined)).toBe(
      'https://ecency.com/@alice/rss',
    );
  });

  it('returns community RSS URL for community type', () => {
    expect(getRssFeedUrl('community', undefined, 'hive-123456')).toBe(
      'https://ecency.com/created/hive-123456/rss',
    );
  });

  it('returns null when blog type is missing username', () => {
    expect(getRssFeedUrl('blog', undefined, undefined)).toBeNull();
  });

  it('returns null when community type is missing communityId', () => {
    expect(getRssFeedUrl('community', 'alice', undefined)).toBeNull();
  });

  it('returns null for blog type with empty username', () => {
    expect(getRssFeedUrl('blog', '', undefined)).toBeNull();
  });

  it('returns null for community type with empty communityId', () => {
    expect(getRssFeedUrl('community', '', '')).toBeNull();
  });

  it('returns null for community type with whitespace communityId', () => {
    expect(getRssFeedUrl('community', '', '   ')).toBeNull();
  });

  it('a managed instance serves its own feed instead of the ecency.com one', () => {
    // jsdom's origin stands in for the tenant's; the point is the SELF feed.
    expect(getRssFeedUrl('blog', 'alice', undefined, true)).toBe(
      `${window.location.origin}/rss.xml`,
    );
    expect(getRssFeedUrl('community', undefined, 'hive-1', true)).toBe(
      `${window.location.origin}/rss.xml`,
    );
    // Unmanaged keeps the ecency.com stand-in, never a 404 on itself.
    expect(getRssFeedUrl('blog', 'alice', undefined, false)).toBe(
      'https://ecency.com/@alice/rss',
    );
  });


  it('an explicit override outranks everything and junk overrides are ignored', () => {
    expect(
      getRssFeedUrl('blog', 'alice', undefined, true, 'https://blog.example/rss.xml'),
    ).toBe('https://blog.example/rss.xml');
    // Not a web URL: fall through to the normal resolution.
    expect(
      getRssFeedUrl('blog', 'alice', undefined, false, 'javascript:alert(1)'),
    ).toBe('https://ecency.com/@alice/rss');
  });

});
