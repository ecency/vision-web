import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getMutedUsersQueryOptions } from './get-muted-users-query-options'

const mockCallRPC = vi.hoisted(() => vi.fn())

vi.mock('@/modules/core/hive-tx', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/modules/core/hive-tx')>()
  return {
    ...actual,
    callRPC: mockCallRPC,
  }
})

const PAGE_SIZE = 1000

const rows = (names: string[]) => names.map((following) => ({ following }))
const names = (count: number, prefix: string) =>
  Array.from({ length: count }, (_, i) => `${prefix}${i}`)

function runQueryFn<T extends { queryFn?: unknown }>(options: T) {
  const queryFn = options.queryFn as (context: Record<string, never>) => Promise<string[]>
  return queryFn({})
}

describe('getMutedUsersQueryOptions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns a short list in a single request', async () => {
    mockCallRPC.mockResolvedValueOnce(rows(['spammer', 'bot']))

    await expect(runQueryFn(getMutedUsersQueryOptions('alice'))).resolves.toEqual([
      'spammer',
      'bot',
    ])
    expect(mockCallRPC).toHaveBeenCalledTimes(1)
    expect(mockCallRPC).toHaveBeenCalledWith('condenser_api.get_following', [
      'alice',
      '',
      'ignore',
      PAGE_SIZE,
    ])
  })

  // The bug this guards: the query used to take the first 100 only, so a user
  // with a longer mute list saw muted authors rendered as if never muted.
  it('pages past the first response until the list is exhausted', async () => {
    const first = names(PAGE_SIZE, 'a')
    const second = names(PAGE_SIZE, 'b')
    const third = names(12, 'c')

    mockCallRPC
      .mockResolvedValueOnce(rows(first))
      .mockResolvedValueOnce(rows(second))
      .mockResolvedValueOnce(rows(third))

    const result = await runQueryFn(getMutedUsersQueryOptions('alice'))

    expect(result).toHaveLength(PAGE_SIZE * 2 + 12)
    expect(result).toEqual([...first, ...second, ...third])
    expect(mockCallRPC).toHaveBeenCalledTimes(3)
  })

  it('advances the cursor to the last account of the previous page', async () => {
    mockCallRPC
      .mockResolvedValueOnce(rows(names(PAGE_SIZE, 'a')))
      .mockResolvedValueOnce(rows(['zed']))

    await runQueryFn(getMutedUsersQueryOptions('alice'))

    expect(mockCallRPC).toHaveBeenNthCalledWith(2, 'condenser_api.get_following', [
      'alice',
      `a${PAGE_SIZE - 1}`,
      'ignore',
      PAGE_SIZE,
    ])
  })

  // Hive treats `start` as exclusive, so this should not happen. If a node ever
  // returned it inclusively the loop must still terminate rather than re-append
  // the cursor account until it hits the page cap.
  it('does not duplicate or loop when a node echoes the cursor row', async () => {
    const first = names(PAGE_SIZE, 'a')
    const cursor = first[first.length - 1]

    mockCallRPC
      .mockResolvedValueOnce(rows(first))
      .mockResolvedValueOnce(rows([cursor, 'newone']))

    const result = await runQueryFn(getMutedUsersQueryOptions('alice'))

    expect(result).toEqual([...first, 'newone'])
    expect(result.filter((name) => name === cursor)).toHaveLength(1)
    expect(mockCallRPC).toHaveBeenCalledTimes(2)
  })

  it('stops at the page cap when a node never advances the cursor', async () => {
    mockCallRPC.mockResolvedValue(rows(names(PAGE_SIZE, 'a')))

    const result = await runQueryFn(getMutedUsersQueryOptions('alice'))

    // 20 pages, not an endless loop.
    expect(mockCallRPC).toHaveBeenCalledTimes(20)
    expect(result.length).toBeLessThanOrEqual(PAGE_SIZE * 20)
  })

  it('handles an empty mute list', async () => {
    mockCallRPC.mockResolvedValueOnce([])

    await expect(runQueryFn(getMutedUsersQueryOptions('alice'))).resolves.toEqual([])
    expect(mockCallRPC).toHaveBeenCalledTimes(1)
  })

  it('stays disabled without a username', () => {
    expect(getMutedUsersQueryOptions(undefined).enabled).toBe(false)
    expect(getMutedUsersQueryOptions('alice').enabled).toBe(true)
  })
})
