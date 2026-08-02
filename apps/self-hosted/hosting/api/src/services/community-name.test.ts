import { describe, expect, it } from 'vitest';
import { COMMUNITY_NAME } from './tenant-service';

/**
 * Every path that can bring a tenant into existence has to recognise a
 * community claim identically. The public route derives it from the subdomain;
 * the payment listener refuses to auto-create one, because doing so would set
 * owner = the community account and permanently occupy the subdomain with no
 * ownership check and no way for the real team to reclaim it.
 */
describe('COMMUNITY_NAME', () => {
  it('matches the community account shape', () => {
    for (const name of ['hive-1', 'hive-125125', 'hive-140217']) {
      expect(COMMUNITY_NAME.test(name)).toBe(true);
    }
  });

  it('does not match ordinary accounts or near misses', () => {
    for (const name of ['alice', 'hive', 'hive-', 'hive-abc', 'hive-12a', 'xhive-1', 'hive-1x']) {
      expect(COMMUNITY_NAME.test(name), name).toBe(false);
    }
  });

  it('is anchored so it cannot match a substring', () => {
    expect(COMMUNITY_NAME.test('not-hive-125125')).toBe(false);
    expect(COMMUNITY_NAME.test('hive-125125-blog')).toBe(false);
  });
});
