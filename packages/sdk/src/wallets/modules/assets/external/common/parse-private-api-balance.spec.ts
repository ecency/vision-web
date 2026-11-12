import { describe, it, expect } from 'vitest'
import { parsePrivateApiBalance, type PrivateApiBalanceResponse } from './parse-private-api-balance'

describe('parsePrivateApiBalance', () => {
  describe('valid responses', () => {
    it('should parse numeric balance correctly', () => {
      const response: PrivateApiBalanceResponse = {
        chain: 'BTC',
        balance: 100000000,
        unit: 'satoshi',
      }

      const result = parsePrivateApiBalance(response, 'BTC')
      expect(result).toEqual({
        chain: 'BTC',
        unit: 'satoshi',
        balanceBigInt: 100000000n,
        balanceString: '100000000',
        raw: undefined,
        nodeId: undefined,
      })
      expect(result).toMatchSnapshot()
    })

    it('should parse string balance correctly', () => {
      const response: PrivateApiBalanceResponse = {
        chain: 'ETH',
        balance: '1000000000000000000',
        unit: 'wei',
      }

      const result = parsePrivateApiBalance(response, 'ETH')
      expect(result).toEqual({
        chain: 'ETH',
        unit: 'wei',
        balanceBigInt: 1000000000000000000n,
        balanceString: '1000000000000000000',
        raw: undefined,
        nodeId: undefined,
      })
      expect(result).toMatchSnapshot()
    })

    it('should include raw data when provided', () => {
      const rawData = { blockHeight: 12345, timestamp: 1234567890 }
      const response: PrivateApiBalanceResponse = {
        chain: 'SOL',
        balance: 5000000000,
        unit: 'lamports',
        raw: rawData,
      }

      const result = parsePrivateApiBalance(response, 'SOL')
      expect(result.raw).toEqual(rawData)
      expect(result).toMatchSnapshot()
    })

    it('should include nodeId when provided', () => {
      const response: PrivateApiBalanceResponse = {
        chain: 'BTC',
        balance: 50000000,
        unit: 'satoshi',
        nodeId: 'node-123',
      }

      const result = parsePrivateApiBalance(response, 'BTC')
      expect(result.nodeId).toBe('node-123')
      expect(result).toMatchSnapshot()
    })

    it('should handle zero balance', () => {
      const response: PrivateApiBalanceResponse = {
        chain: 'ETH',
        balance: 0,
        unit: 'wei',
      }

      const result = parsePrivateApiBalance(response, 'ETH')
      expect(result.balanceBigInt).toBe(0n)
      expect(result.balanceString).toBe('0')
    })

    it('should handle very large balances', () => {
      const response: PrivateApiBalanceResponse = {
        chain: 'ETH',
        balance: '999999999999999999999',
        unit: 'wei',
      }

      const result = parsePrivateApiBalance(response, 'ETH')
      expect(result.balanceBigInt).toBe(999999999999999999999n)
      expect(result.balanceString).toBe('999999999999999999999')
    })

    it.each([
      ['BTC', 12345, 'satoshi'],
      ['ETH', '9876543210', 'wei'],
      ['SOL', 1000000, 'lamports'],
      ['BNB', '500000000000', 'wei'],
    ])('should parse %s with balance correctly', (chain, balance, unit) => {
      const response: PrivateApiBalanceResponse = {
        chain,
        balance,
        unit,
      }

      const result = parsePrivateApiBalance(response, chain)
      expect(result.chain).toBe(chain)
      expect(result.unit).toBe(unit)
      expect(typeof result.balanceBigInt).toBe('bigint')
    })
  })

  describe('error cases - invalid responses', () => {
    it('should throw when response is null', () => {
      expect(() => parsePrivateApiBalance(null as any, 'BTC')).toThrow(
        'Private API returned an unexpected response'
      )
    })

    it('should throw when response is not an object', () => {
      expect(() => parsePrivateApiBalance('invalid' as any, 'BTC')).toThrow(
        'Private API returned an unexpected response'
      )
    })

    it('should throw when chain mismatch', () => {
      const response: PrivateApiBalanceResponse = {
        chain: 'ETH',
        balance: 1000,
        unit: 'wei',
      }

      expect(() => parsePrivateApiBalance(response, 'BTC')).toThrow(
        'Private API response chain did not match request'
      )
    })

    it('should throw when chain is missing', () => {
      const response = {
        balance: 1000,
        unit: 'satoshi',
      } as any

      expect(() => parsePrivateApiBalance(response, 'BTC')).toThrow(
        'Private API response chain did not match request'
      )
    })

    it('should throw when unit is missing', () => {
      const response = {
        chain: 'BTC',
        balance: 1000,
      } as any

      expect(() => parsePrivateApiBalance(response, 'BTC')).toThrow(
        'Private API response is missing unit information'
      )
    })

    it('should throw when unit is empty string', () => {
      const response: PrivateApiBalanceResponse = {
        chain: 'BTC',
        balance: 1000,
        unit: '',
      }

      expect(() => parsePrivateApiBalance(response, 'BTC')).toThrow(
        'Private API response is missing unit information'
      )
    })

    it('should throw when balance is undefined', () => {
      const response = {
        chain: 'BTC',
        unit: 'satoshi',
      } as any

      expect(() => parsePrivateApiBalance(response, 'BTC')).toThrow(
        'Private API response is missing balance information'
      )
    })

    it('should throw when balance is null', () => {
      const response: PrivateApiBalanceResponse = {
        chain: 'BTC',
        balance: null as any,
        unit: 'satoshi',
      }

      expect(() => parsePrivateApiBalance(response, 'BTC')).toThrow(
        'Private API response is missing balance information'
      )
    })
  })

  describe('error cases - invalid balance values', () => {
    it('should throw when numeric balance is NaN', () => {
      const response: PrivateApiBalanceResponse = {
        chain: 'BTC',
        balance: NaN,
        unit: 'satoshi',
      }

      expect(() => parsePrivateApiBalance(response, 'BTC')).toThrow(
        'Private API returned a non-finite numeric balance'
      )
    })

    it('should throw when numeric balance is Infinity', () => {
      const response: PrivateApiBalanceResponse = {
        chain: 'BTC',
        balance: Infinity,
        unit: 'satoshi',
      }

      expect(() => parsePrivateApiBalance(response, 'BTC')).toThrow(
        'Private API returned a non-finite numeric balance'
      )
    })

    it('should throw when numeric balance is -Infinity', () => {
      const response: PrivateApiBalanceResponse = {
        chain: 'BTC',
        balance: -Infinity,
        unit: 'satoshi',
      }

      expect(() => parsePrivateApiBalance(response, 'BTC')).toThrow(
        'Private API returned a non-finite numeric balance'
      )
    })

    it('should throw when string balance is empty', () => {
      const response: PrivateApiBalanceResponse = {
        chain: 'ETH',
        balance: '',
        unit: 'wei',
      }

      expect(() => parsePrivateApiBalance(response, 'ETH')).toThrow(
        'Private API returned an empty balance string'
      )
    })

    it('should throw when string balance is whitespace only', () => {
      const response: PrivateApiBalanceResponse = {
        chain: 'ETH',
        balance: '   ',
        unit: 'wei',
      }

      expect(() => parsePrivateApiBalance(response, 'ETH')).toThrow(
        'Private API returned an empty balance string'
      )
    })

    it('should throw when string balance is not a valid integer', () => {
      const response: PrivateApiBalanceResponse = {
        chain: 'ETH',
        balance: '123.456',
        unit: 'wei',
      }

      expect(() => parsePrivateApiBalance(response, 'ETH')).toThrow(
        'Private API returned a balance that is not an integer'
      )
    })

    it('should throw when string balance contains non-numeric characters', () => {
      const response: PrivateApiBalanceResponse = {
        chain: 'ETH',
        balance: '123abc',
        unit: 'wei',
      }

      expect(() => parsePrivateApiBalance(response, 'ETH')).toThrow(
        'Private API returned a balance that is not an integer'
      )
    })

    it('should throw when balance is unexpected type', () => {
      const response: PrivateApiBalanceResponse = {
        chain: 'BTC',
        balance: [] as any,
        unit: 'satoshi',
      }

      expect(() => parsePrivateApiBalance(response, 'BTC')).toThrow(
        'Private API returned balance in an unexpected format'
      )
    })
  })

  describe('edge cases with numeric balance', () => {
    it('should truncate decimal numeric balance', () => {
      const response: PrivateApiBalanceResponse = {
        chain: 'BTC',
        balance: 123.789,
        unit: 'satoshi',
      }

      const result = parsePrivateApiBalance(response, 'BTC')
      expect(result.balanceString).toBe('123')
      expect(result.balanceBigInt).toBe(123n)
    })

    it('should handle negative numeric balance', () => {
      const response: PrivateApiBalanceResponse = {
        chain: 'BTC',
        balance: -500,
        unit: 'satoshi',
      }

      const result = parsePrivateApiBalance(response, 'BTC')
      expect(result.balanceString).toBe('-500')
      expect(result.balanceBigInt).toBe(-500n)
    })
  })

  describe('nodeId handling', () => {
    it('should exclude nodeId when empty string', () => {
      const response: PrivateApiBalanceResponse = {
        chain: 'BTC',
        balance: 1000,
        unit: 'satoshi',
        nodeId: '',
      }

      const result = parsePrivateApiBalance(response, 'BTC')
      expect(result.nodeId).toBeUndefined()
    })

    it('should exclude nodeId when not a string', () => {
      const response: PrivateApiBalanceResponse = {
        chain: 'BTC',
        balance: 1000,
        unit: 'satoshi',
        nodeId: 123 as any,
      }

      const result = parsePrivateApiBalance(response, 'BTC')
      expect(result.nodeId).toBeUndefined()
    })

    it('should include valid nodeId', () => {
      const response: PrivateApiBalanceResponse = {
        chain: 'BTC',
        balance: 1000,
        unit: 'satoshi',
        nodeId: 'valid-node-id',
      }

      const result = parsePrivateApiBalance(response, 'BTC')
      expect(result.nodeId).toBe('valid-node-id')
    })
  })

  describe('complete scenarios', () => {
    it('should match snapshot for Bitcoin balance', () => {
      const response: PrivateApiBalanceResponse = {
        chain: 'BTC',
        balance: 50000000,
        unit: 'satoshi',
        nodeId: 'btc-mainnet-1',
      }

      const result = parsePrivateApiBalance(response, 'BTC')
      expect(result).toMatchSnapshot()
    })

    it('should match snapshot for Ethereum balance with raw data', () => {
      const response: PrivateApiBalanceResponse = {
        chain: 'ETH',
        balance: '1500000000000000000',
        unit: 'wei',
        raw: {
          blockNumber: 18000000,
          gasPrice: '20000000000',
        },
        nodeId: 'eth-mainnet-2',
      }

      const result = parsePrivateApiBalance(response, 'ETH')
      expect(result).toMatchSnapshot()
    })
  })
})
