import multihash from 'multihashes'
import { proxifyImageSrc, buildSrcSet, setProxyBase, getLatestUrl, extractPHash, buildSrcSetForFormat, buildPictureSources, isPictureEligibleRawUrl, isLegacySizedProxyUrl } from './proxify-image-src'

describe('getLatestUrl', () => {
  describe('with single proxification', () => {
    it('should return original URL when not proxified', () => {
      const input = 'https://i.imgur.com/muESb0B.png'

      expect(getLatestUrl(input)).toBe('https://i.imgur.com/muESb0B.png')
    })

    it('should extract URL from single proxification layer', () => {
      const input = 'https://i.ecency.com/0x0/https://i.imgur.com/muESb0B.png'

      expect(getLatestUrl(input)).toBe('https://i.imgur.com/muESb0B.png')
    })
  })

  describe('with nested proxification', () => {
    it('should extract deepest nested URL from multiple proxy layers', () => {
      const input = 'https://i.ecency.com/0x0/https://images.hive.io/0x0/https://i.imgur.com/muESb0B.png'

      expect(getLatestUrl(input)).toBe('https://i.imgur.com/muESb0B.png')
    })
  })
})

describe('extractPHash', () => {
  it('should extract pHash from proxified URL', () => {
    const input = 'https://i.ecency.com/p/RGgukq5E6HBNvuPpuJoWwfXPpi5ckcLESTB3nmmnMt8YnPwgHbJegFaUzokkErqT8JVe4zPL7GD3gy6aaZQERs3MF5KAGJQ1AL4MmhLWfmceyk6XXSqWaECh1YXC7aV.png?format=match&mode=fit'

    expect(extractPHash(input)).toBe('RGgukq5E6HBNvuPpuJoWwfXPpi5ckcLESTB3nmmnMt8YnPwgHbJegFaUzokkErqT8JVe4zPL7GD3gy6aaZQERs3MF5KAGJQ1AL4MmhLWfmceyk6XXSqWaECh1YXC7aV')
  })

  it('should return null when no pHash present', () => {
    const input = 'https://i.imgur.com/muESb0B.png'

    expect(extractPHash(input)).toBe(null)
  })

  it('should extract pHash from a legacy images.ecency.com/p/ URL', () => {
    setProxyBase('https://i.ecency.com')
    const hash = '2bP4pJr4wVimqCWjYimXJe2cnCgnJdyHYxb4dfF6gmC'

    expect(extractPHash(`https://images.ecency.com/p/${hash}?format=match&mode=fit`)).toBe(hash)
  })
})

