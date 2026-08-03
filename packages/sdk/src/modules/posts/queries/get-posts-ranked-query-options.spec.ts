import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getPostsRankedInfiniteQueryOptions, getPostsRankedQueryOptions } from './get-posts-ranked-query-options'

const mockCallRPC = vi.hoisted(() => vi.fn());
const mockGetPostsRanked = vi.hoisted(() => vi.fn());

vi.mock('@/modules/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/modules/core')>()
  return {
    ...actual,
    CONFIG: {
      ...actual.CONFIG,
      dmcaTagRegexes: []
    }
  }
})

vi.mock('@/modules/core/hive-tx', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/modules/core/hive-tx')>()
  return {
    ...actual,
    callRPC: mockCallRPC,
  }
})

vi.mock('@/modules/bridge', () => ({
  getPostsRanked: mockGetPostsRanked
}))

vi.mock('../utils/filter-dmca-entries', () => ({
  filterDmcaEntry: vi.fn((entries) => entries)
}))

function makeInfiniteContext(
  options: ReturnType<typeof getPostsRankedInfiniteQueryOptions>,
  pageParam: { author?: string; permlink?: string; hasNextPage: boolean }
) {
  return {
    pageParam: { author: undefined, permlink: undefined, ...pageParam },
    meta: undefined as any,
    direction: 'forward' as const,
    queryKey: options.queryKey,
    signal: new AbortController().signal
  }
}

describe('getPostsRankedInfiniteQueryOptions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should return [] when pageParam.hasNextPage is false', async () => {
    const options = getPostsRankedInfiniteQueryOptions('created', 'hive')
    const result = await (options.queryFn as any)(makeInfiniteContext(options, { hasNextPage: false }))
    expect(result).toEqual([])
  })

  it('should return [] when RPC returns null', async () => {
    mockCallRPC.mockResolvedValue(null)

    const options = getPostsRankedInfiniteQueryOptions('created', 'hive')
    const result = await (options.queryFn as any)(makeInfiniteContext(options, { hasNextPage: true }))

    expect(result).toEqual([])
  })

  it('should throw when RPC returns non-null non-array', async () => {
    mockCallRPC.mockResolvedValue('unexpected')

    const options = getPostsRankedInfiniteQueryOptions('created', 'hive')
    await expect(
      (options.queryFn as any)(makeInfiniteContext(options, { hasNextPage: true }))
    ).rejects.toThrow('[SDK] get_ranked_posts returned string')
  })

  it('should sort entries by created desc and place pinned first', async () => {
    // Entries intentionally unsorted: oldest first, newest last, pinned in the middle
    const mockEntries = [
      { author: 'c', permlink: 'oldest', created: '2026-01-01T00:00:00', stats: null },
      { author: 'b', permlink: 'pinned', created: '2026-01-02T00:00:00', stats: { is_pinned: true } },
      { author: 'a', permlink: 'newest', created: '2026-01-03T00:00:00', stats: null }
    ]
    mockCallRPC.mockResolvedValue(mockEntries)

    const options = getPostsRankedInfiniteQueryOptions('created', 'hive')
    const result = await (options.queryFn as any)(makeInfiniteContext(options, { hasNextPage: true }))

    expect(result).toHaveLength(3)
    // Pinned entry should be first regardless of date
    expect(result[0].permlink).toBe('pinned')
    // Remaining sorted by created desc
    expect(result[1].permlink).toBe('newest')
    expect(result[2].permlink).toBe('oldest')
  })

  it('keeps EVERY pinned entry, in bridge (head-of-response) order', async () => {
    // Bridge shape for a multi-pin community created feed: pins at the head in
    // the moderators' chosen order (NOT date order), then non-pins created desc.
    // Regression: a post-sort find() used to keep one pin and drop the rest.
    const mockEntries = [
      { author: 'mod', permlink: 'pin-a', created: '2025-03-01T00:00:00', stats: { is_pinned: true } },
      { author: 'mod', permlink: 'pin-b', created: '2025-06-01T00:00:00', stats: { is_pinned: true } },
      { author: 'mod', permlink: 'pin-c', created: '2024-12-01T00:00:00', stats: { is_pinned: true } },
      { author: 'x', permlink: 'newest', created: '2026-01-03T00:00:00', stats: null },
      { author: 'y', permlink: 'oldest', created: '2026-01-01T00:00:00', stats: null }
    ]
    mockCallRPC.mockResolvedValue(mockEntries)

    const options = getPostsRankedInfiniteQueryOptions('created', 'hive-125125')
    const result = await (options.queryFn as any)(makeInfiniteContext(options, { hasNextPage: true }))

    expect(result).toHaveLength(5) // nothing dropped
    // All pins first, preserving the bridge's pin order (not re-sorted by date)
    expect(result.slice(0, 3).map((e: any) => e.permlink)).toEqual(['pin-a', 'pin-b', 'pin-c'])
    // Non-pins follow, created desc
    expect(result[3].permlink).toBe('newest')
    expect(result[4].permlink).toBe('oldest')
  })

  it('should not re-sort when sort is "hot"', async () => {
    const mockEntries = [
      { author: 'a', permlink: 'p1', created: '2026-01-01T00:00:00', stats: null },
      { author: 'b', permlink: 'p2', created: '2026-01-03T00:00:00', stats: null }
    ]
    mockCallRPC.mockResolvedValue(mockEntries)

    const options = getPostsRankedInfiniteQueryOptions('hot', 'hive')
    const result = await (options.queryFn as any)(makeInfiniteContext(options, { hasNextPage: true }))

    // "hot" preserves original order
    expect(result[0].permlink).toBe('p1')
    expect(result[1].permlink).toBe('p2')
  })

  it('should propagate network errors', async () => {
    mockCallRPC.mockRejectedValue(new Error('network'))

    const options = getPostsRankedInfiniteQueryOptions('created', 'hive')
    await expect(
      (options.queryFn as any)(makeInfiniteContext(options, { hasNextPage: true }))
    ).rejects.toThrow('network')
  })
})

