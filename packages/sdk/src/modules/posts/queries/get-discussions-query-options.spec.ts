import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { getDiscussionsQueryOptions, SortOrder } from './get-discussions-query-options'
import { CONFIG } from '@/modules/core'
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

    await (options.queryFn as any)()

    expect(mockCallRPC).toHaveBeenCalledWith('bridge.get_discussion', {
      author: 'alice',
      permlink: 'a-post',
      observer: 'ecency',
    })
  })

  it('prefers an explicit observer over the default', async () => {
    const options = getDiscussionsQueryOptions(entry, SortOrder.created, true, 'bob')

    await (options.queryFn as any)()

    expect(mockCallRPC).toHaveBeenCalledWith(
      'bridge.get_discussion',
      expect.objectContaining({ observer: 'bob' })
    )
  })

  it('honours a host that overrides the default observer', async () => {
    CONFIG.defaultObserver = 'someotherapp'

    const options = getDiscussionsQueryOptions(entry, SortOrder.created)

    await (options.queryFn as any)()

    expect(mockCallRPC).toHaveBeenCalledWith(
      'bridge.get_discussion',
      expect.objectContaining({ observer: 'someotherapp' })
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
