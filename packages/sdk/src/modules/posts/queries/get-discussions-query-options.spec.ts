import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { getDiscussionsQueryOptions, SortOrder } from './get-discussions-query-options'
import { CONFIG, ConfigManager } from '@/modules/core'
import { Entry } from '../types'

const mockCallRPC = vi.hoisted(() => vi.fn())

vi.mock('@/modules/core/hive-tx', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/modules/core/hive-tx')>()
  return {
    ...actual,
    callRPC: mockCallRPC,
  }
})

vi.mock('../utils/filter-dmca-entries', () => ({
  filterDmcaEntry: vi.fn((entries) => entries),
}))

const entry = { author: 'alice', permlink: 'a-post' } as Entry

/**
 * Invoke a query option's `queryFn` without asserting the full React Query
 * context. These query functions ignore their argument, so an empty context is
 * enough and keeps the call typed.
 */
function runQueryFn<T extends { queryFn?: unknown }>(options: T) {
  const queryFn = options.queryFn as (context: Record<string, never>) => Promise<unknown>
  return queryFn({})
}

describe('getDiscussionsQueryOptions observer resolution', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCallRPC.mockResolvedValue({})
  })

  afterEach(() => {
    CONFIG.defaultObserver = 'ecency'
  })

  it('falls back to CONFIG.defaultObserver, not the post author, when logged out', async () => {
    const options = getDiscussionsQueryOptions(entry, SortOrder.created)

    await runQueryFn(options)

    expect(mockCallRPC).toHaveBeenCalledWith('bridge.get_discussion', {
      author: 'alice',
      permlink: 'a-post',
      observer: 'ecency',
    })
  })

  it('prefers an explicit observer over the default', async () => {
    const options = getDiscussionsQueryOptions(entry, SortOrder.created, true, 'bob')

    await runQueryFn(options)

    expect(mockCallRPC).toHaveBeenCalledWith(
      'bridge.get_discussion',
      expect.objectContaining({ observer: 'bob' })
    )
  })

  it('rejects an empty default observer instead of silently observing as the author', () => {
    expect(() => ConfigManager.setDefaultObserver('')).toThrow(/non-empty/)
    expect(() => ConfigManager.setDefaultObserver('   ')).toThrow(/non-empty/)
    expect(CONFIG.defaultObserver).toBe('ecency')
  })

  it('honours a host that overrides the default observer', async () => {
    ConfigManager.setDefaultObserver('someotherapp')

    const options = getDiscussionsQueryOptions(entry, SortOrder.created)

    await runQueryFn(options)

    expect(mockCallRPC).toHaveBeenCalledWith(
      'bridge.get_discussion',
      expect.objectContaining({ observer: 'someotherapp' })
    )
  })

  // Waves and decks write optimistic replies with setQueryData against a key
  // they rebuild themselves. They must omit the observer exactly as their
  // readers do, or the reply lands in a cache entry nothing is subscribed to
  // and does not appear until the next refetch.
  it('gives writers the same key as readers when neither passes an observer', () => {
    const readerKey = getDiscussionsQueryOptions(entry, SortOrder.created).queryKey
    const writerKey = getDiscussionsQueryOptions(entry, SortOrder.created).queryKey

    expect(writerKey).toEqual(readerKey)
    // The key carries the post author in its own slot, so compare against
    // fully-specified keys rather than searching for the name. Resolution must
    // land on the default, not on the author (the pre-change behaviour that
    // silently split writers from readers once the default stopped being the
    // author).
    expect(readerKey).toEqual(
      getDiscussionsQueryOptions(entry, SortOrder.created, true, 'ecency').queryKey
    )
    expect(readerKey).not.toEqual(
      getDiscussionsQueryOptions(entry, SortOrder.created, true, entry.author).queryKey
    )
  })

  it('keys the cache on the resolved observer so a login switches cache entries', () => {
    const anon = getDiscussionsQueryOptions(entry, SortOrder.created)
    const loggedIn = getDiscussionsQueryOptions(entry, SortOrder.created, true, 'bob')

    expect(anon.queryKey).not.toEqual(loggedIn.queryKey)
    expect(anon.queryKey).toContain('ecency')
    expect(loggedIn.queryKey).toContain('bob')
  })
})
