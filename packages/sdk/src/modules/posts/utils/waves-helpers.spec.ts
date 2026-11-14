import { describe, it, expect } from 'vitest'
import {
  normalizeWaveEntryFromApi,
  toEntryArray,
  mapThreadItemsToWaveEntries
} from './waves-helpers'
import { Entry, WaveEntry } from '../types'

describe('waves-helpers', () => {
  describe('toEntryArray', () => {
    it('should convert array to Entry array', () => {
      const entries = [
        { author: 'user1', permlink: 'post1' },
        { author: 'user2', permlink: 'post2' }
      ]
      const result = toEntryArray(entries)
      expect(result).toEqual(entries)
      expect(Array.isArray(result)).toBe(true)
    })

    it('should return empty array for non-array input', () => {
      expect(toEntryArray(null)).toEqual([])
      expect(toEntryArray(undefined)).toEqual([])
      expect(toEntryArray('string')).toEqual([])
      expect(toEntryArray(123)).toEqual([])
      expect(toEntryArray({ author: 'user' })).toEqual([])
    })

    it('should return empty array for empty array', () => {
      expect(toEntryArray([])).toEqual([])
    })
  })

  describe('normalizeWaveEntryFromApi', () => {
    const mockHost = 'host-user'

    it('ids an entry by author/permlink even when a post_id is present', () => {
      const entry = {
        author: 'testuser',
        permlink: 'test-post',
        post_id: 12345,
        title: 'Test Post',
        body: 'Content'
      } as any

      const result = normalizeWaveEntryFromApi(entry, mockHost)

      expect(result).not.toBeNull()
      expect(result?.id).toBe('testuser/test-post')
      expect(result?.host).toBe(mockHost)
      expect(result?.author).toBe('testuser')
      expect(result?.container).toBeDefined()
      expect(result?.container.host).toBe(mockHost)
    })

    // Review D: feed rows go through normalizeEntry like every other source.
    it('states the vote as unknown and drops a raw voter list', () => {
      const result = normalizeWaveEntryFromApi(
        { author: 'u', permlink: 'p', post_id: 1, active_votes: [{ voter: 'x', rshares: 1 }] } as any,
        mockHost
      ) as any
      expect(result).not.toHaveProperty('active_votes')
      expect(result.observer_vote_for).toBeNull()
      expect(result.observer_vote).toBeNull()
    })

    it('keeps the vote pair of an entry that was already normalized', () => {
      const result = normalizeWaveEntryFromApi(
        { author: 'u', permlink: 'p', post_id: 1, observer_vote: { rshares: 3, percent: 100 }, observer_vote_for: 'alice' } as any,
        mockHost
      ) as any
      expect(result.observer_vote_for).toBe('alice')
    })

    it('should return null for null entry', () => {
      const result = normalizeWaveEntryFromApi(null, mockHost)
      expect(result).toBeNull()
    })

    it('should return null for undefined entry', () => {
      const result = normalizeWaveEntryFromApi(undefined, mockHost)
      expect(result).toBeNull()
    })

    it('should use container when provided', () => {
      const entry = {
        author: 'testuser',
        permlink: 'test-post',
        post_id: 12345,
        container: {
          author: 'container-author',
          permlink: 'container-post',
          post_id: 67890
        }
      } as any

      const result = normalizeWaveEntryFromApi(entry, mockHost)

      expect(result?.container.author).toBe('container-author')
      expect(result?.container.id).toBe('container-author/container-post')
      expect(result?.container.host).toBe(mockHost)
    })

    it('should use entry as container when container not provided', () => {
      const entry = {
        author: 'testuser',
        permlink: 'test-post',
        post_id: 12345
      } as any

      const result = normalizeWaveEntryFromApi(entry, mockHost)

      expect(result?.container.author).toBe('testuser')
      expect(result?.container.id).toBe('testuser/test-post')
    })

    it('should include parent when provided', () => {
      const entry = {
        author: 'testuser',
        permlink: 'test-post',
        post_id: 12345,
        parent: {
          author: 'parent-author',
          permlink: 'parent-post',
          post_id: 11111
        }
      } as any

      const result = normalizeWaveEntryFromApi(entry, mockHost)

      expect(result?.parent).toBeDefined()
      expect(result?.parent?.author).toBe('parent-author')
      expect(result?.parent?.id).toBe('parent-author/parent-post')
    })

    it('should handle entry without parent', () => {
      const entry = {
        author: 'testuser',
        permlink: 'test-post',
        post_id: 12345
      } as any

      const result = normalizeWaveEntryFromApi(entry, mockHost)

      expect(result?.parent).toBeUndefined()
    })

    it('should preserve all entry properties', () => {
      const entry = {
        author: 'testuser',
        permlink: 'test-post',
        post_id: 12345,
        title: 'Test Title',
        body: 'Test Body',
        created: '2024-01-01T00:00:00',
        stats: { total_votes: 10 }
      } as any

      const result = normalizeWaveEntryFromApi(entry, mockHost)

      expect(result?.title).toBe('Test Title')
      expect(result?.body).toBe('Test Body')
      expect(result?.created).toBe('2024-01-01T00:00:00')
      expect(result?.stats).toEqual({ total_votes: 10 })
    })

    it('should map `timestamp` to `created` when `created` is absent', () => {
      // The private-api waves feeds (following / tag / account) send the publish
      // time as `timestamp`, not `created`; without this the card shows no time.
      const entry = {
        author: 'testuser',
        permlink: 'test-post',
        post_id: 12345,
        timestamp: '2024-05-01T12:00:00'
      } as any

      const result = normalizeWaveEntryFromApi(entry, mockHost)

      expect(result?.created).toBe('2024-05-01T12:00:00')
      expect(result?.container.created).toBe('2024-05-01T12:00:00')
    })

    it('should prefer an existing `created` over `timestamp`', () => {
      const entry = {
        author: 'testuser',
        permlink: 'test-post',
        post_id: 12345,
        created: '2024-01-01T00:00:00',
        timestamp: '2024-05-01T12:00:00'
      } as any

      const result = normalizeWaveEntryFromApi(entry, mockHost)

      expect(result?.created).toBe('2024-01-01T00:00:00')
    })
  })

  describe('mapThreadItemsToWaveEntries', () => {
    const mockHost = 'host-user'
    const mockContainer = {
      author: 'container-author',
      permlink: 'container-post',
      post_id: 100,
      host: mockHost
    } as WaveEntry

    it('should return empty array for empty input', () => {
      const result = mapThreadItemsToWaveEntries([], mockContainer, mockHost)
      expect(result).toEqual([])
    })

    it('should map items to wave entries', () => {
      const items = [
        {
          author: 'user1',
          permlink: 'post1',
          post_id: 1,
          created: '2024-01-01T00:00:00',
          parent_author: 'container-author',
          parent_permlink: 'container-post'
        }
      ] as Entry[]

      const result = mapThreadItemsToWaveEntries(items, mockContainer, mockHost)

      expect(result).toHaveLength(1)
      expect(result[0].id).toBe('user1/post1')
      expect(result[0].host).toBe(mockHost)
      expect(result[0].container).toBe(mockContainer)
    })

    it('should filter out the container by author/permlink, not post_id', () => {
      const items = [
        {
          // The container itself, served by another node: a different post_id.
          author: 'container-author',
          permlink: 'container-post',
          post_id: 999,
          created: '2024-01-01T00:00:00',
          parent_author: '',
          parent_permlink: 'waves'
        },
        {
          author: 'user2',
          permlink: 'post2',
          post_id: 2,
          created: '2024-01-02T00:00:00',
          parent_author: 'container-author',
          parent_permlink: 'container-post'
        }
      ] as Entry[]

      const result = mapThreadItemsToWaveEntries(items, mockContainer, mockHost)

      expect(result).toHaveLength(1)
      expect(result[0].post_id).toBe(2)
    })

    it('should sort items by created date descending', () => {
      const items = [
        {
          author: 'user1',
          permlink: 'post1',
          post_id: 1,
          created: '2024-01-01T00:00:00',
          parent_author: 'container-author',
          parent_permlink: 'container-post'
        },
        {
          author: 'user2',
          permlink: 'post2',
          post_id: 2,
          created: '2024-01-03T00:00:00',
          parent_author: 'container-author',
          parent_permlink: 'container-post'
        },
        {
          author: 'user3',
          permlink: 'post3',
          post_id: 3,
          created: '2024-01-02T00:00:00',
          parent_author: 'container-author',
          parent_permlink: 'container-post'
        }
      ] as Entry[]

      const result = mapThreadItemsToWaveEntries(items, mockContainer, mockHost)

      expect(result).toHaveLength(3)
      expect(result[0].post_id).toBe(2) // Most recent
      expect(result[1].post_id).toBe(3)
      expect(result[2].post_id).toBe(1) // Oldest
    })

    it('should link parent items correctly', () => {
      const items = [
        {
          author: 'parent-user',
          permlink: 'parent-post',
          post_id: 1,
          created: '2024-01-01T00:00:00',
          parent_author: 'container-author',
          parent_permlink: 'container-post'
        },
        {
          author: 'child-user',
          permlink: 'child-post',
          post_id: 2,
          created: '2024-01-02T00:00:00',
          parent_author: 'parent-user',
          parent_permlink: 'parent-post'
        }
      ] as Entry[]

      const result = mapThreadItemsToWaveEntries(items, mockContainer, mockHost)

      expect(result).toHaveLength(2)
      const childEntry = result.find(e => e.post_id === 2)
      expect(childEntry?.parent).toBeDefined()
      expect(childEntry?.parent?.author).toBe('parent-user')
    })

    it('should not link parent if parent author is host', () => {
      const items = [
        {
          author: mockHost,
          permlink: 'host-post',
          post_id: 1,
          created: '2024-01-01T00:00:00',
          parent_author: 'container-author',
          parent_permlink: 'container-post'
        },
        {
          author: 'child-user',
          permlink: 'child-post',
          post_id: 2,
          created: '2024-01-02T00:00:00',
          parent_author: mockHost,
          parent_permlink: 'host-post'
        }
      ] as Entry[]

      const result = mapThreadItemsToWaveEntries(items, mockContainer, mockHost)

      const childEntry = result.find(e => e.post_id === 2)
      expect(childEntry?.parent).toBeUndefined()
    })
  })
})