describe('getPostsRankedQueryOptions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should call getPostsRanked and return filtered results', async () => {
    const mockEntries = [{ author: 'a', permlink: 'p1' }]
    mockGetPostsRanked.mockResolvedValue(mockEntries)

    const options = getPostsRankedQueryOptions('created', '', '', 20, 'hive', 'obs')
    const result = await (options.queryFn as any)()

    expect(mockGetPostsRanked).toHaveBeenCalledWith('created', '', '', 20, 'hive', 'obs', undefined)
    expect(result).toEqual(mockEntries)
  })

  it('should return [] when getPostsRanked returns null', async () => {
    mockGetPostsRanked.mockResolvedValue(null)

    const options = getPostsRankedQueryOptions('created')
    const result = await (options.queryFn as any)()

    expect(result).toEqual([])
  })

  it('should propagate errors from getPostsRanked', async () => {
    mockGetPostsRanked.mockRejectedValue(new Error('timeout'))

    const options = getPostsRankedQueryOptions('created')
    await expect((options.queryFn as any)()).rejects.toThrow('timeout')
  })

  /**
   * React Query reads "there is no next page" from undefined alone. Returning an
   * object unconditionally left hasNextPage true forever, so an infinite list
   * kept calling fetchNextPage at the end of the feed and appended an empty page
   * each time, churning query state and growing the cache while the reader sat
   * at the bottom.
   */
  describe('pagination termination', () => {
    it('stops when a page comes back empty', () => {
      const options = getPostsRankedInfiniteQueryOptions('trending', 'hive-125125')

      expect(
        options.getNextPageParam([], [[]], null as never, [])
      ).toBeUndefined()
    })

    it('carries the last entry forward while pages still have posts', () => {
      const options = getPostsRankedInfiniteQueryOptions('trending', 'hive-125125')
      const page = [
        { author: 'alice', permlink: 'first', created: '2026-01-02T00:00:00' },
        { author: 'bob', permlink: 'second', created: '2026-01-01T00:00:00' },
      ] as never

      expect(options.getNextPageParam(page, [page], null as never, [])).toEqual({
        author: 'bob',
        permlink: 'second',
        hasNextPage: true,
      })
    })
  })
})
