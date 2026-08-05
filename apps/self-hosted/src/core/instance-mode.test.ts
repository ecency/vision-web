import { describe, expect, it } from 'vitest';
import { isCommunityConfig, isCommunityInstance } from './instance-mode';

/**
 * One definition of "is a community", because there were two and a third was
 * about to be written.
 *
 * The nuance that makes a single definition necessary: `type: 'community'` with
 * no `communityId` is NOT a community. Every community behaviour is built from
 * that id, so such an instance behaves as a blog everywhere, and a definition
 * that ignored the id would disagree with the sidebar.
 */
describe('isCommunityInstance', () => {
  it('needs both the type and an id', () => {
    expect(isCommunityInstance({ type: 'community', communityId: 'hive-125125' })).toBe(true);
  });

  it('is not a community when the id is missing, which is the whole point', () => {
    expect(isCommunityInstance({ type: 'community' })).toBe(false);
    expect(isCommunityInstance({ type: 'community', communityId: '' })).toBe(false);
    // Whitespace is not an id either: it would pass a bare truthiness check and
    // produce a community with nothing to query.
    expect(isCommunityInstance({ type: 'community', communityId: '   ' })).toBe(false);
  });

  it('is not a community for a blog, whatever else is set', () => {
    expect(isCommunityInstance({ type: 'blog', communityId: 'hive-125125' })).toBe(false);
  });

  /** The document is unvalidated, so none of this is guaranteed at runtime. */
  it('survives absent and wrongly typed input', () => {
    expect(isCommunityInstance(null)).toBe(false);
    expect(isCommunityInstance(undefined)).toBe(false);
    expect(isCommunityInstance({})).toBe(false);
    expect(isCommunityInstance({ type: 'community', communityId: 42 })).toBe(false);
    expect(isCommunityInstance({ type: 42, communityId: 'hive-1' })).toBe(false);
  });
});

describe('isCommunityConfig', () => {
  const community = {
    configuration: {
      instanceConfiguration: { type: 'community', communityId: 'hive-125125' },
    },
  };

  it('reads the instance out of a whole document', () => {
    expect(isCommunityConfig(community)).toBe(true);
  });

  it('agrees with isCommunityInstance on the same instance', () => {
    const cases = [
      { type: 'community', communityId: 'hive-1' },
      { type: 'community', communityId: '' },
      { type: 'blog', communityId: 'hive-1' },
      { type: 'blog' },
      {},
    ];
    for (const instance of cases) {
      expect(
        isCommunityConfig({
          configuration: { instanceConfiguration: instance },
        }),
        JSON.stringify(instance),
      ).toBe(isCommunityInstance(instance));
    }
  });

  /**
   * Every node on the path is checked rather than assumed. The config editor
   * hands this whatever is in the document, and the hosting API will store a
   * string or an array where an object belongs.
   */
  it('survives a malformed document at every level', () => {
    for (const bad of [
      null,
      undefined,
      'a string',
      [],
      { configuration: 'nope' },
      { configuration: { instanceConfiguration: 'nope' } },
      { configuration: { instanceConfiguration: [] } },
      { configuration: null },
      {},
    ]) {
      expect(isCommunityConfig(bad), JSON.stringify(bad)).toBe(false);
    }
  });
});