// Hive API nodes stopped returning post_id from bridge reads (v1 and v2, every
// public node, 2026-11). post_id was also never comparable across nodes. A wave
// is identified by author/permlink.
describe('waves-helpers without post_id', () => {
  const host = 'ecency.waves'
  const container = {
    author: host,
    permlink: 'waves-20261114cgy7o3',
    host
  } as unknown as WaveEntry

  const reply = (author: string, permlink: string, created: string) =>
    ({
      author,
      permlink,
      created,
      parent_author: host,
      parent_permlink: 'waves-20261114cgy7o3'
    }) as Entry

  it('keeps every reply when no row carries a post_id', () => {
    const items = [
      reply('alice', 'wave-a', '2026-11-14T07:00:00'),
      reply('bob', 'wave-b', '2026-11-14T08:00:00')
    ]

    const result = mapThreadItemsToWaveEntries(items, container, host)

    expect(result.map((e) => e.id)).toEqual(['bob/wave-b', 'alice/wave-a'])
  })

  it('drops the container itself by author/permlink', () => {
    const items = [
      { ...container, created: '2026-11-14T06:40:00' } as unknown as Entry,
      reply('alice', 'wave-a', '2026-11-14T07:00:00')
    ]

    const result = mapThreadItemsToWaveEntries(items, container, host)

    expect(result.map((e) => e.id)).toEqual(['alice/wave-a'])
  })

  it('ids a normalized wave, its container and parent by author/permlink', () => {
    const result = normalizeWaveEntryFromApi(
      {
        author: 'alice',
        permlink: 'wave-a',
        container: { author: host, permlink: 'waves-20261114cgy7o3' },
        parent: { author: 'bob', permlink: 'wave-b' }
      } as any,
      host
    )

    expect(result?.id).toBe('alice/wave-a')
    expect(result?.container.id).toBe(`${host}/waves-20261114cgy7o3`)
    expect(result?.parent?.id).toBe('bob/wave-b')
  })
})