describe('proxifyImageSrc', () => {
  describe('basic proxification', () => {
    it('should proxify image URL without file extension', () => {
      setProxyBase('https://i.ecency.com')
      const input = 'https://i.imgur.com/muESb0B.png'
      const expected = 'https://i.ecency.com/p/2bP4pJr4wVimqCWjYimXJe2cnCgnJdyHYxb4dfF6gmC?format=match&mode=fit'

      expect(proxifyImageSrc(input)).toBe(expected)
    })

    it('should re-proxify already proxified URL', () => {
      const input = 'https://i.ecency.com/0x0/https://i.imgur.com/muESb0B.png'
      const expected = 'https://i.ecency.com/p/2bP4pJr4wVimqCWjYimXJe2cnCgnJdyHYxb4dfF6gmC?format=match&mode=fit'

      expect(proxifyImageSrc(input)).toBe(expected)
    })

    it('should always use format=match regardless of format parameter', () => {
      const input = 'https://i.imgur.com/muESb0B.png'
      const result = proxifyImageSrc(input, 0, 0, 'webp')

      expect(result).toContain('format=match')
      expect(result).not.toContain('format=webp')
      expect(result).not.toContain('.webp')
      expect(result).not.toContain('.png')
    })
  })

  describe('custom proxy base', () => {
    it('should use custom proxy base URL', () => {
      setProxyBase('https://images.hive.blog')

      const input = 'https://i.imgur.com/muESb0B.png'
      const expected = 'https://images.hive.blog/p/2bP4pJr4wVimqCWjYimXJe2cnCgnJdyHYxb4dfF6gmC?format=match&mode=fit'

      expect(proxifyImageSrc(input)).toBe(expected)
    })

    it('should replace existing proxy base with new one', () => {
      setProxyBase('https://i.ecency.com')
      const input = 'https://images.hive.blog/60x70/http://hivebuzz.me/@hiveonboard/upvotes.png?202008050233'
      const expected = 'https://i.ecency.com/60x70/http://hivebuzz.me/@hiveonboard/upvotes.png?202008050233'

      expect(proxifyImageSrc(input)).toBe(expected)
    })

    it('should host-swap legacy images.ecency.com /p/ URLs to the proxy base', () => {
      setProxyBase('https://i.ecency.com')
      const input = 'https://images.ecency.com/p/2bP4pJr4wVimqCWjYimXJe2cnCgnJdyHYxb4dfF6gmC?format=match&mode=fit'
      const expected = 'https://i.ecency.com/p/2bP4pJr4wVimqCWjYimXJe2cnCgnJdyHYxb4dfF6gmC?format=match&mode=fit'

      expect(proxifyImageSrc(input)).toBe(expected)
    })

    it('should host-swap legacy images.ecency.com avatar URLs to the proxy base', () => {
      setProxyBase('https://i.ecency.com')
      const input = 'https://images.ecency.com/u/pizzabot/avatar/small'

      expect(proxifyImageSrc(input)).toBe('https://i.ecency.com/u/pizzabot/avatar/small')
    })
  })

  describe('with uploaded images', () => {
    it('should proxify uploaded image URL without file extension', () => {
      setProxyBase('https://i.ecency.com')
      const input = 'https://images.hive.blog/DQmT7UTd6JTP3bB2fXzV6tv8u4cJ6fLijy2bUxatkLChzHD/IMG_6631.JPG'
      const expected = 'https://i.ecency.com/p/Zskj9C56UonZ32EJw6nMctrTQ6kTQ3swaDmbMFtRtMzyrHs9JdvWTXeiP6cW6a7F6pv2A4qkeHLiAPVtmfYMDf3iYbydFZ7e8iYY4MZP74TgyWo8WnJa?format=match&mode=fit'

      expect(proxifyImageSrc(input)).toBe(expected)
    })
  })
})

describe('buildSrcSet', () => {
  beforeEach(() => {
    setProxyBase('https://i.ecency.com')
  })

  it('should return empty string for falsy input', () => {
    expect(buildSrcSet('')).toBe('')
    expect(buildSrcSet(undefined)).toBe('')
  })

  it('should generate srcset with width descriptors for a raw image URL', () => {
    const result = buildSrcSet('https://i.imgur.com/muESb0B.png')

    expect(result).toContain('320w')
    expect(result).toContain('600w')
    expect(result).toContain('800w')
    expect(result).toContain('1024w')
    expect(result).toContain('1280w')
    expect(result.split(', ')).toHaveLength(5)
  })

  it('should include width parameter in each srcset entry', () => {
    const result = buildSrcSet('https://i.imgur.com/muESb0B.png')
    const entries = result.split(', ')

    for (const entry of entries) {
      expect(entry).toMatch(/width=\d+/)
      expect(entry).toContain('format=match')
      expect(entry).toContain('mode=fit')
    }
  })

  it('should handle already-proxied URLs by extracting hash', () => {
    const hash = '2bP4pJr4wVimqCWjYimXJe2cnCgnJdyHYxb4dfF6gmC'
    const input = `https://i.ecency.com/p/${hash}?format=match&mode=fit`
    const result = buildSrcSet(input)

    expect(result).toContain(`/p/${hash}?format=match&mode=fit&width=320 320w`)
    expect(result).toContain(`/p/${hash}?format=match&mode=fit&width=1280 1280w`)
  })

  it('should normalize legacy proxied URLs with file extensions', () => {
    setProxyBase('https://i.ecency.com')
    const hash = 'RGgukq5E6HBNvuPpuJoWwfXPpi5ckcLESTB3nmmnMt8YnPwgHbJegFaUzokkErqT8JVe4zPL7GD3gy6aaZQERs3MF5KAGJQ1AL4MmhLWfmceyk6XXSqWaECh1YXC7aV'
    const input = `https://i.ecency.com/p/${hash}.png?format=match&mode=fit`
    const result = buildSrcSet(input)

    expect(result).toContain(`/p/${hash}?format=match&mode=fit&width=320 320w`)
    expect(result).toContain(`/p/${hash}?format=match&mode=fit&width=1280 1280w`)
    expect(result).not.toContain('.png')
  })

  it('should use custom proxy base for already-proxied URLs', () => {
    setProxyBase('https://images.hive.blog')
    const hash = 'someHash123'
    const input = `https://images.hive.blog/p/${hash}?format=match&mode=fit`
    const result = buildSrcSet(input)

    expect(result).toContain('https://images.hive.blog/p/someHash123')
    expect(result).not.toContain('i.ecency.com')
  })
})

