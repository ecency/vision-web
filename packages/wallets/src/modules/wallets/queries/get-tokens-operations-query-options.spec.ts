import { describe, it, expect, vi, beforeEach } from 'vitest'

const fetchQuery = vi.fn()

// AssetOperation is re-exported from the SDK, so keep the real module and stub
// only the two portfolio helpers the query calls.
vi.mock('@ecency/sdk', async () => ({
  ...(await vi.importActual<typeof import('@ecency/sdk')>('@ecency/sdk')),
  getQueryClient: () => ({ fetchQuery }),
  getPortfolioQueryOptions: (username: string, currency: string) => ({
    queryKey: ['portfolio', username, currency],
  }),
}))

import { AssetOperation } from '@/modules/assets'
import { getTokenOperationsQueryOptions } from './get-tokens-operations-query-options'

async function resolveOperations(
  actions: Array<{ id: string }>,
  symbol = 'HP',
  extra: Record<string, unknown> = {},
) {
  fetchQuery.mockResolvedValue({
    username: 'foo',
    wallets: [{ symbol, actions, ...extra }],
  })

  const options = getTokenOperationsQueryOptions(symbol, 'foo', true)
  return (options.queryFn as () => Promise<AssetOperation[]>)()
}

describe('getTokenOperationsQueryOptions', () => {
  beforeEach(() => {
    fetchQuery.mockReset()
  })

  it('maps the set_withdraw_vesting_route chain op to WithdrawRoutes', async () => {
    const operations = await resolveOperations([{ id: 'set_withdraw_vesting_route' }])
    expect(operations).toEqual([AssetOperation.WithdrawRoutes])
  })

  it('still maps the legacy withdraw-routes slug spellings', async () => {
    await expect(resolveOperations([{ id: 'withdraw-routes' }])).resolves.toEqual([
      AssetOperation.WithdrawRoutes,
    ])
    await expect(resolveOperations([{ id: 'withdrawroutes' }])).resolves.toEqual([
      AssetOperation.WithdrawRoutes,
    ])
  })

  it('maps the full HP action list without dropping the other entries', async () => {
    const operations = await resolveOperations([
      { id: 'delegate_vesting_shares' },
      { id: 'withdraw_vesting' },
      { id: 'set_withdraw_vesting_route' },
    ])

    expect(operations).toEqual([
      AssetOperation.Delegate,
      AssetOperation.PowerDown,
      AssetOperation.WithdrawRoutes,
    ])
  })

  it('drops action ids it does not recognise', async () => {
    const operations = await resolveOperations([
      { id: 'some_future_operation' },
      { id: 'withdraw_vesting' },
    ])

    expect(operations).toEqual([AssetOperation.PowerDown])
  })

  it('returns nothing when the wallet is not owned by the viewer', async () => {
    fetchQuery.mockResolvedValue({
      username: 'foo',
      wallets: [{ symbol: 'HP', actions: [{ id: 'set_withdraw_vesting_route' }] }],
    })

    const options = getTokenOperationsQueryOptions('HP', 'foo', false)
    const operations = await (options.queryFn as () => Promise<AssetOperation[]>)()

    expect(operations).toEqual([])
    expect(fetchQuery).not.toHaveBeenCalled()
  })
})
