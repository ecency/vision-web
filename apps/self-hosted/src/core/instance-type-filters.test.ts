import { describe, expect, it } from 'vitest';
import {
  defaultPostsFiltersFor,
  sanitizePostsFiltersFor,
  toInstanceType,
  withPinnedInstanceType,
} from './instance-type-filters';

function makeDocument(type: string, postsFilters?: unknown) {
  return {
    version: 1,
    configuration: {
      general: { theme: 'light' },
      instanceConfiguration: {
        type,
        username: 'owner',
        features:
          postsFilters === undefined
            ? { likes: { enabled: true } }
            : { likes: { enabled: true }, postsFilters },
      },
    },
  };
}

describe('sanitizePostsFiltersFor', () => {
  it('drops community sorts from a blog instance', () => {
    expect(
      sanitizePostsFiltersFor('blog', ['posts', 'trending', 'hot', 'replies']),
    ).toEqual(['posts', 'replies']);
  });

  it('drops blog sorts from a community instance', () => {
    expect(
      sanitizePostsFiltersFor('community', ['blog', 'trending', 'replies']),
    ).toEqual(['trending']);
  });

  it('falls back to the defaults when nothing valid is left', () => {
    // An instance with no usable filter has no feed at all, and
    // resolvePostsFilter would clamp every request to the broken first entry.
    expect(sanitizePostsFiltersFor('blog', ['trending', 'hot', 'new'])).toEqual(
      defaultPostsFiltersFor('blog'),
    );
    expect(sanitizePostsFiltersFor('community', 'trending')).toEqual(
      defaultPostsFiltersFor('community'),
    );
  });

  it('only offers sorts the feed APIs accept', () => {
    // bridge.get_account_posts has no 'new'; bridge.get_ranked_posts has no
    // 'blog'. The editor used to auto-fill ['trending','hot','new'].
    expect(defaultPostsFiltersFor('community')).not.toContain('new');
    for (const filter of defaultPostsFiltersFor('community')) {
      expect(sanitizePostsFiltersFor('community', [filter])).toEqual([filter]);
    }
    for (const filter of defaultPostsFiltersFor('blog')) {
      expect(sanitizePostsFiltersFor('blog', [filter])).toEqual([filter]);
    }
  });
});

describe('withPinnedInstanceType', () => {
  it('pins the type back and repairs the filters the editor auto-filled', () => {
    const document = makeDocument('community', ['trending', 'hot', 'new']);

    const pinned = withPinnedInstanceType(document, 'blog');

    expect(pinned.configuration.instanceConfiguration.type).toBe('blog');
    expect(
      pinned.configuration.instanceConfiguration.features.postsFilters,
    ).toEqual(defaultPostsFiltersFor('blog'));
  });

  it('keeps the filters that the pinned type can fetch', () => {
    const pinned = withPinnedInstanceType(
      makeDocument('community', ['posts', 'trending', 'comments']),
      'blog',
    );

    expect(
      pinned.configuration.instanceConfiguration.features.postsFilters,
    ).toEqual(['posts', 'comments']);
  });

  it('leaves an already consistent document untouched', () => {
    const document = makeDocument('blog', ['posts', 'replies']);

    expect(withPinnedInstanceType(document, 'blog')).toBe(document);
  });

  it('does not invent filters a document does not carry', () => {
    const pinned = withPinnedInstanceType(makeDocument('community'), 'blog');

    expect(pinned.configuration.instanceConfiguration.type).toBe('blog');
    expect(
      pinned.configuration.instanceConfiguration.features,
    ).not.toHaveProperty('postsFilters');
  });

  it('does not mutate the document it is given', () => {
    const document = makeDocument('community', ['trending']);

    withPinnedInstanceType(document, 'blog');

    expect(document.configuration.instanceConfiguration.type).toBe('community');
    expect(
      document.configuration.instanceConfiguration.features.postsFilters,
    ).toEqual(['trending']);
  });

  it('returns a document it cannot understand unchanged', () => {
    const document = { version: 1 };
    expect(withPinnedInstanceType(document, 'blog')).toBe(document);
  });
});

describe('toInstanceType', () => {
  it('treats anything but community as a blog', () => {
    expect(toInstanceType('community')).toBe('community');
    expect(toInstanceType('blog')).toBe('blog');
    expect(toInstanceType(undefined)).toBe('blog');
    expect(toInstanceType('Community')).toBe('blog');
  });
});
