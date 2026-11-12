import { describe, it, expect } from 'vitest'
import { parseAsset, Symbol, NaiMap } from '.'

describe('parseAsset', () => {
  describe('string input', () => {
    it('should parse HIVE asset string correctly', () => {
      const result = parseAsset('123.456 HIVE')
      expect(result).toEqual({
        amount: 123.456,
        symbol: Symbol.HIVE,
      })
      expect(result).toMatchSnapshot()
    })

    it('should parse HBD asset string correctly', () => {
      const result = parseAsset('50.123 HBD')
      expect(result).toEqual({
        amount: 50.123,
        symbol: Symbol.HBD,
      })
      expect(result).toMatchSnapshot()
    })

    it('should parse VESTS asset string correctly', () => {
      const result = parseAsset('1000000.000000 VESTS')
      expect(result).toEqual({
        amount: 1000000.0,
        symbol: Symbol.VESTS,
      })
      expect(result).toMatchSnapshot()
    })

    it.each([
      ['0.001 HIVE', 0.001, Symbol.HIVE],
      ['1000.123 HBD', 1000.123, Symbol.HBD],
      ['500.000 VESTS', 500.0, Symbol.VESTS],
      ['0.000 HIVE', 0, Symbol.HIVE],
    ])('should parse %s correctly', (input, expectedAmount, expectedSymbol) => {
      const result = parseAsset(input)
      expect(result.amount).toBe(expectedAmount)
      expect(result.symbol).toBe(expectedSymbol)
    })
  })

  describe('SMTAsset input', () => {
    it('should parse HIVE SMTAsset correctly', () => {
      const smtAsset = {
        amount: '123456',
        precision: 3,
        nai: '@@000000021' as keyof typeof NaiMap,
      }
      const result = parseAsset(smtAsset)
      expect(result).toEqual({
        amount: 123.456,
        symbol: Symbol.HIVE,
      })
      expect(result).toMatchSnapshot()
    })

    it('should parse HBD SMTAsset correctly', () => {
      const smtAsset = {
        amount: '50123',
        precision: 3,
        nai: '@@000000013' as keyof typeof NaiMap,
      }
      const result = parseAsset(smtAsset)
      expect(result).toEqual({
        amount: 50.123,
        symbol: Symbol.HBD,
      })
      expect(result).toMatchSnapshot()
    })

    it('should parse VESTS SMTAsset correctly', () => {
      const smtAsset = {
        amount: '1000000000000',
        precision: 6,
        nai: '@@000000037' as keyof typeof NaiMap,
      }
      const result = parseAsset(smtAsset)
      expect(result).toEqual({
        amount: 1000000.0,
        symbol: Symbol.VESTS,
      })
      expect(result).toMatchSnapshot()
    })

    it.each([
      [{ amount: '1', precision: 3, nai: '@@000000021' }, 0.001, Symbol.HIVE],
      [{ amount: '1000123', precision: 3, nai: '@@000000013' }, 1000.123, Symbol.HBD],
      [{ amount: '500000000', precision: 6, nai: '@@000000037' }, 500.0, Symbol.VESTS],
    ] as const)('should parse SMTAsset with amount %i correctly', (input, expectedAmount, expectedSymbol) => {
      const result = parseAsset(input)
      expect(result.amount).toBe(expectedAmount)
      expect(result.symbol).toBe(expectedSymbol)
    })
  })

  describe('edge cases', () => {
    it('should handle zero amounts', () => {
      expect(parseAsset('0.000 HIVE')).toEqual({
        amount: 0,
        symbol: Symbol.HIVE,
      })
    })

    it('should handle large amounts', () => {
      const result = parseAsset('999999999.999 HIVE')
      expect(result.amount).toBe(999999999.999)
      expect(result.symbol).toBe(Symbol.HIVE)
    })

    it('should handle SMTAsset with zero precision', () => {
      const smtAsset = {
        amount: '123',
        precision: 0,
        nai: '@@000000021' as keyof typeof NaiMap,
      }
      const result = parseAsset(smtAsset)
      expect(result.amount).toBe(123)
    })
  })
})

describe('Symbol enum', () => {
  it('should have correct symbol values', () => {
    expect(Symbol.HIVE).toBe('HIVE')
    expect(Symbol.HBD).toBe('HBD')
    expect(Symbol.VESTS).toBe('VESTS')
  })
})

describe('NaiMap enum', () => {
  it('should map NAI codes to symbols', () => {
    expect(NaiMap['@@000000021']).toBe('HIVE')
    expect(NaiMap['@@000000013']).toBe('HBD')
    expect(NaiMap['@@000000037']).toBe('VESTS')
  })
})
