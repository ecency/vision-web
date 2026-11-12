import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getPostQueryOptions } from './get-post-query-options'
import { verifyPostOnAlternateNode } from '@/modules/bridge/verify-on-alternate-node'

const mockCallRPC = vi.hoisted(() => vi.fn());

vi.mock('@/modules/core/hive-tx', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/modules/core/hive-tx')>()
  return {
    ...actual,
    callRPC: mockCallRPC,
    // Bridge reads go through the v2 helper; answer them from the same mock.
    callRPCWithFallback: vi.fn(async (primary: { method: string; params: unknown }) => ({ result: await mockCallRPC(primary.method, primary.params), method: primary.method })),
  }
})

// Mock filterDmcaEntry
vi.mock('../utils/filter-dmca-entries', () => ({
  filterDmcaEntry: vi.fn((entry) => entry)
}))

// Mock verifyPostOnAlternateNode
vi.mock('@/modules/bridge/verify-on-alternate-node', () => ({
  verifyPostOnAlternateNode: vi.fn().mockResolvedValue(null)
}))

describe('getPostQueryOptions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('query key generation', () => {
    it('should generate correct query key for author and permlink', () => {
      const options = getPostQueryOptions('testauthor', 'test-permlink')

      expect(options.queryKey).toMatchSnapshot()
      expect(options.queryKey).toEqual(['posts', 'entry', '/@testauthor/test-permlink'])
    })

    it('should handle permlink with spaces', () => {
      const options = getPostQueryOptions('testauthor', '  test-permlink  ')

      expect(options.queryKey).toEqual(['posts', 'entry', '/@testauthor/test-permlink'])
    })

    it('should generate query key with empty category', () => {
      const options = getPostQueryOptions('author', 'permlink')

      expect(options.queryKey[2]).toBe('/@author/permlink')
    })
  })

  describe('enabled conditions', () => {
    it('should be enabled for valid author and permlink', () => {
      const options = getPostQueryOptions('testauthor', 'test-permlink')

      expect(options.enabled).toBe(true)
    })

    it('should be disabled for empty author', () => {
      const options = getPostQueryOptions('', 'test-permlink')

      expect(options.enabled).toBe(false)
    })

    it('should be disabled for undefined permlink', () => {
      const options = getPostQueryOptions('testauthor', undefined)

      expect(options.enabled).toBe(false)
    })

    it('should be disabled for empty permlink', () => {
      const options = getPostQueryOptions('testauthor', '')

      expect(options.enabled).toBe(false)
    })

    it('should be disabled for permlink that trims to empty', () => {
      const options = getPostQueryOptions('testauthor', '   ')

      expect(options.enabled).toBe(false)
    })

    it('should be disabled for permlink "undefined"', () => {
      const options = getPostQueryOptions('testauthor', 'undefined')

      expect(options.enabled).toBe(false)
    })

    it('should be disabled for permlink that trims to "undefined"', () => {
      const options = getPostQueryOptions('testauthor', '  undefined  ')

      expect(options.enabled).toBe(false)
    })
  })

  describe('queryFn behavior', () => {
    it('should return null for empty permlink after trim', async () => {
      const options = getPostQueryOptions('testauthor', '   ')
      const result = await (options.queryFn as any)()

      expect(result).toBeNull()
      expect(mockCallRPC).not.toHaveBeenCalled()
    })

    it('should return null for permlink "undefined"', async () => {
      const options = getPostQueryOptions('testauthor', 'undefined')
      const result = await (options.queryFn as any)()

      expect(result).toBeNull()
      expect(mockCallRPC).not.toHaveBeenCalled()
    })

    it('should call callRPC with correct parameters', async () => {
      const mockResponse = {
        author: 'testauthor',
        permlink: 'test-permlink',
        title: 'Test Post',
        body: 'Test content'
      }
      mockCallRPC.mockResolvedValue(mockResponse)

      const options = getPostQueryOptions('testauthor', 'test-permlink', 'observer')
      await (options.queryFn as any)()

      expect(mockCallRPC).toHaveBeenCalledWith('bridge.get_post_v2', {
        author: 'testauthor',
        permlink: 'test-permlink',
        observer: 'observer',
        // The five strongest voters ride along (curation drawer, review G).
        top_votes: 5
      })
    })

    it('should call callRPC with empty observer by default', async () => {
      const mockResponse = { author: 'test', permlink: 'test' }
      mockCallRPC.mockResolvedValue(mockResponse)

      const options = getPostQueryOptions('testauthor', 'test-permlink')
      await (options.queryFn as any)()

      expect(mockCallRPC).toHaveBeenCalledWith('bridge.get_post_v2', {
        author: 'testauthor',
        permlink: 'test-permlink',
        observer: '',
        top_votes: 5
      })
    })

    it('should return null when callRPC returns null and verification also returns null', async () => {
      mockCallRPC.mockResolvedValue(null)
      vi.mocked(verifyPostOnAlternateNode).mockResolvedValue(null)

      const options = getPostQueryOptions('testauthor', 'test-permlink')
      const result = await (options.queryFn as any)()

      expect(result).toBeNull()
      expect(verifyPostOnAlternateNode).toHaveBeenCalledWith('testauthor', 'test-permlink', '')
    })

    it('should return verified entry when primary returns null but alternate node has it', async () => {
      const verifiedEntry = {
        author: 'testauthor',
        permlink: 'test-permlink',
        post_id: 123,
        title: 'Found on alternate'
      }
      mockCallRPC.mockResolvedValue(null)
      vi.mocked(verifyPostOnAlternateNode).mockResolvedValue(verifiedEntry as any)

      const options = getPostQueryOptions('testauthor', 'test-permlink')
      const result = await (options.queryFn as any)()

      expect(result).toEqual(verifiedEntry)
      expect(verifyPostOnAlternateNode).toHaveBeenCalledWith('testauthor', 'test-permlink', '')
    })

    it('should not call verification when primary returns data', async () => {
      const mockResponse = { author: 'testauthor', permlink: 'test-permlink' }
      mockCallRPC.mockResolvedValue(mockResponse)

      const options = getPostQueryOptions('testauthor', 'test-permlink')
      await (options.queryFn as any)()

      expect(verifyPostOnAlternateNode).not.toHaveBeenCalled()
    })

    it('should add num field when provided', async () => {
      const mockResponse = {
        author: 'testauthor',
        permlink: 'test-permlink'
      }
      mockCallRPC.mockResolvedValue(mockResponse)

      const options = getPostQueryOptions('testauthor', 'test-permlink', '', 5)
      const result = await (options.queryFn as any)()

      expect(result).toBeDefined()
      expect(result?.num).toBe(5)
    })

    it('should not add num field when undefined', async () => {
      const mockResponse = {
        author: 'testauthor',
        permlink: 'test-permlink'
      }
      mockCallRPC.mockResolvedValue(mockResponse)

      const options = getPostQueryOptions('testauthor', 'test-permlink')
      const result = await (options.queryFn as any)()

      expect(result).toBeDefined()
      expect(result).not.toHaveProperty('num')
    })
  })

  describe('edge cases', () => {
    it('should handle special characters in permlink', () => {
      const options = getPostQueryOptions('testauthor', 'test-permlink-123-xyz')

      expect(options.queryKey[2]).toBe('/@testauthor/test-permlink-123-xyz')
    })

    it('should handle unicode in author name', () => {
      const options = getPostQueryOptions('测试用户', 'test-permlink')

      expect(options.queryKey[2]).toContain('测试用户')
    })

    it('should trim leading and trailing whitespace from permlink', () => {
      const options = getPostQueryOptions('author', '  spaced-permlink  ')

      expect(options.queryKey[2]).toBe('/@author/spaced-permlink')
    })
  })
})
