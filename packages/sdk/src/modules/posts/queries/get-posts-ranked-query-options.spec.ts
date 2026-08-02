import { describe, expect, it, vi } from 'vitest';
import type { Entry } from '../types';
import { getPostsRankedInfiniteQueryOptions } from './get-posts-ranked-query-options';

vi.mock('../../core', async (importOriginal) => ({
  ...((await importOriginal()) as Record<string, unknown>),
}));

function entry(author: string, permlink: string): Entry {
  return { author, permlink, created: '2026-01-01T00:00:00' } as Entry;
}

/**
 * React Query reads "there is no next page" from undefined alone. Returning an
 * object unconditionally left hasNextPage true forever, so an infinite list
 * kept calling fetchNextPage at the end of the feed and appended an empty page
 * each time, churning query state and growing the cache while the reader sat at
 * the bottom.
 */
describe('ranked posts pagination', () => {
  const options = getPostsRankedInfiniteQueryOptions('trending', 'hive-125125');

  it('stops when a page comes back empty', () => {
    expect(options.getNextPageParam([], [[]], null as never, [])).toBeUndefined();
  });

  it('carries the last entry forward while pages still have posts', () => {
    const page = [entry('alice', 'first'), entry('bob', 'second')];

    expect(options.getNextPageParam(page, [page], null as never, [])).toEqual({
      author: 'bob',
      permlink: 'second',
      hasNextPage: true,
    });
  });
});
