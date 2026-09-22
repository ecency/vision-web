import { describe, it, expect, vi } from 'vitest'
import { filterDmcaEntry } from './filter-dmca-entries'
import { Entry } from '../types'

// Mock the CONFIG
vi.mock('@/modules/core', () => ({
  CONFIG: {
    dmcaPatterns: ['@badactor/dmca-post', '@copyright-violator/stolen-content'],
    dmcaPatternRegexes: [/@spam-user\/.*/, /@scammer\/.*/]
  }
}))

describe('filterDmcaEntry', () => {
  describe('with single entry', () => {
    it('should return entry unchanged if not DMCA matched', () => {
      const entry = {
        author: 'gooduser',
        permlink: 'good-post',
        title: 'Original Title',
        body: 'Original content',
        post_id: 123
      } as Entry

      const result = filterDmcaEntry(entry)

      expect(result).toBeDefined()
      expect(result?.author).toBe('gooduser')
      expect(result?.title).toBe('Original Title')
      expect(result?.body).toBe('Original content')
    })

    it('should censor entry matching exact DMCA pattern', () => {
      const entry = {
        author: 'badactor',
        permlink: 'dmca-post',
        title: 'Copyrighted Content',
        body: 'Stolen content here',
        post_id: 456
      } as Entry

      const result = filterDmcaEntry(entry)

      expect(result).toBeDefined()
      expect(result?.author).toBe('badactor')
      expect(result?.title).toBe('')
      expect(result?.body).toBe('This post is not available due to a copyright/fraudulent claim.')
      expect(result?.post_id).toBe(456)
    })

    it('should censor entry matching regex pattern', () => {
      const entry = {
        author: 'spam-user',
        permlink: 'any-post-here',
        title: 'Spam Title',
        body: 'Spam content',
        post_id: 789
      } as Entry

      const result = filterDmcaEntry(entry)

      expect(result).toBeDefined()
      expect(result?.title).toBe('')
      expect(result?.body).toBe('This post is not available due to a copyright/fraudulent claim.')
    })

    it('blanks the metadata that carries the summary and the thumbnail', () => {
      const entry = {
        author: 'badactor',
        permlink: 'dmca-post',
        title: 'Copyrighted Content',
        body: 'Stolen content here',
        json_metadata: {
          description: 'The summary the author published',
          image: ['https://images.ecency.com/cover.jpg'],
          tags: ['movies']
        }
      } as unknown as Entry

      // A card never reads the body: the summary is json_metadata.description
      // when it is set, and the image comes from the metadata first. Blanking
      // body and title alone still served both through oEmbed, .json and the
      // page's own og: tags.
      expect(filterDmcaEntry(entry)?.json_metadata).toEqual({})
    })

    it('leaves the metadata of an unlisted entry alone', () => {
      const json_metadata = {
        description: 'Kept',
        image: ['https://images.ecency.com/fine.jpg']
      }
      const entry = {
        author: 'gooduser',
        permlink: 'good-post',
        title: 'Original Title',
        body: 'Original content',
        json_metadata
      } as unknown as Entry

      expect(filterDmcaEntry(entry)?.json_metadata).toBe(json_metadata)
    })

    it('drops the quoted post a listed cross-post renders', () => {
      // A cross-post's card and page render `original_entry` and only fall
      // back to the wrapper when it is absent, so leaving it served the quoted
      // post's title, summary, cover and body straight through the takedown.
      const entry = {
        author: 'badactor',
        permlink: 'dmca-post',
        title: 'Copyrighted Content',
        body: 'Stolen content here',
        original_entry: {
          author: 'someoneelse',
          permlink: 'the-original',
          title: 'The original title',
          body: 'The original body'
        }
      } as unknown as Entry

      expect(filterDmcaEntry(entry)?.original_entry).toBeUndefined()
    })

    it('keeps the quoted post on an unlisted cross-post', () => {
      const original_entry = {
        author: 'someoneelse',
        permlink: 'the-original',
        title: 'The original title',
        body: 'The original body'
      }
      const entry = {
        author: 'gooduser',
        permlink: 'good-post',
        title: 'Original Title',
        body: 'Original content',
        original_entry
      } as unknown as Entry

      expect(filterDmcaEntry(entry)?.original_entry).toBe(original_entry)
    })

    it('should handle null entry', () => {
      const result = filterDmcaEntry(null as any)
      expect(result).toBeNull()
    })

    it('should handle undefined entry', () => {
      const result = filterDmcaEntry(undefined as any)
      expect(result).toBeUndefined()
    })

    it('should preserve other entry properties when censoring', () => {
      const entry = {
        author: 'scammer',
        permlink: 'scam-post',
        title: 'Scam Title',
        body: 'Scam content',
        post_id: 999,
        created: '2024-01-01',
        category: 'test',
        stats: { total_votes: 10 }
      } as Entry

      const result = filterDmcaEntry(entry)

      expect(result).toBeDefined()
      expect(result?.post_id).toBe(999)
      expect(result?.created).toBe('2024-01-01')
      expect(result?.category).toBe('test')
      expect(result?.stats).toEqual({ total_votes: 10 })
    })
  })

  describe('with array of entries', () => {
    it('should filter array of entries', () => {
      const entries = [
        {
          author: 'gooduser1',
          permlink: 'good-post-1',
          title: 'Good Title 1',
          body: 'Good content 1'
        },
        {
          author: 'badactor',
          permlink: 'dmca-post',
          title: 'Bad Title',
          body: 'Bad content'
        },
        {
          author: 'gooduser2',
          permlink: 'good-post-2',
          title: 'Good Title 2',
          body: 'Good content 2'
        }
      ] as Entry[]

      const result = filterDmcaEntry(entries)

      expect(Array.isArray(result)).toBe(true)
      expect(result).toHaveLength(3)
      expect(result[0].title).toBe('Good Title 1')
      expect(result[1].title).toBe('')
      expect(result[1].body).toBe('This post is not available due to a copyright/fraudulent claim.')
      expect(result[2].title).toBe('Good Title 2')
    })

    it('should return empty array for empty input', () => {
      const result = filterDmcaEntry([])
      expect(result).toEqual([])
    })

    it('should handle array with all DMCA entries', () => {
      const entries = [
        {
          author: 'spam-user',
          permlink: 'spam-1',
          title: 'Spam 1',
          body: 'Spam content 1'
        },
        {
          author: 'scammer',
          permlink: 'scam-1',
          title: 'Scam 1',
          body: 'Scam content 1'
        }
      ] as Entry[]

      const result = filterDmcaEntry(entries)

      expect(result).toHaveLength(2)
      expect(result[0].title).toBe('')
      expect(result[1].title).toBe('')
    })

    it('should handle array with no DMCA entries', () => {
      const entries = [
        {
          author: 'gooduser1',
          permlink: 'post1',
          title: 'Title 1',
          body: 'Content 1'
        },
        {
          author: 'gooduser2',
          permlink: 'post2',
          title: 'Title 2',
          body: 'Content 2'
        }
      ] as Entry[]

      const result = filterDmcaEntry(entries)

      expect(result).toEqual(entries)
    })
  })
})