describe('proxifyImageSrc transform-aware unwind (images.ecency.com uploads)', () => {
  const upload = 'https://images.ecency.com/DQmfEjdTaDpofgAtbPjUjkT9uNKK3gR7n1PeHT3QJAYeXwq/img_0402.jpg'

  beforeEach(() => {
    setProxyBase('https://i.ecency.com')
  })

  it('should hostname-swap to direct-serve when no transform is requested', () => {
    // Plain full-size fetch: the direct-serve route is correct and avoids a
    // proxy self-fetch. This preserves the SNI-resilient hostname swap.
    expect(proxifyImageSrc(upload)).toBe(
      'https://i.ecency.com/DQmfEjdTaDpofgAtbPjUjkT9uNKK3gR7n1PeHT3QJAYeXwq/img_0402.jpg'
    )
  })

  it('should route through /p/ when a width is requested (so resize actually applies)', () => {
    const result = proxifyImageSrc(upload, 600)

    expect(result).toMatch(/^https:\/\/i\.ecency\.com\/p\//)
    expect(result).not.toContain('/DQm')
    expect(result).toContain('width=600')
    expect(result).toContain('format=match')
    expect(result).toContain('mode=fit')
  })

  it('should route through /p/ when a height is requested', () => {
    const result = proxifyImageSrc(upload, 0, 400)

    expect(result).toMatch(/^https:\/\/i\.ecency\.com\/p\//)
    expect(result).toContain('height=400')
  })

  it('should route through /p/ and emit blur=1 for a blur placeholder', () => {
    const result = proxifyImageSrc(upload, 0, 0, 'match', { blur: true })

    expect(result).toMatch(/^https:\/\/i\.ecency\.com\/p\//)
    expect(result).not.toContain('/DQm')
    expect(result).toContain('blur=1')
  })

  it('should emit blur=1 for an already-direct i.ecency.com upload URL', () => {
    // catchPostImage(entry, 0, 0) hands us the already-unwound direct URL;
    // re-proxifying it with blur must still produce a /p/ transform URL.
    const direct = 'https://i.ecency.com/DQmfEjdTaDpofgAtbPjUjkT9uNKK3gR7n1PeHT3QJAYeXwq/img_0402.jpg'
    const result = proxifyImageSrc(direct, 0, 0, 'match', { blur: true })

    expect(result).toMatch(/^https:\/\/i\.ecency\.com\/p\//)
    expect(result).toContain('blur=1')
  })

  it('should not affect non-upload images (blur still proxifies a plain URL)', () => {
    const result = proxifyImageSrc('https://i.imgur.com/muESb0B.png', 0, 0, 'match', { blur: true })

    expect(result).toContain('blur=1')
    expect(result).toMatch(/^https:\/\/i\.ecency\.com\/p\//)
  })

  it('should route an unsized upload through /p/ for format negotiation when forceProxy is set', () => {
    // No width/height, but forceProxy → /p/ (so the server negotiates WebP/AVIF)
    // rather than the original-format direct-serve URL.
    const result = proxifyImageSrc(upload, 0, 0, 'match', { forceProxy: true })

    expect(result).toMatch(/^https:\/\/i\.ecency\.com\/p\//)
    expect(result).not.toContain('/DQm')
    expect(result).toContain('format=match')
    expect(result).not.toContain('width=')
    expect(result).not.toContain('blur=')
  })

  it('should still direct-serve an unsized upload without forceProxy (OG/social path)', () => {
    expect(proxifyImageSrc(upload)).toBe(
      'https://i.ecency.com/DQmfEjdTaDpofgAtbPjUjkT9uNKK3gR7n1PeHT3QJAYeXwq/img_0402.jpg'
    )
  })

  it('should reuse the hash of a legacy images.ecency.com/p/ URL instead of double-proxying (forceProxy)', () => {
    // Old content can embed images.ecency.com/p/<hash> (the pre-SNI proxy base).
    // forceProxy makes routeThroughProxy true, so the early hostname-swap is
    // skipped — the hash must still be reused, not re-encoded into a new /p/ hash.
    const hash = '2bP4pJr4wVimqCWjYimXJe2cnCgnJdyHYxb4dfF6gmC'
    const legacy = `https://images.ecency.com/p/${hash}?format=match&mode=fit`

    expect(proxifyImageSrc(legacy, 0, 0, 'match', { forceProxy: true })).toBe(
      `https://i.ecency.com/p/${hash}?format=match&mode=fit`
    )
  })

  it('should reuse the hash of a legacy images.ecency.com/p/ URL when resizing', () => {
    const hash = '2bP4pJr4wVimqCWjYimXJe2cnCgnJdyHYxb4dfF6gmC'
    const legacy = `https://images.ecency.com/p/${hash}?format=match&mode=fit`

    expect(proxifyImageSrc(legacy, 600)).toBe(
      `https://i.ecency.com/p/${hash}?format=match&mode=fit&width=600`
    )
  })
})

describe('picture / per-format helpers (cache-safe content negotiation)', () => {
  beforeEach(() => setProxyBase('https://i.ecency.com'))

  describe('isPictureEligibleRawUrl', () => {
    it('accepts raw static-raster URLs (jpg/jpeg/png/webp), query/fragment tolerant', () => {
      expect(isPictureEligibleRawUrl('https://files.peakd.com/x/a.png')).toBe(true)
      expect(isPictureEligibleRawUrl('https://x.com/a.JPG')).toBe(true)
      expect(isPictureEligibleRawUrl('https://x.com/a.jpeg?cb=1')).toBe(true)
      expect(isPictureEligibleRawUrl('https://x.com/a.webp#frag')).toBe(true)
    })
    it('rejects animated / vector / exotic formats (origin would mislabel them)', () => {
      for (const u of [
        'https://x.com/a.gif', 'https://x.com/a.gif?cb=1', 'https://x.com/a.apng',
        'https://x.com/a.svg', 'https://x.com/a.heic', 'https://x.com/a.ico',
        'https://x.com/a.tiff', 'https://x.com/a.arw'
      ]) expect(isPictureEligibleRawUrl(u)).toBe(false)
    })
    it('rejects already-proxified routes (original extension lost)', () => {
      expect(isPictureEligibleRawUrl('https://i.ecency.com/p/abc?format=match')).toBe(false)
      expect(isPictureEligibleRawUrl('https://images.ecency.com/p/abc')).toBe(false)
      expect(isPictureEligibleRawUrl('https://i.ecency.com/u/foo/avatar/small')).toBe(false)
      expect(isPictureEligibleRawUrl('https://i.ecency.com/0x0/https://x.com/a.png')).toBe(false)
    })
    it('rejects non-http, extensionless, and missing URLs', () => {
      expect(isPictureEligibleRawUrl('data:image/png;base64,xxx')).toBe(false)
      expect(isPictureEligibleRawUrl('https://x.com/no-extension')).toBe(false)
      expect(isPictureEligibleRawUrl(undefined)).toBe(false)
    })
    it('only honors the extension on the PATHNAME, not the query or fragment', () => {
      // raster extension lives in the query/fragment but the real resource is not
      // proven raster — must be ineligible (would otherwise emit a mislabeled <source>)
      expect(isPictureEligibleRawUrl('https://x.com/download?file=a.png')).toBe(false)
      expect(isPictureEligibleRawUrl('https://x.com/image.svg#thumb.png')).toBe(false)
      // genuine raster path with an unrelated query/fragment stays eligible
      expect(isPictureEligibleRawUrl('https://x.com/a.png?cb=1#x')).toBe(true)
    })
  })

  describe('buildSrcSetForFormat', () => {
    it('pins the requested format in every candidate', () => {
      const ss = buildSrcSetForFormat('https://files.peakd.com/x/a.png', 'avif')
      expect(ss).toContain('format=avif')
      expect(ss).not.toContain('format=match')
      expect(ss.split(',').length).toBe(5)
    })
    it('is byte-identical to buildSrcSet when format=match', () => {
      const u = 'https://files.peakd.com/x/a.png'
      expect(buildSrcSetForFormat(u, 'match')).toBe(buildSrcSet(u))
    })
    it('reuses the hash for already-/p/ URLs with no double suffix', () => {
      const ss = buildSrcSetForFormat('https://i.ecency.com/p/abc?format=match&mode=fit', 'webp')
      expect(ss).toContain('https://i.ecency.com/p/abc?format=webp&mode=fit&width=320 320w')
    })
    it('transcodes a legacy sized-proxy URL, which now routes through /p/', () => {
      // Requesting a width sends images.hive.blog/WxH through our own /p/ route
      // (one hop, resized) instead of a host swap that 301s and drops the width.
      const ss = buildSrcSetForFormat('https://images.hive.blog/0x0/a.png', 'avif')
      expect(ss).toContain('/p/')
      expect(ss).toContain('format=avif')
      expect(buildSrcSetForFormat('https://images.hive.blog/0x0/a.png', 'match')).toContain('/p/')
    })
  })

  describe('buildPictureSources', () => {
    it('returns proxied avif+webp srcsets for an eligible raw URL', () => {
      const r = buildPictureSources('https://files.peakd.com/x/a.png')
      expect(r).not.toBeNull()
      expect(r!.avif).toContain('/p/')
      expect(r!.avif).toContain('format=avif')
      expect(r!.webp).toContain('format=webp')
    })
    it('returns null for ineligible URLs (gif / proxified / extensionless)', () => {
      expect(buildPictureSources('https://x.com/a.gif')).toBeNull()
      expect(buildPictureSources('https://i.ecency.com/p/abc?format=match')).toBeNull()
      expect(buildPictureSources('https://x.com/no-ext')).toBeNull()
    })
    it('builds pinned sources for a legacy sized-proxy URL (nested source unwrapped)', () => {
      const r = buildPictureSources('https://images.hive.blog/1536x0/https://files.peakd.com/file/x/abc')
      expect(r).not.toBeNull()
      expect(r!.avif).toContain('/p/')
      expect(r!.avif).toContain('format=avif')
      expect(r!.webp).toContain('format=webp')
      // the /D upload form is NOT a nested proxy URL and keeps its old handling
      expect(buildPictureSources('https://images.hive.blog/DQmabc/photo.png')).not.toBeNull()
    })
    it('refuses absurdly long URLs instead of base58-encoding them', () => {
      // base58 encoding is quadratic: a 60KB URL from a post body cost ~12.6s of
      // CPU per render before this guard, on the SSR path.
      const bomb = 'http://hivebuzz.me/image.png' + '/'.repeat(60000) + 'x'
      expect(proxifyImageSrc(bomb, 60, 70)).toBe('')
      expect(proxifyImageSrc('https://images.hive.blog/60x70/' + bomb, 60, 70)).toBe('')
      const started = Date.now()
      proxifyImageSrc('https://images.hive.blog/60x70/' + bomb, 60, 70)
      expect(Date.now() - started).toBeLessThan(500)
      // a normal-length URL is unaffected
      expect(proxifyImageSrc('https://files.peakd.com/file/x/abc.png', 60, 70)).toContain('/p/')
    })
    it('ignores the fragment, which never reaches the server anyway', () => {
      const base = 'https://images.hive.blog/60x70/http://hivebuzz.me/image.png'
      const hash = (u: string) => proxifyImageSrc(u, 60, 70).split('/p/')[1].split('?')[0]
      // verified against the live legacy handler: it returns the same Location
      // for both forms, because no client sends anything after the '#'
      expect(hash(base + '#frag')).toBe(hash(base))
      // a '?' inside the fragment belongs to the fragment, not the query
      expect(hash(base + '#a?b=c')).toBe(hash(base))
      // a real query is still honoured alongside a fragment
      expect(hash(base + '?x=1#frag')).toBe(hash(base + '?x=1'))
      expect(hash(base + '?x=1')).not.toBe(hash(base))
    })
    it('unwraps the nested source positionally, not by last-URL-in-string', () => {
      // The nested image carries a URL-valued query parameter. Picking the last
      // http(s):// substring would resolve to example.com instead of the image.
      const u = 'https://images.hive.blog/60x70/http://hivebuzz.me/image.png?redirect=https://example.com/other.png'
      const decoyHash = proxifyImageSrc('https://example.com/other.png', 60, 70).split('/p/')[1].split('?')[0]
      const got = proxifyImageSrc(u, 60, 70).split('/p/')[1].split('?')[0]
      expect(got).not.toBe(decoyHash)
      // byte-equal to what the imagehoster's own legacy handler redirects to:
      // it parses the path segment and re-attaches the query via searchParams,
      // which percent-encodes the URL-valued value before base58 encoding.
      expect(got).toBe(
        '3HaJVvr6qfmnThj2pZ2URy81yA4vPxZ1VESc8MPJBForDhKM22NxfNu7ZkduRBaYGK7SAMimku9EvhR1YxUjtFBJEvpV8z65eJHXXWE'
      )
      // and the no-query form still agrees with the same handler
      expect(
        proxifyImageSrc('https://images.hive.blog/60x70/http://hivebuzz.me/image.png', 60, 70)
          .split('/p/')[1].split('?')[0]
      ).toBe('25K6n8rwZtJgk3dgpkudFuAzYSDbEBTnAgvqHAn')
    })
    it('leaves NON-sized legacy foreign URLs on the hostname swap, transform or not', () => {
      // their own /p/<hash> names a foreign hash space — routing it through our
      // /p/ would proxy a proxy, so this shape keeps its long-standing handling
      const foreignP = 'https://steemitimages.com/p/B69zEhWZA8UDm9f4vLWvxrdxXd6DUG2Qar42eSi5'
      expect(isLegacySizedProxyUrl(foreignP)).toBe(false)
      expect(proxifyImageSrc(foreignP, 600, 500)).toBe(
        'https://i.ecency.com/p/B69zEhWZA8UDm9f4vLWvxrdxXd6DUG2Qar42eSi5'
      )
      expect(buildPictureSources(foreignP)).toBeNull()
      // and the sized shape is recognised only with a real WxH segment
      expect(isLegacySizedProxyUrl('https://images.hive.blog/1536x0/https://x.com/a.png')).toBe(true)
      expect(isLegacySizedProxyUrl('https://images.hive.blog/notsized/https://x.com/a.png')).toBe(false)
    })
    it('keeps the bare hostname swap when nothing is asked of the proxy (OG/social)', () => {
      const og = proxifyImageSrc('https://images.hive.blog/1536x0/https://files.peakd.com/file/x/abc')
      expect(og).toBe('https://i.ecency.com/1536x0/https://files.peakd.com/file/x/abc')
    })
  })
})

describe('base58 URL hashing', () => {
  // The hash is the image proxy's cache key and is embedded in every proxified image
  // URL, so replacing the Buffer-based multihashes call must not shift a single byte.
  // multihashes' toB58String was `bs58.encode` behind a Buffer type-check, so the old
  // implementation is reproduced here and used as the oracle.
  const oracle = (url: string): string => multihash.toB58String(Buffer.from(url))

  const hashOf = (url: string): string => {
    const proxified = proxifyImageSrc(url, 0, 0, 'match')
    const m = proxified.match(/\/p\/([^?]+)/)
    if (!m) throw new Error(`no /p/ hash in ${proxified}`)
    return m[1]
  }

  it('matches the previous implementation on representative URLs', () => {
    const urls = [
      'https://files.peakd.com/file/peakd-hive/user/abc.png',
      'https://images.hive.blog/DQmSomeHash/photo.jpeg?a=1&b=2',
      'https://example.com/a.png',
      'https://example.com/ünïcode-ünd-emoji-😀/ъ.png',
      'https://example.com/' + 'x'.repeat(500) + '.png',
      'https://example.com/path with spaces/%20encoded.png'
    ]
    for (const url of urls) {
      expect(hashOf(url)).toBe(oracle(url))
    }
  })

  it('matches the previous implementation across randomised inputs', () => {
    for (let i = 0; i < 400; i++) {
      let s = ''
      const len = 1 + Math.floor(Math.random() * 60)
      for (let j = 0; j < len; j++) {
        // Span ASCII, Latin-1, CJK and astral-plane (surrogate pair) code points,
        // skipping the lone-surrogate range which is not a valid scalar value.
        let cp = Math.floor(Math.random() * 0x2ffff) + 1
        if (cp >= 0xd800 && cp <= 0xdfff) cp += 0x800
        s += String.fromCodePoint(cp)
      }
      const url = `https://example.com/${encodeURIComponent(s)}.png`
      expect(hashOf(url)).toBe(oracle(url))
    }
  })
})
