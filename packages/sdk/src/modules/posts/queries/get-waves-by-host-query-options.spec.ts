import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getWavesByHostQueryOptions } from './get-waves-by-host-query-options'

const mockCallRPC = vi.hoisted(() => vi.fn())
const mockGetVisibleFirstLevelThreadItems = vi.hoisted(() => vi.fn())
const mockMapThreadItemsToWaveEntries = vi.hoisted(() => vi.fn())

// Only callRPC needs stubbing; @/modules/core (QueryKeys) is used as-is. The
// hive-tx subpath mock below is intercepted even when imported via the core barrel.
vi.mock('@/modules/core/hive-tx', () => ({
  callRPC: mockCallRPC,
  callRPCWithFallback: vi.fn(async (primary: { method: string; params: unknown }) => ({ result: await mockCallRPC(primary.method, primary.params), method: primary.method })),
}))

vi.mock('../utils/waves-helpers', () => ({
  getVisibleFirstLevelThreadItems: mockGetVisibleFirstLevelThreadItems,
  mapThreadItemsToWaveEntries: mockMapThreadItemsToWaveEntries
}))

const HOST = 'ecency.waves'

function makeContainer(permlink: string, postId: number) {
  return { author: HOST, permlink, post_id: postId, stats: { gray: false } }
}

// Drive the first page of the infinite query (pageParam === undefined).
function loadFirstPage(host = HOST) {
  const options = getWavesByHostQueryOptions(host)
  type QueryFn = NonNullable<typeof options.queryFn>
  return (options.queryFn as QueryFn)({ pageParam: undefined } as Parameters<QueryFn>[0])
}

describe('getWavesByHostQueryOptions getThreads', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns the first non-gray container\'s waves on the happy path', async () => {
    const container = makeContainer('c-a', 1)
    const waves = [{ author: 'bob', permlink: 'w1', container }]
    mockCallRPC.mockResolvedValue([container])
    mockGetVisibleFirstLevelThreadItems.mockResolvedValue([{ author: 'bob', permlink: 'w1' }])
    mockMapThreadItemsToWaveEntries.mockReturnValue(waves)

    await expect(loadFirstPage()).resolves.toEqual(waves)
    expect(mockGetVisibleFirstLevelThreadItems).toHaveBeenCalledTimes(1)
  })

  // Regression: a transient bridge.get_discussion failure on ONE container
  // (RPC timeout / node error / oversized late-day container) must not collapse
  // the whole "For you" feed into the "Nothing here" empty/error state. The
  // scan should skip that container and surface the next one's waves instead.
  it('skips a container whose get_discussion throws and returns the next container\'s waves', async () => {
    const containerA = makeContainer('c-a', 1)
    const containerB = makeContainer('c-b', 2)
    const waves = [{ author: 'bob', permlink: 'w1', container: containerB }]
    mockCallRPC.mockResolvedValue([containerA, containerB])
    mockGetVisibleFirstLevelThreadItems
      .mockRejectedValueOnce(new Error('RPC timeout')) // containerA get_discussion fails
      .mockResolvedValueOnce([{ author: 'bob', permlink: 'w1' }]) // containerB succeeds
    mockMapThreadItemsToWaveEntries.mockReturnValue(waves)

    await expect(loadFirstPage()).resolves.toEqual(waves)
    expect(mockGetVisibleFirstLevelThreadItems).toHaveBeenCalledTimes(2)
    expect(mockMapThreadItemsToWaveEntries).toHaveBeenCalledWith(
      [{ author: 'bob', permlink: 'w1' }],
      // A normalized copy of containerB (the response is no longer mutated in place).
      expect.objectContaining({ ...containerB, host: HOST, id: 2 }),
      HOST
    )
  })

  // When the failure is broad (every container's get_discussion fails and no
  // further containers remain) the feed degrades to an empty page rather than
  // a rejected query. Distinguishing a transient total outage from a genuinely
  // empty feed is the consumer UI's job (error/retry affordance), not getThreads'.
  it('resolves to [] (does not throw) when every container\'s get_discussion fails', async () => {
    const containerA = makeContainer('c-a', 1)
    mockCallRPC
      .mockResolvedValueOnce([containerA]) // first scan round
      .mockResolvedValueOnce([]) // next round: no more containers
    mockGetVisibleFirstLevelThreadItems.mockRejectedValue(new Error('RPC timeout'))

    await expect(loadFirstPage()).resolves.toEqual([])
  })

  it('returns [] (does not throw) when get_account_posts itself fails', async () => {
    mockCallRPC.mockRejectedValue(new Error('RPC timeout'))

    await expect(loadFirstPage()).resolves.toEqual([])
    expect(mockGetVisibleFirstLevelThreadItems).not.toHaveBeenCalled()
  })
})
