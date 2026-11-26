import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getAccountPostsInfiniteQueryOptions, getAccountPostsQueryOptions } from './get-account-posts-query-options'

const mockGetAccountPosts = vi.hoisted(() => vi.fn());

vi.mock('@/modules/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/modules/core')>()
  return { ...actual }
})

vi.mock('@/modules/bridge', () => ({
  getAccountPosts: mockGetAccountPosts
}))

vi.mock('../utils/filter-dmca-entries', () => ({
  filterDmcaEntry: vi.fn((entries) => entries)
}))

function makeInfiniteContext(
  options: ReturnType<typeof getAccountPostsInfiniteQueryOptions>,
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

describe('getAccountPostsInfiniteQueryOptions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should return [] when pageParam.hasNextPage is false', async () => {
    const options = getAccountPostsInfiniteQueryOptions('testuser')
    const result = await (options.queryFn as any)(makeInfiniteContext(options, { hasNextPage: false }))
    expect(result).toEqual([])
    expect(mockGetAccountPosts).not.toHaveBeenCalled()
  })

  it('should return [] when username is undefined', async () => {
    const options = getAccountPostsInfiniteQueryOptions(undefined)
    const result = await (options.queryFn as any)(makeInfiniteContext(options, { hasNextPage: true }))
    expect(result).toEqual([])
  })

  it('should call getAccountPosts and return filtered results', async () => {
    const mockEntries = [
      { author: 'testuser', permlink: 'post-1' },
      { author: 'testuser', permlink: 'post-2' }
    ]
    mockGetAccountPosts.mockResolvedValue(mockEntries)

    const options = getAccountPostsInfiniteQueryOptions('testuser', 'posts', 20, 'obs')
    const result = await (options.queryFn as any)(makeInfiniteContext(options, { hasNextPage: true }))

    expect(mockGetAccountPosts).toHaveBeenCalledWith('posts', 'testuser', '', '', 20, 'obs', expect.any(Object))
    expect(result).toEqual(mockEntries)
  })

  it('should return [] when getAccountPosts returns null', async () => {
    mockGetAccountPosts.mockResolvedValue(null)

    const options = getAccountPostsInfiniteQueryOptions('testuser')
    const result = await (options.queryFn as any)(makeInfiniteContext(options, { hasNextPage: true }))

    expect(result).toEqual([])
  })

  it('should propagate errors from getAccountPosts', async () => {
    mockGetAccountPosts.mockRejectedValue(new Error('RPC timeout'))

    const options = getAccountPostsInfiniteQueryOptions('testuser')
    await expect(
      (options.queryFn as any)(makeInfiniteContext(options, { hasNextPage: true }))
    ).rejects.toThrow('RPC timeout')
  })

  it('should pass pagination params from pageParam', async () => {
    mockGetAccountPosts.mockResolvedValue([])

    const options = getAccountPostsInfiniteQueryOptions('testuser', 'blog', 10, 'obs')
    await (options.queryFn as any)(makeInfiniteContext(options, {
      author: 'prev-author',
      permlink: 'prev-permlink',
      hasNextPage: true
    }))

    expect(mockGetAccountPosts).toHaveBeenCalledWith('blog', 'testuser', 'prev-author', 'prev-permlink', 10, 'obs', expect.any(Object))
  })

  it('should be disabled when username is undefined', () => {
    const options = getAccountPostsInfiniteQueryOptions(undefined)
    expect(options.enabled).toBe(false)
  })

  it('should be enabled when username is provided', () => {
    const options = getAccountPostsInfiniteQueryOptions('testuser')
    expect(options.enabled).toBe(true)
  })
})

describe('getAccountPostsQueryOptions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should return [] when username is undefined', async () => {
    const options = getAccountPostsQueryOptions(undefined)
    const result = await (options.queryFn as any)()
    expect(result).toEqual([])
    expect(mockGetAccountPosts).not.toHaveBeenCalled()
  })

  it('should call getAccountPosts and return filtered results', async () => {
    const mockEntries = [{ author: 'user', permlink: 'p1' }]
    mockGetAccountPosts.mockResolvedValue(mockEntries)

    const options = getAccountPostsQueryOptions('user', 'posts', 'sa', 'sp', 20, 'obs')
    const result = await (options.queryFn as any)()

    expect(mockGetAccountPosts).toHaveBeenCalledWith('posts', 'user', 'sa', 'sp', 20, 'obs', undefined)
    expect(result).toEqual(mockEntries)
  })

  it('should return [] when getAccountPosts returns null', async () => {
    mockGetAccountPosts.mockResolvedValue(null)

    const options = getAccountPostsQueryOptions('user')
    const result = await (options.queryFn as any)()

    expect(result).toEqual([])
  })
})
