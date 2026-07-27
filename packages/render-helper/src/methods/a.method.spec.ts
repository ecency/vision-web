import { a } from './a.method'
import { DOMParser } from '../consts'
import { renderPostBody } from '../index'

describe('a() method - Link Processing', () => {
  let doc: Document

  beforeEach(() => {
    doc = DOMParser.parseFromString('<html><body></body></html>', 'text/html')
  })

  describe('security', () => {
    describe('javascript URL prevention', () => {
      it('should strip javascript: hrefs', () => {
        const parent = doc.createElement('div')
        const el = doc.createElement('a')
        el.setAttribute('href', 'javascript:alert(1)')
        parent.appendChild(el)

        a(el, false)

        expect(el.getAttribute('href')).toBeNull()
      })

      it('should handle case-insensitive javascript:', () => {
        const parent = doc.createElement('div')
        const el = doc.createElement('a')
        el.setAttribute('href', 'JavaScript:alert(1)')
        parent.appendChild(el)

        a(el, false)

        expect(el.getAttribute('href')).toBeNull()
      })

      it('should handle JAVASCRIPT: in uppercase', () => {
        const parent = doc.createElement('div')
        const el = doc.createElement('a')
        el.setAttribute('href', 'JAVASCRIPT:alert(1)')
        parent.appendChild(el)

        a(el, false)

        expect(el.getAttribute('href')).toBeNull()
      })

      it('should handle whitespace in javascript:', () => {
        const parent = doc.createElement('div')
        const el = doc.createElement('a')
        el.setAttribute('href', '  javascript:alert(1)')
        parent.appendChild(el)

        a(el, false)

        expect(el.getAttribute('href')).toBeNull()
      })

      it('should handle tabs in javascript:', () => {
        const parent = doc.createElement('div')
        const el = doc.createElement('a')
        el.setAttribute('href', '\tjavascript:alert(1)')
        parent.appendChild(el)

        a(el, false)

        expect(el.getAttribute('href')).toBeNull()
      })

      it('should handle newlines in javascript:', () => {
        const parent = doc.createElement('div')
        const el = doc.createElement('a')
        el.setAttribute('href', '\njavascript:alert(1)')
        parent.appendChild(el)

        a(el, false)

        expect(el.getAttribute('href')).toBeNull()
      })

      it('should not flag javascript in URL path', () => {
        const parent = doc.createElement('div')
        const el = doc.createElement('a')
        el.setAttribute('href', 'https://example.com/javascript-tutorial')
        el.textContent = 'https://example.com/javascript-tutorial'
        parent.appendChild(el)

        a(el, false)

        expect(el.getAttribute('href')).toBe('https://example.com/javascript-tutorial')
        expect(el.getAttribute('class')).toBe('markdown-external-link')
      })
    })
  })

  describe('edge cases', () => {
    it('should handle null element', () => {
      expect(() => a(null, false)).not.toThrow()
    })

    it('should handle element without parent', () => {
      const el = doc.createElement('a')
      el.setAttribute('href', 'https://example.com')

      expect(() => a(el, false)).not.toThrow()
    })

    it('should handle empty href', () => {
      const parent = doc.createElement('div')
      const el = doc.createElement('a')
      parent.appendChild(el)

      a(el, false)

      expect(el.getAttribute('href')).toBeNull()
    })

    it('should skip already processed markdown-author-link', () => {
      const parent = doc.createElement('div')
      const el = doc.createElement('a')
      el.setAttribute('href', 'https://ecency.com/@username')
      el.setAttribute('class', 'markdown-author-link')
      parent.appendChild(el)

      const originalHref = el.getAttribute('href')
      a(el, false)

      expect(el.getAttribute('href')).toBe(originalHref)
    })

    it('should skip already processed markdown-tag-link', () => {
      const parent = doc.createElement('div')
      const el = doc.createElement('a')
      el.setAttribute('href', 'https://ecency.com/trending/bitcoin')
      el.setAttribute('class', 'markdown-tag-link')
      parent.appendChild(el)

      const originalHref = el.getAttribute('href')
      a(el, false)

      expect(el.getAttribute('href')).toBe(originalHref)
    })
  })

  describe('image links', () => {
    it('should convert image link to img element', () => {
      const parent = doc.createElement('div')
      const el = doc.createElement('a')
      const imageUrl = 'https://example.com/image.jpg'
      el.setAttribute('href', imageUrl)
      el.textContent = imageUrl
      parent.appendChild(el)

      a(el, false)

      const imgs = parent.getElementsByTagName('img')
      expect(imgs.length).toBeGreaterThan(0)
      expect(imgs[0]?.getAttribute('src')).toContain('https://i.ecency.com')
    })

    it('should handle image links with query params', () => {
      const parent = doc.createElement('div')
      const el = doc.createElement('a')
      const imageUrl = 'https://example.com/image.jpg?width=500'
      el.setAttribute('href', imageUrl)
      el.textContent = imageUrl
      parent.appendChild(el)

      a(el, false)

      const imgs = parent.getElementsByTagName('img')
      expect(imgs.length).toBeGreaterThan(0)
    })

    it('should handle PNG images', () => {
      const parent = doc.createElement('div')
      const el = doc.createElement('a')
      const imageUrl = 'https://example.com/image.png'
      el.setAttribute('href', imageUrl)
      el.textContent = imageUrl
      parent.appendChild(el)

      a(el, false)

      const imgs = parent.getElementsByTagName('img')
      expect(imgs.length).toBeGreaterThan(0)
    })

    it('should handle GIF images', () => {
      const parent = doc.createElement('div')
      const el = doc.createElement('a')
      const imageUrl = 'https://example.com/animation.gif'
      el.setAttribute('href', imageUrl)
      el.textContent = imageUrl
      parent.appendChild(el)

      a(el, false)

      const imgs = parent.getElementsByTagName('img')
      expect(imgs.length).toBeGreaterThan(0)
    })

    it('should handle WebP images', () => {
      const parent = doc.createElement('div')
      const el = doc.createElement('a')
      const imageUrl = 'https://example.com/image.webp'
      el.setAttribute('href', imageUrl)
      el.textContent = imageUrl
      parent.appendChild(el)

      a(el, false)

      const imgs = parent.getElementsByTagName('img')
      expect(imgs.length).toBeGreaterThan(0)
    })
  })

  describe('IPFS links', () => {
    it('should convert IPFS link to img element', () => {
      const parent = doc.createElement('div')
      const el = doc.createElement('a')
      const ipfsUrl = 'https://ipfs.io/ipfs/QmTest123'
      el.setAttribute('href', ipfsUrl)
      el.textContent = ipfsUrl
      parent.appendChild(el)

      a(el, false)

      expect(el.getAttribute('class')).toBe('markdown-img-link')
      const imgs = el.getElementsByTagName('img')
      expect(imgs.length).toBe(1)
      expect(imgs[0]?.getAttribute('src')).toBe(ipfsUrl)
    })

    it('should not process IPFS links with hash fragments', () => {
      const parent = doc.createElement('div')
      const el = doc.createElement('a')
      const ipfsUrl = 'https://ipfs.io/ipfs/QmTest123#fragment'
      el.setAttribute('href', ipfsUrl)
      el.textContent = ipfsUrl
      parent.appendChild(el)

      a(el, false)

      expect(el.getAttribute('class')).not.toBe('markdown-img-link')
    })

    it('should set data-href for app mode with IPFS', () => {
      const parent = doc.createElement('div')
      const el = doc.createElement('a')
      const ipfsUrl = 'https://ipfs.io/ipfs/QmTest123'
      el.setAttribute('href', ipfsUrl)
      el.textContent = ipfsUrl
      parent.appendChild(el)

      a(el, true)

      expect(el.getAttribute('data-href')).toBe(ipfsUrl)
      expect(el.getAttribute('href')).toBeNull()
    })
  })

  describe('internal Hive links', () => {
    describe('post links', () => {
      it('should transform ecency.com post links for web', () => {
        const parent = doc.createElement('div')
        const el = doc.createElement('a')
        const href = 'https://ecency.com/hive/@author/permlink'
        el.setAttribute('href', href)
        el.textContent = href
        parent.appendChild(el)

        a(el, false)

        expect(el.getAttribute('class')).toBe('markdown-post-link')
        expect(el.getAttribute('href')).toBe('/@author/permlink')
        expect(el.getAttribute('data-is-inline')).toBe('true')
        expect(el.textContent).toBe('@author/permlink')
      })

      it('should transform peakd.com post links for web', () => {
        const parent = doc.createElement('div')
        const el = doc.createElement('a')
        const href = 'https://peakd.com/hive/@author/permlink'
        el.setAttribute('href', href)
        el.textContent = href
        parent.appendChild(el)

        a(el, false)

        expect(el.getAttribute('class')).toBe('markdown-post-link')
        expect(el.getAttribute('href')).toBe('/@author/permlink')
      })

      it('should transform hive.blog post links for web', () => {
        const parent = doc.createElement('div')
        const el = doc.createElement('a')
        const href = 'https://hive.blog/test/@author/permlink'
        el.setAttribute('href', href)
        el.textContent = href
        parent.appendChild(el)

        a(el, false)

        expect(el.getAttribute('class')).toBe('markdown-post-link')
        expect(el.getAttribute('href')).toBe('/@author/permlink')
      })

      it('should transform snapie.io post links for web', () => {
        const parent = doc.createElement('div')
        const el = doc.createElement('a')
        const href = 'https://snapie.io/hive/@author/permlink'
        el.setAttribute('href', href)
        el.textContent = href
        parent.appendChild(el)

        a(el, false)

        expect(el.getAttribute('class')).toBe('markdown-post-link')
        expect(el.getAttribute('href')).toBe('/@author/permlink')
      })

      it('should transform snapie.io post links without a category segment', () => {
        const parent = doc.createElement('div')
        const el = doc.createElement('a')
        const href = 'https://snapie.io/@author/permlink'
        el.setAttribute('href', href)
        el.textContent = href
        parent.appendChild(el)

        a(el, false)

        expect(el.getAttribute('class')).toBe('markdown-post-link')
        expect(el.getAttribute('href')).toBe('/@author/permlink')
      })

      it('should transform hivesuite.app post links for web', () => {
        const parent = doc.createElement('div')
        const el = doc.createElement('a')
        const href = 'https://hivesuite.app/hive/@author/permlink'
        el.setAttribute('href', href)
        el.textContent = href
        parent.appendChild(el)

        a(el, false)

        expect(el.getAttribute('class')).toBe('markdown-post-link')
        expect(el.getAttribute('href')).toBe('/@author/permlink')
      })

      it('should transform inleo.io post links for web', () => {
        const parent = doc.createElement('div')
        const el = doc.createElement('a')
        const href = 'https://inleo.io/hive/@author/permlink'
        el.setAttribute('href', href)
        el.textContent = href
        parent.appendChild(el)

        a(el, false)

        expect(el.getAttribute('class')).toBe('markdown-post-link')
        expect(el.getAttribute('href')).toBe('/@author/permlink')
      })

      it('detects inline post links when display text is a bare frontend URL', () => {
        // Display text omits the category segment (and differs from href), so
        // inline detection relies on normalizeDisplayText stripping the domain.
        const parent = doc.createElement('div')
        const el = doc.createElement('a')
        const href = 'https://inleo.io/hive/@author/permlink'
        el.setAttribute('href', href)
        el.textContent = 'https://inleo.io/@author/permlink'
        parent.appendChild(el)

        a(el, false)

        expect(el.getAttribute('class')).toBe('markdown-post-link')
        expect(el.getAttribute('href')).toBe('/@author/permlink')
        expect(el.getAttribute('data-is-inline')).toBe('true')
      })

      it('should set data attributes for app mode', () => {
        const parent = doc.createElement('div')
        const el = doc.createElement('a')
        const href = 'https://ecency.com/hive/@author/permlink'
        el.setAttribute('href', href)
        el.textContent = href
        parent.appendChild(el)

        a(el, true)

        expect(el.getAttribute('href')).toBeNull()
        expect(el.getAttribute('data-href')).toBe(href)
        expect(el.getAttribute('data-tag')).toBe('hive')
        expect(el.getAttribute('data-author')).toBe('author')
        expect(el.getAttribute('data-permlink')).toBe('permlink')
        expect(el.getAttribute('data-is-inline')).toBe('true')
      })

      it('should handle www. prefix in domain', () => {
        const parent = doc.createElement('div')
        const el = doc.createElement('a')
        const href = 'https://www.ecency.com/hive/@author/permlink'
        el.setAttribute('href', href)
        el.textContent = href
        parent.appendChild(el)

        a(el, false)

        expect(el.getAttribute('class')).toBe('markdown-post-link')
        expect(el.getAttribute('href')).toBe('/@author/permlink')
      })

      it('should detect non-inline links when text differs', () => {
        const parent = doc.createElement('div')
        const el = doc.createElement('a')
        const href = 'https://ecency.com/hive/@author/permlink'
        el.setAttribute('href', href)
        el.textContent = 'Different text'
        parent.appendChild(el)

        a(el, false)

        expect(el.getAttribute('data-is-inline')).toBe('false')
        expect(el.textContent).toBe('Different text')
      })

      it('should detect inline links when title matches', () => {
        const parent = doc.createElement('div')
        const el = doc.createElement('a')
        const href = 'https://ecency.com/hive/@author/permlink'
        el.setAttribute('href', href)
        el.setAttribute('title', href)
        el.textContent = 'Different text'
        parent.appendChild(el)

        a(el, false)

        expect(el.getAttribute('data-is-inline')).toBe('true')
      })

      it('should sanitize permlink with query params', () => {
        const parent = doc.createElement('div')
        const el = doc.createElement('a')
        const href = 'https://ecency.com/hive/@author/permlink?param=value'
        el.setAttribute('href', href)
        el.textContent = href
        parent.appendChild(el)

        a(el, false)

        expect(el.getAttribute('href')).toBe('/@author/permlink')
      })

      it('should sanitize permlink with hash', () => {
        const parent = doc.createElement('div')
        const el = doc.createElement('a')
        const href = 'https://ecency.com/hive/@author/permlink#section'
        el.setAttribute('href', href)
        el.textContent = href
        parent.appendChild(el)

        a(el, false)

        expect(el.getAttribute('href')).toBe('/@author/permlink')
      })

      it('should reject invalid permlinks with image extensions', () => {
        const parent = doc.createElement('div')
        const el = doc.createElement('a')
        const href = 'https://ecency.com/hive/@author/image.jpg'
        el.setAttribute('href', href)
        el.textContent = href
        parent.appendChild(el)

        a(el, false)

        // Invalid permlink should be skipped, element unchanged
        expect(el.getAttribute('class')).toBeNull()
      })

      it('should not treat multi-segment-middle URLs as post links', () => {
        // POST_REGEX is `^https?://([^/]+)/([^/]+)/(@user)/(perm)$`, so a URL
        // with an extra path segment between domain and tag (e.g.
        // `host/foo/bar/@user/perm`) doesn't match the regex at all. The
        // resulting rewritten href would be a 4-segment internal path that
        // routes.ts has no route for, so rejecting here keeps the
        // rewrite path from emitting a link that 404s downstream. The
        // fallback path may still tag the anchor as an external link,
        // which is fine — what we're asserting is *not a post link*.
        // Regression test for the POST_REGEX tightening discussed on
        // PR #784.
        const parent = doc.createElement('div')
        const el = doc.createElement('a')
        const href = 'https://ecency.com/foo/bar/@author/permlink'
        el.setAttribute('href', href)
        el.textContent = href
        parent.appendChild(el)

        a(el, false)

        expect(el.getAttribute('class')).not.toBe('markdown-post-link')
        expect(el.getAttribute('data-tag')).toBeNull()
        expect(el.getAttribute('data-permlink')).toBeNull()
      })
    })

    describe('user mention links', () => {
      it('should transform user mention links for web', () => {
        const parent = doc.createElement('div')
        const el = doc.createElement('a')
        const href = 'https://ecency.com/@username'
        el.setAttribute('href', href)
        el.textContent = href
        parent.appendChild(el)

        a(el, false)

        expect(el.getAttribute('class')).toBe('markdown-author-link')
        expect(el.getAttribute('href')).toBe('/@username')
        expect(el.textContent).toBe('@username')
      })

      it('should transform user mention links for app', () => {
        const parent = doc.createElement('div')
        const el = doc.createElement('a')
        const href = 'https://ecency.com/@username'
        el.setAttribute('href', href)
        el.textContent = href
        parent.appendChild(el)

        a(el, true)

        expect(el.getAttribute('class')).toBe('markdown-author-link')
        expect(el.getAttribute('href')).toBeNull()
        expect(el.getAttribute('data-author')).toBe('username')
      })

      it('should lowercase usernames', () => {
        const parent = doc.createElement('div')
        const el = doc.createElement('a')
        const href = 'https://ecency.com/@username'
        el.setAttribute('href', href)
        el.textContent = href
        parent.appendChild(el)

        a(el, false)

        expect(el.getAttribute('href')).toBe('/@username')
      })

      it('should reject invalid usernames', () => {
        const parent = doc.createElement('div')
        const el = doc.createElement('a')
        const href = 'https://ecency.com/@ab'
        el.setAttribute('href', href)
        el.textContent = href
        parent.appendChild(el)

        a(el, false)

        // Invalid username should be skipped, element unchanged
        expect(el.getAttribute('class')).toBeNull()
      })

      it('should handle internal mention links', () => {
        const parent = doc.createElement('div')
        const el = doc.createElement('a')
        const href = '/@username'
        el.setAttribute('href', href)
        el.textContent = href
        parent.appendChild(el)

        a(el, false)

        expect(el.getAttribute('class')).toBe('markdown-author-link')
        expect(el.getAttribute('href')).toBe('/@username')
      })

      it('should not process mentions with paths', () => {
        const parent = doc.createElement('div')
        const el = doc.createElement('a')
        const href = 'https://ecency.com/@username/posts'
        el.setAttribute('href', href)
        el.textContent = href
        parent.appendChild(el)

        a(el, false)

        expect(el.getAttribute('class')).not.toBe('markdown-author-link')
      })
    })

    describe('tag/topic links', () => {
      it('should transform topic links with filter', () => {
        const parent = doc.createElement('div')
        const el = doc.createElement('a')
        const href = 'https://ecency.com/trending/bitcoin'
        el.setAttribute('href', href)
        el.textContent = href
        parent.appendChild(el)

        a(el, false)

        expect(el.getAttribute('class')).toBe('markdown-tag-link')
        expect(el.getAttribute('href')).toBe('/trending/bitcoin')
        expect(el.textContent).toBe('/trending/bitcoin')
      })

      it('should set data attributes for app mode with topics', () => {
        const parent = doc.createElement('div')
        const el = doc.createElement('a')
        const href = 'https://ecency.com/hot/crypto'
        el.setAttribute('href', href)
        el.textContent = href
        parent.appendChild(el)

        a(el, true)

        expect(el.getAttribute('href')).toBeNull()
        expect(el.getAttribute('data-filter')).toBe('hot')
        expect(el.getAttribute('data-tag')).toBe('crypto')
      })

      it('should handle internal topic links', () => {
        const parent = doc.createElement('div')
        const el = doc.createElement('a')
        const href = '/created/programming'
        el.setAttribute('href', href)
        el.textContent = href
        parent.appendChild(el)

        a(el, false)

        expect(el.getAttribute('class')).toBe('markdown-tag-link')
        expect(el.getAttribute('href')).toBe('/created/programming')
      })

      it('should handle promoted filter', () => {
        const parent = doc.createElement('div')
        const el = doc.createElement('a')
        const href = 'https://ecency.com/promoted/art'
        el.setAttribute('href', href)
        el.textContent = href
        parent.appendChild(el)

        a(el, false)

        expect(el.getAttribute('class')).toBe('markdown-tag-link')
        expect(el.getAttribute('href')).toBe('/promoted/art')
      })
    })

    describe('community links', () => {
      it('should transform community links', () => {
        const parent = doc.createElement('div')
        const el = doc.createElement('a')
        const href = 'https://ecency.com/c/hive-123456'
        el.setAttribute('href', href)
        el.textContent = href
        parent.appendChild(el)

        a(el, false)

        expect(el.getAttribute('class')).toBe('markdown-community-link')
        expect(el.getAttribute('href')).toBe('/created/hive-123456')
        expect(el.textContent).toBe('created/hive-123456')
      })

      it('should handle community links with filter', () => {
        const parent = doc.createElement('div')
        const el = doc.createElement('a')
        const href = 'https://ecency.com/c/hive-123456/trending'
        el.setAttribute('href', href)
        el.textContent = href
        parent.appendChild(el)

        a(el, false)

        expect(el.getAttribute('href')).toBe('/trending/hive-123456')
      })

      it('should default to created filter for communities', () => {
        const parent = doc.createElement('div')
        const el = doc.createElement('a')
        const href = 'https://ecency.com/c/hive-123456/'
        el.setAttribute('href', href)
        el.textContent = href
        parent.appendChild(el)

        a(el, false)

        expect(el.getAttribute('href')).toBe('/created/hive-123456')
      })

      it('should convert about filter to created', () => {
        const parent = doc.createElement('div')
        const el = doc.createElement('a')
        const href = 'https://ecency.com/c/hive-123456/about'
        el.setAttribute('href', href)
        el.textContent = href
        parent.appendChild(el)

        a(el, false)

        expect(el.getAttribute('href')).toBe('/created/hive-123456')
      })

      it('should set data attributes for app mode with communities', () => {
        const parent = doc.createElement('div')
        const el = doc.createElement('a')
        const href = 'https://ecency.com/c/hive-123456/hot'
        el.setAttribute('href', href)
        el.textContent = href
        parent.appendChild(el)

        a(el, true)

        expect(el.getAttribute('href')).toBeNull()
        expect(el.getAttribute('data-community')).toBe('hive-123456')
        expect(el.getAttribute('data-filter')).toBe('hot')
      })
    })

    describe('profile section links', () => {
      it('should transform profile wallet links', () => {
        const parent = doc.createElement('div')
        const el = doc.createElement('a')
        const href = 'https://ecency.com/@username/wallet'
        el.setAttribute('href', href)
        el.textContent = href
        parent.appendChild(el)

        a(el, false)

        expect(el.getAttribute('class')).toBe('markdown-profile-link')
        expect(el.getAttribute('href')).toBe('/@username/wallet')
        expect(el.textContent).toBe('@username/wallet')
      })

      it('should transform profile posts links', () => {
        const parent = doc.createElement('div')
        const el = doc.createElement('a')
        const href = 'https://ecency.com/@username/posts'
        el.setAttribute('href', href)
        el.textContent = href
        parent.appendChild(el)

        a(el, false)

        expect(el.getAttribute('class')).toBe('markdown-profile-link')
        expect(el.getAttribute('href')).toBe('/@username/posts')
      })

      it('should handle internal profile section links', () => {
        const parent = doc.createElement('div')
        const el = doc.createElement('a')
        const href = '/@username/followers'
        el.setAttribute('href', href)
        el.textContent = href
        parent.appendChild(el)

        a(el, false)

        expect(el.getAttribute('class')).toBe('markdown-profile-link')
        expect(el.getAttribute('href')).toBe('/@username/followers')
      })

      it('should set full URL for app mode with profile sections', () => {
        const parent = doc.createElement('div')
        const el = doc.createElement('a')
        const href = '/@username/wallet'
        el.setAttribute('href', href)
        el.textContent = href
        parent.appendChild(el)

        a(el, true)

        expect(el.getAttribute('href')).toBe('https://ecency.com/@username/wallet')
      })

      it('should handle profile sections with query params', () => {
        const parent = doc.createElement('div')
        const el = doc.createElement('a')
        const href = '/@username/wallet?token=HIVE'
        el.setAttribute('href', href)
        el.textContent = href
        parent.appendChild(el)

        a(el, false)

        expect(el.getAttribute('class')).toBe('markdown-profile-link')
        expect(el.getAttribute('href')).toBe('/@username/wallet?token=HIVE')
      })
    })

    describe('collections posts', () => {
      it('should transform collection post links', () => {
        const parent = doc.createElement('div')
        const el = doc.createElement('a')
        const href = 'https://ecency.com/ccc/username/permlink'
        el.setAttribute('href', href)
        el.textContent = href
        parent.appendChild(el)

        a(el, false)

        expect(el.getAttribute('class')).toBe('markdown-post-link')
        expect(el.getAttribute('href')).toBe('/@username/permlink')
      })

      it('should set correct tag for collection posts', () => {
        const parent = doc.createElement('div')
        const el = doc.createElement('a')
        const href = 'https://ecency.com/ccc/username/permlink'
        el.setAttribute('href', href)
        el.textContent = href
        parent.appendChild(el)

        a(el, true)

        expect(el.getAttribute('data-tag')).toBe('ccc')
        expect(el.getAttribute('data-author')).toBe('username')
        expect(el.getAttribute('data-permlink')).toBe('permlink')
      })
    })

    describe('internal post links', () => {
      it('should transform internal post links', () => {
        const parent = doc.createElement('div')
        const el = doc.createElement('a')
        const href = '/@author/permlink'
        el.setAttribute('href', href)
        el.textContent = href
        parent.appendChild(el)

        a(el, false)

        expect(el.getAttribute('class')).toBe('markdown-post-link')
        expect(el.getAttribute('href')).toBe('/@author/permlink')
      })

      it('should handle internal post tag links', () => {
        const parent = doc.createElement('div')
        const el = doc.createElement('a')
        const href = '/hive/@author/permlink'
        el.setAttribute('href', href)
        el.textContent = href
        parent.appendChild(el)

        a(el, false)

        expect(el.getAttribute('class')).toBe('markdown-post-link')
        expect(el.getAttribute('href')).toBe('/@author/permlink')
      })
    })
  })

  describe('video embeds', () => {
    describe('YouTube', () => {
      it('should create YouTube video embed', () => {
        const parent = doc.createElement('div')
        const el = doc.createElement('a')
        const href = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'
        el.setAttribute('href', href)
        el.textContent = href
        parent.appendChild(el)

        a(el, false)

        expect(el.getAttribute('class')).toContain('markdown-video-link')
        expect(el.getAttribute('class')).toContain('markdown-video-link-youtube')
        expect(el.getAttribute('data-embed-src')).toBe('https://www.youtube.com/embed/dQw4w9WgXcQ?autoplay=1')
        expect(el.getAttribute('data-youtube')).toBe('dQw4w9WgXcQ')
      })

      it('should embed inline without autoplay in waves (embedVideosDirectly)', () => {
        const parent = doc.createElement('div')
        const el = doc.createElement('a')
        const href = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'
        el.setAttribute('href', href)
        el.textContent = href
        parent.appendChild(el)

        a(el, false, 'ecency.com', undefined, { embedVideosDirectly: true })

        const iframe = el.getElementsByTagName('iframe')[0]
        expect(iframe).toBeTruthy()
        expect(iframe.getAttribute('src')).toBe('https://www.youtube.com/embed/dQw4w9WgXcQ')
        expect(iframe.getAttribute('src')).not.toContain('autoplay')
        expect(iframe.getAttribute('allow')).not.toContain('autoplay')
        // click-to-play path (non-waves) still autoplays after the user clicks
        expect(el.getAttribute('data-embed-src')).toBe('https://www.youtube.com/embed/dQw4w9WgXcQ?autoplay=1')
        expect(el.getAttribute('class')).toContain('er-youtube')
      })

      it('should handle youtu.be short URLs', () => {
        const parent = doc.createElement('div')
        const el = doc.createElement('a')
        const href = 'https://youtu.be/dQw4w9WgXcQ'
        el.setAttribute('href', href)
        el.textContent = href
        parent.appendChild(el)

        a(el, false)

        expect(el.getAttribute('class')).toContain('markdown-video-link-youtube')
        expect(el.getAttribute('data-youtube')).toBe('dQw4w9WgXcQ')
      })

      it('should handle YouTube shorts', () => {
        const parent = doc.createElement('div')
        const el = doc.createElement('a')
        const href = 'https://www.youtube.com/shorts/dQw4w9WgXcQ'
        el.setAttribute('href', href)
        el.textContent = href
        parent.appendChild(el)

        a(el, false)

        expect(el.getAttribute('class')).toContain('markdown-video-link-youtube')
        expect(el.getAttribute('data-youtube')).toBe('dQw4w9WgXcQ')
      })

      it('should extract start time from t parameter', () => {
        const parent = doc.createElement('div')
        const el = doc.createElement('a')
        const href = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=123'
        el.setAttribute('href', href)
        el.textContent = href
        parent.appendChild(el)

        a(el, false)

        expect(el.getAttribute('data-start-time')).toBe('123')
      })

      it('should extract start time from start parameter', () => {
        const parent = doc.createElement('div')
        const el = doc.createElement('a')
        const href = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ&start=456'
        el.setAttribute('href', href)
        el.textContent = href
        parent.appendChild(el)

        a(el, false)

        expect(el.getAttribute('data-start-time')).toBe('456')
      })

      it('should parse start time with s suffix', () => {
        const parent = doc.createElement('div')
        const el = doc.createElement('a')
        const href = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=123s'
        el.setAttribute('href', href)
        el.textContent = href
        parent.appendChild(el)

        a(el, false)

        expect(el.getAttribute('data-start-time')).toBe('123')
      })

      it('should add thumbnail image', () => {
        const parent = doc.createElement('div')
        const el = doc.createElement('a')
        const href = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'
        el.setAttribute('href', href)
        el.textContent = href
        parent.appendChild(el)

        a(el, false)

        const imgs = el.getElementsByTagName('img')
        expect(imgs.length).toBeGreaterThan(0)
        expect(imgs[0]?.getAttribute('src')).toContain('https://i.ecency.com')
      })

      it('should add play button', () => {
        const parent = doc.createElement('div')
        const el = doc.createElement('a')
        const href = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'
        el.setAttribute('href', href)
        el.textContent = href
        parent.appendChild(el)

        a(el, false)

        const spans = el.getElementsByTagName('span')
        expect(spans.length).toBeGreaterThan(0)
        expect(spans[0]?.getAttribute('class')).toBe('markdown-video-play')
      })

      it('should not process if text content differs', () => {
        const parent = doc.createElement('div')
        const el = doc.createElement('a')
        const href = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'
        el.setAttribute('href', href)
        el.textContent = 'Click here'
        parent.appendChild(el)

        a(el, false)

        expect(el.getAttribute('class')).not.toContain('markdown-video-link-youtube')
      })
    })

    describe('Vimeo', () => {
      it('should create Vimeo video embed', () => {
        const parent = doc.createElement('div')
        const el = doc.createElement('a')
        const href = 'https://vimeo.com/123456789'
        el.setAttribute('href', href)
        el.textContent = href
        parent.appendChild(el)

        a(el, false)

        expect(el.getAttribute('class')).toContain('markdown-video-link-vimeo')
        const iframes = el.getElementsByTagName('iframe')
        const iframe = iframes[0]
        expect(iframe).toBeTruthy()
        expect(iframe?.getAttribute('src')).toBe('https://player.vimeo.com/video/123456789')
      })

      it('should handle Vimeo video URLs', () => {
        const parent = doc.createElement('div')
        const el = doc.createElement('a')
        const href = 'https://vimeo.com/video/123456789'
        el.setAttribute('href', href)
        el.textContent = href
        parent.appendChild(el)

        a(el, false)

        expect(el.getAttribute('class')).toContain('markdown-video-link-vimeo')
      })

      it('should set iframe attributes', () => {
        const parent = doc.createElement('div')
        const el = doc.createElement('a')
        const href = 'https://vimeo.com/123456789'
        el.setAttribute('href', href)
        el.textContent = href
        parent.appendChild(el)

        a(el, false)

        const iframes = el.getElementsByTagName('iframe')
        const iframe = iframes[0]
        expect(iframe?.getAttribute('frameborder')).toBe('0')
        expect(iframe?.getAttribute('allowfullscreen')).toBe('true')
      })
    })

    describe('Twitch', () => {
      it('should create Twitch channel embed with parentDomain', () => {
        const parent = doc.createElement('div')
        const el = doc.createElement('a')
        const href = 'https://www.twitch.tv/channelname'
        el.setAttribute('href', href)
        el.textContent = href
        parent.appendChild(el)

        a(el, false, 'ecency.com')

        expect(el.getAttribute('class')).toContain('markdown-video-link-twitch')
        const iframes = el.getElementsByTagName('iframe')
        const iframe = iframes[0]
        expect(iframe?.getAttribute('src')).toBe('https://player.twitch.tv/?channel=channelname&parent=ecency.com')
      })

      it('should handle Twitch video URLs', () => {
        const parent = doc.createElement('div')
        const el = doc.createElement('a')
        const href = 'https://www.twitch.tv/videos/123456789'
        el.setAttribute('href', href)
        el.textContent = href
        parent.appendChild(el)

        a(el, false, 'ecency.com')

        const iframes = el.getElementsByTagName('iframe')
        const iframe = iframes[0]
        expect(iframe?.getAttribute('src')).toBe('https://player.twitch.tv/?video=123456789&parent=ecency.com')
      })

      it('should use default parentDomain if not provided', () => {
        const parent = doc.createElement('div')
        const el = doc.createElement('a')
        const href = 'https://www.twitch.tv/channelname'
        el.setAttribute('href', href)
        el.textContent = href
        parent.appendChild(el)

        a(el, false)

        const iframes = el.getElementsByTagName('iframe')
        const iframe = iframes[0]
        expect(iframe?.getAttribute('src')).toBe('https://player.twitch.tv/?channel=channelname&parent=ecency.com')
      })

      it('should handle Twitch without www', () => {
        const parent = doc.createElement('div')
        const el = doc.createElement('a')
        const href = 'https://twitch.tv/channelname'
        el.setAttribute('href', href)
        el.textContent = href
        parent.appendChild(el)

        a(el, false)

        const iframes = el.getElementsByTagName('iframe')
        const iframe = iframes[0]
        expect(iframe).toBeTruthy()
      })
    })

    describe('DTube', () => {
      it('should create DTube embed with hash format', () => {
        const parent = doc.createElement('div')
        const el = doc.createElement('a')
        const href = 'https://d.tube/#!/v/username/objectid'
        el.setAttribute('href', href)
        el.textContent = href
        parent.appendChild(el)

        a(el, false)

        expect(el.getAttribute('class')).toContain('markdown-video-link-dtube')
        expect(el.getAttribute('data-embed-src')).toBe('https://emb.d.tube/#!/username/objectid')
      })

      it('should create DTube embed with v format', () => {
        const parent = doc.createElement('div')
        const el = doc.createElement('a')
        const href = 'https://d.tube/v/username/objectid'
        el.setAttribute('href', href)
        el.textContent = href
        parent.appendChild(el)

        a(el, false)

        expect(el.getAttribute('class')).toContain('markdown-video-link-dtube')
        expect(el.getAttribute('data-embed-src')).toBe('https://emb.d.tube/#!/username/objectid')
      })

      it('should handle DTube with thumbnail image', () => {
        const parent = doc.createElement('div')
        const el = doc.createElement('a')
        const href = 'https://d.tube/#!/v/username/objectid'
        el.setAttribute('href', href)
        const img = doc.createElement('img')
        img.setAttribute('src', 'https://example.com/thumb.jpg')
        el.appendChild(img)
        parent.appendChild(el)

        a(el, false)

        const imgs = el.getElementsByTagName('img')
        expect(imgs.length).toBeGreaterThan(0)
        const spans = el.getElementsByTagName('span')
        expect(spans.length).toBeGreaterThan(0)
      })
    })

    describe('3Speak', () => {
      it('should create 3Speak embed', () => {
        const parent = doc.createElement('div')
        const el = doc.createElement('a')
        const href = 'https://3speak.tv/watch?v=username/permlink'
        el.setAttribute('href', href)
        el.textContent = href
        parent.appendChild(el)

        a(el, false)

        expect(el.getAttribute('class')).toContain('markdown-video-link-speak')
        expect(el.getAttribute('data-embed-src')).toBe('https://play.3speak.tv/watch?v=username/permlink&mode=iframe')
      })

      it('should embed inline without autoplay in waves (embedVideosDirectly)', () => {
        const parent = doc.createElement('div')
        const el = doc.createElement('a')
        const href = 'https://3speak.tv/watch?v=username/permlink'
        el.setAttribute('href', href)
        el.textContent = href
        parent.appendChild(el)

        a(el, false, 'ecency.com', undefined, { embedVideosDirectly: true })

        const iframe = el.getElementsByTagName('iframe')[0]
        expect(iframe).toBeTruthy()
        expect(iframe.getAttribute('src')).toContain('autoplay=false')
        expect(iframe.getAttribute('src')).not.toContain('autoplay=true')
        // click-to-play path (non-waves) keeps the player default via data-embed-src
        expect(el.getAttribute('data-embed-src')).toBe('https://play.3speak.tv/watch?v=username/permlink&mode=iframe')
        expect(el.getAttribute('class')).toContain('er-speak')
      })

      it('should handle 3Speak with thumbnail', () => {
        const parent = doc.createElement('div')
        const el = doc.createElement('a')
        const href = 'https://3speak.tv/watch?v=username/permlink'
        el.setAttribute('href', href)
        const img = doc.createElement('img')
        img.setAttribute('src', 'https://example.com/thumb.jpg')
        el.appendChild(img)
        parent.appendChild(el)

        a(el, false)

        const imgs = el.getElementsByTagName('img')
        expect(imgs.length).toBeGreaterThan(0)
      })
    })

    describe('3Speak Audio', () => {
      it('should create 3Speak audio embed from permlink URL', () => {
        const parent = doc.createElement('div')
        const el = doc.createElement('a')
        const href = 'https://audio.3speak.tv/play?a=m6crhwqw'
        el.setAttribute('href', href)
        el.textContent = href
        parent.appendChild(el)

        a(el, false)

        expect(el.getAttribute('class')).toContain('markdown-audio-link-speak')
        const iframes = el.getElementsByTagName('iframe')
        expect(iframes.length).toBe(1)
        const iframe = iframes[0]
        expect(iframe?.getAttribute('src')).toContain('https://audio.3speak.tv/play?a=m6crhwqw')
        expect(iframe?.getAttribute('src')).toContain('iframe=1')
        expect(iframe?.getAttribute('src')).toContain('mode=compact')
        expect(iframe?.getAttribute('sandbox')).toBe('allow-scripts allow-same-origin allow-popups')
      })

      it('should create 3Speak audio embed from CID URL', () => {
        const parent = doc.createElement('div')
        const el = doc.createElement('a')
        const href = 'https://audio.3speak.tv/play?cid=QmdMsEXyDe5Z4S3n8THfYgFP1iH3ngCeCytdHnndzqdZAK'
        el.setAttribute('href', href)
        el.textContent = href
        parent.appendChild(el)

        a(el, false)

        expect(el.getAttribute('class')).toContain('markdown-audio-link-speak')
        const iframes = el.getElementsByTagName('iframe')
        expect(iframes.length).toBe(1)
        expect(iframes[0]?.getAttribute('src')).toContain('cid=QmdMsEXyDe5Z4S3n8THfYgFP1iH3ngCeCytdHnndzqdZAK')
      })

      it('should not convert 3Speak audio link when text differs from href', () => {
        const parent = doc.createElement('div')
        const el = doc.createElement('a')
        const href = 'https://audio.3speak.tv/play?a=m6crhwqw'
        el.setAttribute('href', href)
        el.textContent = 'Click here to listen'
        parent.appendChild(el)

        a(el, false)

        // Should not be converted to audio embed
        expect(el.getAttribute('class')).not.toContain('markdown-audio-link-speak')
      })

      it('should preserve existing mode parameter in audio URL', () => {
        const parent = doc.createElement('div')
        const el = doc.createElement('a')
        const href = 'https://audio.3speak.tv/play?a=m6crhwqw&mode=minimal'
        el.setAttribute('href', href)
        el.textContent = href
        parent.appendChild(el)

        a(el, false)

        const iframes = el.getElementsByTagName('iframe')
        expect(iframes[0]?.getAttribute('src')).toContain('mode=minimal')
        expect(iframes[0]?.getAttribute('src')).not.toContain('mode=compact')
      })
    })

    describe('Spotify', () => {
      it('should create Spotify embed', () => {
        const parent = doc.createElement('div')
        const el = doc.createElement('a')
        const href = 'https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M'
        el.setAttribute('href', href)
        el.textContent = href
        parent.appendChild(el)

        a(el, false)

        expect(el.getAttribute('class')).toContain('markdown-audio-link-spotify')
        const iframes = el.getElementsByTagName('iframe')
        const iframe = iframes[0]
        expect(iframe?.getAttribute('src')).toBe('https://open.spotify.com/embed/playlist/37i9dQZF1DXcBWIGoYBM5M')
        expect(iframe?.getAttribute('sandbox')).toBe('allow-scripts allow-same-origin allow-popups')
      })
    })

    describe('Loom', () => {
      it('should create Loom embed', () => {
        const parent = doc.createElement('div')
        const el = doc.createElement('a')
        const href = 'https://www.loom.com/share/abc123def456'
        el.setAttribute('href', href)
        el.textContent = href
        parent.appendChild(el)

        a(el, false)

        expect(el.getAttribute('class')).toContain('markdown-video-link-loom')
        const iframes = el.getElementsByTagName('iframe')
        const iframe = iframes[0]
        expect(iframe?.getAttribute('src')).toBe('https://www.loom.com/embed/abc123def456')
        expect(iframe?.getAttribute('sandbox')).toBe('allow-scripts allow-same-origin allow-popups')
      })
    })

    describe('Rumble', () => {
      it('should create Rumble embed', () => {
        const parent = doc.createElement('div')
        const el = doc.createElement('a')
        const href = 'https://rumble.com/embed/v1abc23/?pub=4'
        el.setAttribute('href', href)
        el.textContent = href
        parent.appendChild(el)

        a(el, false)

        expect(el.getAttribute('class')).toContain('markdown-video-link')
        expect(el.getAttribute('data-embed-src')).toBe('https://www.rumble.com/embed/v1abc23/?pub=4')
      })
    })

    describe('Brighteon', () => {
      it('should create Brighteon embed', () => {
        const parent = doc.createElement('div')
        const el = doc.createElement('a')
        const href = 'https://www.brighteon.com/embed/abc123'
        el.setAttribute('href', href)
        el.textContent = href
        parent.appendChild(el)

        a(el, false)

        expect(el.getAttribute('class')).toContain('markdown-video-link')
        expect(el.getAttribute('data-embed-src')).toBe('https://www.brighteon.com/embed/abc123')
      })
    })

    describe('Bitchute', () => {
      it('should create Bitchute embed', () => {
        const parent = doc.createElement('div')
        const el = doc.createElement('a')
        const href = 'https://www.bitchute.com/video/abc123def/'
        el.setAttribute('href', href)
        el.textContent = href
        parent.appendChild(el)

        a(el, false)

        expect(el.getAttribute('class')).toContain('markdown-video-link')
        expect(el.getAttribute('data-embed-src')).toBe('https://www.bitchute.com/embed/abc123def/')
      })
    })

    // The stylesheet and the click-to-play extension both select on the
    // per-provider modifier class. Emitting only the base class rendered these
    // three as an invisible, inert anchor.
    describe('per-provider modifier class', () => {
      it.each([
        ['https://www.bitchute.com/video/abc123def/', 'markdown-video-link-bitchute'],
        ['https://rumble.com/embed/v1abc23/?pub=4', 'markdown-video-link-rumble'],
        ['https://www.brighteon.com/embed/abc123', 'markdown-video-link-brighteon'],
        ['https://odysee.com/@channel:2/video-title:e', 'markdown-video-link-odysee']
      ])('tags %s with %s', (href, modifier) => {
        const parent = doc.createElement('div')
        const el = doc.createElement('a')
        el.setAttribute('href', href)
        el.textContent = href
        parent.appendChild(el)

        a(el, false)

        expect(el.getAttribute('class')).toContain('markdown-video-link')
        expect(el.getAttribute('class')).toContain(modifier)
      })

      it.each([
        ['https://www.bitchute.com/video/abc123def/', 'https://www.bitchute.com/embed/abc123def/'],
        ['https://rumble.com/embed/v1abc23/?pub=4', 'https://www.rumble.com/embed/v1abc23/?pub=4'],
        ['https://www.brighteon.com/embed/abc123', 'https://www.brighteon.com/embed/abc123'],
        [
          'https://odysee.com/@channel:2/video-title:e',
          'https://odysee.com/$/embed/@channel:2/video-title:e'
        ]
      ])('embeds %s directly when the enhancer will not run', (href, embedSrc) => {
        const parent = doc.createElement('div')
        const el = doc.createElement('a')
        el.setAttribute('href', href)
        el.textContent = href
        parent.appendChild(el)

        a(el, false, 'ecency.com', undefined, { embedVideosDirectly: true })

        const frames = el.getElementsByTagName('iframe')
        expect(frames.length).toBe(1)
        expect(frames[0]?.getAttribute('src')).toBe(embedSrc)
      })
    })

    describe('Odysee', () => {
      it('should embed a channel-scoped watch link', () => {
        const parent = doc.createElement('div')
        const el = doc.createElement('a')
        const href = 'https://odysee.com/@whatsherface:2/Battle-of-the-Sexes:e'
        el.setAttribute('href', href)
        el.textContent = href
        parent.appendChild(el)

        a(el, false)

        expect(el.getAttribute('class')).toContain('markdown-video-link-odysee')
        expect(el.getAttribute('href')).toBeNull()
        expect(el.getAttribute('data-embed-src')).toBe(
          'https://odysee.com/$/embed/@whatsherface:2/Battle-of-the-Sexes:e'
        )
        expect(el.getElementsByTagName('span')[0]?.getAttribute('class')).toBe(
          'markdown-video-play'
        )
      })

      it('should embed a claim posted outside a channel', () => {
        const parent = doc.createElement('div')
        const el = doc.createElement('a')
        const href = 'https://odysee.com/video-title:a'
        el.setAttribute('href', href)
        el.textContent = href
        parent.appendChild(el)

        a(el, false)

        expect(el.getAttribute('data-embed-src')).toBe('https://odysee.com/$/embed/video-title:a')
      })

      // A title containing "YouTube" previously read as a YouTube link to the
      // sanitizer and got dropped as unsupported (issue #219).
      it('should embed a watch link whose title contains "YouTube"', () => {
        const parent = doc.createElement('div')
        const el = doc.createElement('a')
        const href = 'https://odysee.com/@whatsherface:2/YouTube-HATES-me!:0'
        el.setAttribute('href', href)
        el.textContent = href
        parent.appendChild(el)

        a(el, false)

        expect(el.getAttribute('data-embed-src')).toBe(
          'https://odysee.com/$/embed/@whatsherface:2/YouTube-HATES-me!:0'
        )
      })

      it('should drop a tracking query string from the embed URL', () => {
        const parent = doc.createElement('div')
        const el = doc.createElement('a')
        const href = 'https://odysee.com/@channel:2/video:e?r=H6VBbPfXH21Z'
        el.setAttribute('href', href)
        el.textContent = href
        parent.appendChild(el)

        a(el, false)

        expect(el.getAttribute('data-embed-src')).toBe(
          'https://odysee.com/$/embed/@channel:2/video:e'
        )
      })

      // Waves and the self-hosted blog set embedVideosDirectly and mount no
      // click-to-play enhancer, so a placeholder there would never play.
      it('should emit a real iframe when embedVideosDirectly is set', () => {
        const parent = doc.createElement('div')
        const el = doc.createElement('a')
        const href = 'https://odysee.com/@channel:2/video:e'
        el.setAttribute('href', href)
        el.textContent = href
        parent.appendChild(el)

        a(el, false, 'ecency.com', undefined, { embedVideosDirectly: true })

        const frames = el.getElementsByTagName('iframe')
        expect(frames.length).toBe(1)
        expect(frames[0]?.getAttribute('src')).toBe(
          'https://odysee.com/$/embed/@channel:2/video:e'
        )
        // No autoplay: a feed must not start several videos at once.
        expect(frames[0]?.getAttribute('src')).not.toContain('autoplay')
        expect(el.getAttribute('class')).toContain('er-embed')
        expect(el.getElementsByTagName('span').length).toBe(1)
        expect(el.getElementsByTagName('span')[0]?.getAttribute('class')).toBe('er-embed-frame')
      })

      it('should leave a bare channel page as an ordinary link', () => {
        const parent = doc.createElement('div')
        const el = doc.createElement('a')
        const href = 'https://odysee.com/@whatsherface:2'
        el.setAttribute('href', href)
        el.textContent = href
        parent.appendChild(el)

        a(el, false)

        expect(el.getAttribute('class')).not.toContain('markdown-video-link')
        expect(el.getAttribute('href')).toBe(href)
      })

      it('should leave an already-embed URL alone', () => {
        const parent = doc.createElement('div')
        const el = doc.createElement('a')
        const href = 'https://odysee.com/$/embed/@channel:2/video:e'
        el.setAttribute('href', href)
        el.textContent = href
        parent.appendChild(el)

        a(el, false)

        expect(el.getAttribute('data-embed-src')).toBeNull()
      })

      // Only a link whose text is the bare URL becomes a player; a labelled
      // link keeps its label, matching every other provider.
      it('should not embed a labelled link', () => {
        const parent = doc.createElement('div')
        const el = doc.createElement('a')
        const href = 'https://odysee.com/@channel:2/video:e'
        el.setAttribute('href', href)
        el.textContent = 'watch this'
        parent.appendChild(el)

        a(el, false)

        expect(el.getAttribute('class')).not.toContain('markdown-video-link')
        expect(el.textContent).toBe('watch this')
      })
    })
  })

  describe('Twitter/X embeds', () => {
    it('should create Twitter embed blockquote', () => {
      const parent = doc.createElement('div')
      const el = doc.createElement('a')
      const href = 'https://twitter.com/username/status/123456789'
      el.setAttribute('href', href)
      el.textContent = href
      parent.appendChild(el)

      a(el, false)

      const blockquotes = parent.getElementsByTagName('blockquote')
      expect(blockquotes.length).toBe(1)
      expect(blockquotes[0]?.getAttribute('class')).toBe('twitter-tweet')
      const paragraphs = blockquotes[0]?.getElementsByTagName('p')
      expect(paragraphs?.[0]?.textContent).toBe(href)
      const links = blockquotes[0]?.getElementsByTagName('a')
      expect(links?.[0]?.textContent).toBe('username')
    })

    it('should sanitize Twitter author name', () => {
      const parent = doc.createElement('div')
      const el = doc.createElement('a')
      const href = 'https://twitter.com/user<script>alert(1)</script>/status/123'
      el.setAttribute('href', href)
      el.textContent = href
      parent.appendChild(el)

      a(el, false)

      const blockquotes = parent.getElementsByTagName('blockquote')
      const links = blockquotes[0]?.getElementsByTagName('a')
      // textContent automatically escapes, so the script tag should be escaped
      expect(links?.[0]?.textContent).not.toContain('<script>')
    })
  })

  describe('special Hive links', () => {
    describe('witness voting links', () => {
      it('should handle HiveSigner witness vote links in app mode', () => {
        const parent = doc.createElement('div')
        const el = doc.createElement('a')
        const href = 'https://hivesigner.com/sign/account-witness-vote?witness=goodwitness'
        el.setAttribute('href', href)
        el.textContent = 'Vote for witness'
        parent.appendChild(el)

        a(el, true)

        expect(el.getAttribute('class')).toBe('markdown-witnesses-link')
        expect(el.getAttribute('data-href')).toBe(href)
        expect(el.getAttribute('href')).toBeNull()
      })

      it('should not process witness links in web mode', () => {
        const parent = doc.createElement('div')
        const el = doc.createElement('a')
        const href = 'https://hivesigner.com/sign/account-witness-vote?witness=goodwitness'
        el.setAttribute('href', href)
        el.textContent = 'Vote for witness'
        parent.appendChild(el)

        a(el, false)

        expect(el.getAttribute('class')).toBe('markdown-external-link')
      })
    })

    describe('proposal voting links', () => {
      it('should handle proposal vote links in app mode', () => {
        const parent = doc.createElement('div')
        const el = doc.createElement('a')
        const href = 'https://hivesigner.com/sign/update-proposal-votes?proposal_ids=[123]'
        el.setAttribute('href', href)
        el.textContent = 'Vote for proposal'
        parent.appendChild(el)

        a(el, true)

        expect(el.getAttribute('class')).toBe('markdown-proposal-link')
        expect(el.getAttribute('data-href')).toBe(href)
        expect(el.getAttribute('data-proposal')).toBe('123')
        expect(el.getAttribute('href')).toBeNull()
      })

      it('should handle malformed proposal URIs gracefully', () => {
        const parent = doc.createElement('div')
        const el = doc.createElement('a')
        const href = 'https://hivesigner.com/sign/update-proposal-votes?proposal_ids=%ZZinvalid'
        el.setAttribute('href', href)
        el.textContent = 'Vote'
        parent.appendChild(el)

        expect(() => a(el, true)).not.toThrow()
      })
    })
  })

  describe('external links', () => {
    it('should mark external links with class', () => {
      const parent = doc.createElement('div')
      const el = doc.createElement('a')
      const href = 'https://example.com'
      el.setAttribute('href', href)
      el.textContent = 'Example'
      parent.appendChild(el)

      a(el, false)

      expect(el.getAttribute('class')).toBe('markdown-external-link')
      expect(el.getAttribute('target')).toBe('_blank')
      expect(el.getAttribute('rel')).toBe('nofollow ugc noopener')
    })

    it('should allow follow for high-reputation authors with significant payout', () => {
      const parent = doc.createElement('div')
      const el = doc.createElement('a')
      el.setAttribute('href', 'https://example.com')
      el.textContent = 'Example'
      parent.appendChild(el)

      a(el, false, 'ecency.com', { authorReputation: 60, postPayout: 10 })

      expect(el.getAttribute('class')).toBe('markdown-external-link')
      expect(el.getAttribute('rel')).toBe('noopener')
    })

    it('should nofollow for high-reputation authors with low payout', () => {
      const parent = doc.createElement('div')
      const el = doc.createElement('a')
      el.setAttribute('href', 'https://example.com')
      el.textContent = 'Example'
      parent.appendChild(el)

      a(el, false, 'ecency.com', { authorReputation: 60, postPayout: 3 })

      expect(el.getAttribute('rel')).toBe('nofollow ugc noopener')
    })

    it('should nofollow for low-reputation authors with high payout', () => {
      const parent = doc.createElement('div')
      const el = doc.createElement('a')
      el.setAttribute('href', 'https://example.com')
      el.textContent = 'Example'
      parent.appendChild(el)

      a(el, false, 'ecency.com', { authorReputation: 30, postPayout: 20 })

      expect(el.getAttribute('rel')).toBe('nofollow ugc noopener')
    })

    it('should prepend https to URLs without protocol', () => {
      const parent = doc.createElement('div')
      const el = doc.createElement('a')
      const href = 'example.com'
      el.setAttribute('href', href)
      el.textContent = 'Example'
      parent.appendChild(el)

      a(el, false)

      expect(el.getAttribute('href')).toBe('https://example.com')
    })

    it('should not double-prepend https to a mixed-case Https:// scheme', () => {
      const parent = doc.createElement('div')
      const el = doc.createElement('a')
      const href = 'Https://dealstreets.xyz'
      el.setAttribute('href', href)
      el.textContent = 'Https://dealstreets.xyz'
      parent.appendChild(el)

      a(el, false)

      expect(el.getAttribute('href')).toBe('Https://dealstreets.xyz')
    })

    it('should not double-prepend https to an uppercase HTTP:// scheme', () => {
      const parent = doc.createElement('div')
      const el = doc.createElement('a')
      const href = 'HTTP://example.com/path'
      el.setAttribute('href', href)
      el.textContent = 'HTTP://example.com/path'
      parent.appendChild(el)

      a(el, false)

      expect(el.getAttribute('href')).toBe('HTTP://example.com/path')
    })

    it('should not prepend https to mailto links', () => {
      const parent = doc.createElement('div')
      const el = doc.createElement('a')
      const href = 'mailto:test@example.com'
      el.setAttribute('href', href)
      el.textContent = 'Email'
      parent.appendChild(el)

      a(el, false)

      expect(el.getAttribute('href')).toBe('mailto:test@example.com')
    })

    it('should not prepend https to hash anchors', () => {
      const parent = doc.createElement('div')
      const el = doc.createElement('a')
      const href = '#section'
      el.setAttribute('href', href)
      el.textContent = 'Section'
      parent.appendChild(el)

      a(el, false)

      expect(el.getAttribute('href')).toBe('#section')
    })

    it('should handle internal paths starting with /', () => {
      const parent = doc.createElement('div')
      const el = doc.createElement('a')
      const href = '/about'
      el.setAttribute('href', href)
      el.textContent = 'About'
      parent.appendChild(el)

      a(el, false)

      expect(el.getAttribute('href')).toBe('/about')
    })

    it('should set data-href in app mode for external links', () => {
      const parent = doc.createElement('div')
      const el = doc.createElement('a')
      const href = 'https://example.com'
      el.setAttribute('href', href)
      el.textContent = 'Example'
      parent.appendChild(el)

      a(el, true)

      expect(el.getAttribute('data-href')).toBe(href)
      expect(el.getAttribute('href')).toBeNull()
    })

    it('should detect YouTube in external links for app mode', () => {
      const parent = doc.createElement('div')
      const el = doc.createElement('a')
      const href = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'
      el.setAttribute('href', href)
      el.textContent = 'Video link'
      parent.appendChild(el)

      a(el, true)

      expect(el.getAttribute('data-youtube')).toBe('dQw4w9WgXcQ')
    })

    it('should handle section regex for internal links', () => {
      const parent = doc.createElement('div')
      const el = doc.createElement('a')
      const href = '#my-section'
      el.setAttribute('href', href)
      el.textContent = 'Section'
      parent.appendChild(el)

      a(el, false)

      expect(el.getAttribute('class')).toBe('markdown-internal-link')
    })
  })

  describe('image format', () => {
    it('should always use match format for images', () => {
      const parent = doc.createElement('div')
      const el = doc.createElement('a')
      const imageUrl = 'https://example.com/image.jpg'
      el.setAttribute('href', imageUrl)
      el.textContent = imageUrl
      parent.appendChild(el)

      a(el, false)

      const imgs = parent.getElementsByTagName('img')
      const img = imgs[0]
      expect(img?.getAttribute('src')).toContain('format=match')
      expect(img?.getAttribute('src')).not.toContain('format=webp')
    })

    it('should always use match format for YouTube thumbnails', () => {
      const parent = doc.createElement('div')
      const el = doc.createElement('a')
      const href = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'
      el.setAttribute('href', href)
      el.textContent = href
      parent.appendChild(el)

      a(el, false)

      const imgs = el.getElementsByTagName('img')
      const img = imgs[0]
      expect(img?.getAttribute('src')).toContain('format=match')
      expect(img?.getAttribute('src')).not.toContain('format=webp')
    })
  })

  describe('whitespace handling', () => {
    it('should trim href values for comparison', () => {
      const parent = doc.createElement('div')
      const el = doc.createElement('a')
      const href = 'https://ecency.com/@username'
      el.setAttribute('href', href)
      el.textContent = href
      parent.appendChild(el)

      a(el, false)

      expect(el.getAttribute('class')).toBe('markdown-author-link')
    })

    it('should handle trimmed text content', () => {
      const parent = doc.createElement('div')
      const el = doc.createElement('a')
      const href = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'
      el.setAttribute('href', href)
      el.textContent = `  ${href}  `
      parent.appendChild(el)

      a(el, false)

      expect(el.getAttribute('class')).toContain('markdown-video-link-youtube')
    })
  })

  describe('complex scenarios', () => {
    it('should handle post links with complex permlinks', () => {
      const parent = doc.createElement('div')
      const el = doc.createElement('a')
      const href = 'https://ecency.com/hive/@author/my-post-title-2024'
      el.setAttribute('href', href)
      el.textContent = href
      parent.appendChild(el)

      a(el, false)

      expect(el.getAttribute('class')).toBe('markdown-post-link')
      expect(el.getAttribute('href')).toBe('/@author/my-post-title-2024')
    })

    it('should handle usernames with dots', () => {
      const parent = doc.createElement('div')
      const el = doc.createElement('a')
      const href = 'https://ecency.com/@user.name'
      el.setAttribute('href', href)
      el.textContent = href
      parent.appendChild(el)

      a(el, false)

      expect(el.getAttribute('class')).toBe('markdown-author-link')
      expect(el.getAttribute('href')).toBe('/@user.name')
    })

    it('should handle usernames with hyphens', () => {
      const parent = doc.createElement('div')
      const el = doc.createElement('a')
      const href = 'https://ecency.com/@user-name'
      el.setAttribute('href', href)
      el.textContent = href
      parent.appendChild(el)

      a(el, false)

      expect(el.getAttribute('class')).toBe('markdown-author-link')
      expect(el.getAttribute('href')).toBe('/@user-name')
    })

    it('should handle permlinks with hyphens and numbers', () => {
      const parent = doc.createElement('div')
      const el = doc.createElement('a')
      const href = 'https://ecency.com/hive/@author/post-title-123-test'
      el.setAttribute('href', href)
      el.textContent = href
      parent.appendChild(el)

      a(el, false)

      expect(el.getAttribute('class')).toBe('markdown-post-link')
    })
  })
})

