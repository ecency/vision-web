import { describe, it, expect } from 'vitest'
import { vestsToHp, isEmptyDate } from '.'

describe('vestsToHp', () => {
  describe('basic conversions', () => {
    it('should convert vests to HP correctly', () => {
      const result = vestsToHp(1000000, 500)
      expect(result).toBe(500)
      expect(result).toMatchSnapshot()
    })

    it('should handle zero vests', () => {
      const result = vestsToHp(0, 500)
      expect(result).toBe(0)
    })

    it('should handle zero hivePerMVests', () => {
      const result = vestsToHp(1000000, 0)
      expect(result).toBe(0)
    })

    it('should handle fractional results', () => {
      const result = vestsToHp(1500000, 485.123)
      expect(result).toBeCloseTo(727.6845, 4)
    })
  })

  describe('various vest amounts', () => {
    it.each([
      [1000000, 500, 500],
      [2000000, 500, 1000],
      [500000, 500, 250],
      [100000, 500, 50],
      [1234567, 485.5, 599.378],
    ])('should convert %f vests with %f HIVE/MVests to %f HP', (vests, hivePerMVests, expectedHp) => {
      const result = vestsToHp(vests, hivePerMVests)
      expect(result).toBeCloseTo(expectedHp, 2)
    })
  })

  describe('real-world scenarios', () => {
    it('should handle typical user VP (10 HP equivalent)', () => {
      const vests = 20000
      const hivePerMVests = 500
      const result = vestsToHp(vests, hivePerMVests)
      expect(result).toBe(10)
    })

    it('should handle whale account (100k HP equivalent)', () => {
      const vests = 200000000
      const hivePerMVests = 485.5
      const result = vestsToHp(vests, hivePerMVests)
      expect(result).toBeCloseTo(97100, 0)
    })

    it('should handle very small amounts', () => {
      const vests = 100
      const hivePerMVests = 500
      const result = vestsToHp(vests, hivePerMVests)
      expect(result).toBe(0.05)
    })

    it('should handle very large amounts', () => {
      const vests = 999999999999
      const hivePerMVests = 485.5
      const result = vestsToHp(vests, hivePerMVests)
      expect(result).toBeCloseTo(485499999.9995, 4)
    })
  })

  describe('edge cases', () => {
    it('should handle negative vests (edge case)', () => {
      const result = vestsToHp(-1000000, 500)
      expect(result).toBe(-500)
    })

    it('should handle negative hivePerMVests (edge case)', () => {
      const result = vestsToHp(1000000, -500)
      expect(result).toBe(-500)
    })

    it('should handle decimal vests', () => {
      const result = vestsToHp(1500000.5, 485.123)
      expect(result).toBeCloseTo(727.68474256, 5)
    })
  })

  describe('snapshots', () => {
    it('should match snapshot for typical conversion', () => {
      const result = vestsToHp(10000000, 485.5)
      expect(result).toMatchSnapshot()
    })

    it('should match snapshot for small amount', () => {
      const result = vestsToHp(1000, 485.5)
      expect(result).toMatchSnapshot()
    })
  })
})

describe('isEmptyDate', () => {
  describe('valid dates', () => {
    it('should return false for dates after 1980', () => {
      expect(isEmptyDate('2024-01-15T10:00:00')).toBe(false)
    })

    it('should return false for date exactly at 1980', () => {
      expect(isEmptyDate('1980-01-01T00:00:00')).toBe(false)
    })

    it('should return false for current dates', () => {
      expect(isEmptyDate('2026-01-13T12:00:00')).toBe(false)
    })

    it.each([
      '2024-12-31T23:59:59',
      '2000-06-15T10:30:00',
      '1990-01-01T00:00:00',
      '1980-06-01T12:00:00',
    ])('should return false for valid date %s', (date) => {
      expect(isEmptyDate(date)).toBe(false)
    })
  })

  describe('empty dates', () => {
    it('should return true for undefined', () => {
      expect(isEmptyDate(undefined)).toBe(true)
    })

    it('should return true for dates before 1980', () => {
      expect(isEmptyDate('1979-12-31T23:59:59')).toBe(true)
    })

    it('should return true for dates in 1970', () => {
      expect(isEmptyDate('1970-01-01T00:00:00')).toBe(true)
    })

    it('should return true for epoch start', () => {
      expect(isEmptyDate('1970-01-01T00:00:00Z')).toBe(true)
    })

    it.each([
      '1979-12-31T23:59:59',
      '1970-01-01T00:00:00',
      '1969-12-31T23:59:59',
      '1900-01-01T00:00:00',
      '0001-01-01T00:00:00',
    ])('should return true for empty date %s', (date) => {
      expect(isEmptyDate(date)).toBe(true)
    })
  })

  describe('edge cases', () => {
    it('should return true for dates in year 1979', () => {
      expect(isEmptyDate('1979-01-01T00:00:00')).toBe(true)
    })

    it('should return false for dates in year 1980', () => {
      expect(isEmptyDate('1980-01-01T00:00:00')).toBe(false)
    })

    it('should handle dates with different formats', () => {
      expect(isEmptyDate('2024-01-15')).toBe(false)
      expect(isEmptyDate('1970-01-01')).toBe(true)
    })

    it('should handle dates with timezone info', () => {
      expect(isEmptyDate('2024-01-15T10:00:00Z')).toBe(false)
      expect(isEmptyDate('1970-01-01T00:00:00Z')).toBe(true)
    })

    it('should handle dates with milliseconds', () => {
      expect(isEmptyDate('2024-01-15T10:00:00.000Z')).toBe(false)
      expect(isEmptyDate('1970-01-01T00:00:00.000Z')).toBe(true)
    })
  })

  describe('boundary testing', () => {
    it('should correctly identify 1979 as empty', () => {
      for (let month = 1; month <= 12; month++) {
        const date = `1979-${month.toString().padStart(2, '0')}-15T00:00:00`
        expect(isEmptyDate(date)).toBe(true)
      }
    })

    it('should correctly identify 1980 as valid', () => {
      for (let month = 1; month <= 12; month++) {
        const date = `1980-${month.toString().padStart(2, '0')}-15T00:00:00`
        expect(isEmptyDate(date)).toBe(false)
      }
    })
  })

  describe('snapshots', () => {
    it('should match snapshot for typical valid date', () => {
      const result = isEmptyDate('2024-06-15T10:30:00')
      expect(result).toMatchSnapshot()
    })

    it('should match snapshot for empty date', () => {
      const result = isEmptyDate('1970-01-01T00:00:00')
      expect(result).toMatchSnapshot()
    })

    it('should match snapshot for undefined', () => {
      const result = isEmptyDate(undefined)
      expect(result).toMatchSnapshot()
    })
  })
})
