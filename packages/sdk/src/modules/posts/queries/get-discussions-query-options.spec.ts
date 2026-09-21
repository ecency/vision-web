import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { getDiscussionsQueryOptions, sortDiscussions, SortOrder } from './get-discussions-query-options'
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


/**
 * The pinned reply is hoisted to the top of the thread, and which reply is
 * pinned is read out of the ROOT's json_metadata. That value is an object when
 * the root came from `bridge.*` and a raw string when it came from
 * `condenser_api.get_content`, which is how the decks columns fetch.
 */
describe('sortDiscussions pinned reply', () => {
  const reply = (author: string, permlink: string, created: string) =>
    ({
      author,
      permlink,
      created,
      children: 0,
      net_rshares: 0,
      author_reputation: 50,
      pending_payout_value: '0.000 HBD',
      author_payout_value: '0.000 HBD',
      curator_payout_value: '0.000 HBD',
    }) as unknown as Entry

  const replies = () => [
    reply('carol', 'newest', '2026-09-20T10:00:00'),
    reply('bob', 'the-pinned-one', '2026-09-18T10:00:00'),
    reply('dave', 'oldest', '2026-09-17T10:00:00'),
  ]

  it('hoists the pinned reply when the root carries parsed metadata', () => {
    const root = {
      author: 'alice',
      permlink: 'a-post',
      json_metadata: { pinned_reply: 'bob/the-pinned-one' },
    } as unknown as Entry

    const sorted = sortDiscussions(root, replies(), SortOrder.created)

    expect(sorted[0].permlink).toBe('the-pinned-one')
  })

  it('hoists it just the same when the root carries metadata as a string', () => {
    const root = {
      author: 'alice',
      permlink: 'a-post',
      json_metadata: '{"pinned_reply":"bob/the-pinned-one"}',
    } as unknown as Entry

    const sorted = sortDiscussions(root, replies(), SortOrder.created)

    expect(sorted[0].permlink).toBe('the-pinned-one')
  })

  it('leaves the order alone when the root has no readable metadata', () => {
    const root = {
      author: 'alice',
      permlink: 'a-post',
      json_metadata: 'not json at all',
    } as unknown as Entry

    const sorted = sortDiscussions(root, replies(), SortOrder.created)

    expect(sorted.map((i) => i.permlink)).toEqual(['newest', 'the-pinned-one', 'oldest'])
  })
})