describe('link and embed hardening', () => {
  let n = 0;
  const render = (body: string) =>
    renderPostBody({ author: `a${++n}`, permlink: `p${n}`, body, json_metadata: {} } as any, false);

  it('does not embed look-alike hosts whose dots were regex metacharacters', () => {
    // The host patterns used literal dots, so 'emb-d.tube' and 'embed-truvvl.com' —
    // both registrable, .tube is a real gTLD — matched and were framed.
    expect(render('<iframe src="https://embxd.tube/#!/a/b"></iframe>')).not.toContain('<iframe');
    expect(render('<iframe src="https://embedxtruvvl.com/@a/b"></iframe>')).not.toContain('<iframe');
    expect(render('<iframe src="https://emb-d.tube/#!/a/b"></iframe>')).not.toContain('<iframe');
  });

  it('still embeds the genuine hosts', () => {
    expect(render('<iframe src="https://emb.d.tube/#!/a/b"></iframe>')).toContain('<iframe');
    expect(render('<iframe src="https://embed.truvvl.com/@a/b"></iframe>')).toContain('<iframe');
  });

  it('does not let an author-supplied class opt a link out of the rel policy', () => {
    // 'class' is writable on raw HTML, so it cannot be treated as proof the renderer
    // built the link; rel="opener" would otherwise re-enable window.opener.
    const out = render('<a class="er-author" href="https://evil.com/" target="_blank" rel="opener">x</a>');
    expect(out).not.toContain('rel="opener"');
    expect(out).toContain('noopener');
  });

  it('keeps an external link external when it ends in a fragment', () => {
    // A '#' anywhere used to mark the link internal, dropping nofollow/ugc and target.
    const out = render('[x](https://evil.com/#promo)');
    expect(out).toContain('rel="nofollow ugc noopener"');
    expect(out).toContain('target="_blank"');
    expect(out).not.toContain('markdown-internal-link');
  });

  it('still treats a same-document fragment as an internal link', () => {
    expect(render('[x](#section-one)')).toContain('markdown-internal-link');
  });
});
