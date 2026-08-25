import { img, createImageHTML } from './img.method'
import { DOMParser } from '../consts/dom-parser.const'

describe('img() method - Image Processing', () => {
  let doc: Document

  beforeEach(() => {
    doc = DOMParser.parseFromString('<html><body></body></html>', 'text/html')
  })

  describe('LCP (Largest Contentful Paint) handling', () => {
    it('should mark first image as LCP with eager loading', () => {
      const parent = doc.createElement('div')
      const image = doc.createElement('img')
      image.setAttribute('src', 'https://example.com/image.jpg')
      parent.appendChild(image)

      const state = { firstImageFound: false }
      img(image, state)

      expect(state.firstImageFound).toBe(true)
      expect(image.getAttribute('loading')).toBe('eager')
      expect(image.getAttribute('fetchpriority')).toBe('high')
    })

    it('tiers subsequent images: second eager at default priority, third onward lazy (#1672)', () => {
      const parent = doc.createElement('div')
      const images = Array.from({ length: 5 }, (_, i) => {
        const el = doc.createElement('img')
        el.setAttribute('src', `https://example.com/image${i + 1}.jpg`)
        parent.appendChild(el)
        return el
      })

      const state = { firstImageFound: false }
      images.forEach((el) => img(el, state))

      expect(state.firstImageFound).toBe(true)
      // Image 1: the LCP candidate keeps the exclusive high hint.
      expect(images[0].getAttribute('loading')).toBe('eager')
      expect(images[0].getAttribute('fetchpriority')).toBe('high')
      // Image 2: likely in the first viewport; eager, but never high, so it
      // cannot compete with the LCP image.
      expect(images[1].getAttribute('loading')).toBe('eager')
      expect(images[1].getAttribute('fetchpriority')).toBeNull()
      expect(images[1].getAttribute('decoding')).toBe('async')
      // Images 3+: stay lazy; eager fetches unconditionally, so the eager set
      // stops at the two images that plausibly pay off.
      for (const el of [images[2], images[3], images[4]]) {
        expect(el.getAttribute('loading')).toBe('lazy')
        expect(el.getAttribute('decoding')).toBe('async')
      }
    })

    it('should use lazy loading when state is not provided', () => {
      const parent = doc.createElement('div')
      const image = doc.createElement('img')
      image.setAttribute('src', 'https://example.com/image.jpg')
      parent.appendChild(image)

      img(image)

      expect(image.getAttribute('loading')).toBe('lazy')
      expect(image.getAttribute('decoding')).toBe('async')
      expect(image.getAttribute('fetchpriority')).toBeNull()
    })

    it('treats an old-shape state with firstImageFound as index 1 (eager, default priority)', () => {
      const parent = doc.createElement('div')
      const image = doc.createElement('img')
      image.setAttribute('src', 'https://example.com/image.jpg')
      parent.appendChild(image)

      const state = { firstImageFound: true }
      img(image, state)

      expect(image.getAttribute('loading')).toBe('eager')
      expect(image.getAttribute('fetchpriority')).toBeNull()
      expect(image.getAttribute('decoding')).toBe('async')
    })

    it('should not set decoding attribute for LCP images', () => {
      const parent = doc.createElement('div')
      const image = doc.createElement('img')
      image.setAttribute('src', 'https://example.com/image.jpg')
      parent.appendChild(image)

      const state = { firstImageFound: false }
      img(image, state)

      expect(image.getAttribute('decoding')).toBeNull()
    })
  })

  describe('proxification through i.ecency.com', () => {
    it('should proxify image URLs', () => {
      const parent = doc.createElement('div')
      const image = doc.createElement('img')
      image.setAttribute('src', 'https://example.com/image.jpg')
      parent.appendChild(image)

      img(image)

      const src = image.getAttribute('src')
      expect(src).toContain('https://i.ecency.com')
    })

    it('should always use match format (webp handled by server via Accept header)', () => {
      const parent = doc.createElement('div')
      const image = doc.createElement('img')
      image.setAttribute('src', 'https://example.com/image.jpg')
      parent.appendChild(image)

      img(image)

      const src = image.getAttribute('src')
      expect(src).toContain('https://i.ecency.com')
      expect(src).toContain('format=match')
    })

    it('should not re-proxify already proxied images', () => {
      const parent = doc.createElement('div')
      const image = doc.createElement('img')
      const proxiedUrl = 'https://i.ecency.com/p/abc123.png?format=match&mode=fit'
      image.setAttribute('src', proxiedUrl)
      parent.appendChild(image)

      img(image)

      expect(image.getAttribute('src')).toBe(proxiedUrl)
    })

    it('should skip proxification for images with no-replace class', () => {
      const parent = doc.createElement('div')
      const image = doc.createElement('img')
      const originalUrl = 'https://example.com/image.jpg'
      image.setAttribute('src', originalUrl)
      image.setAttribute('class', 'no-replace')
      parent.appendChild(image)

      img(image)

      expect(image.getAttribute('src')).toBe(originalUrl)
    })

    it('should skip proxification for images with class containing no-replace', () => {
      const parent = doc.createElement('div')
      const image = doc.createElement('img')
      const originalUrl = 'https://example.com/image.jpg'
      image.setAttribute('src', originalUrl)
      image.setAttribute('class', 'some-class no-replace another-class')
      parent.appendChild(image)

      img(image)

      expect(image.getAttribute('src')).toBe(originalUrl)
    })
  })

  describe('data attributes and metadata', () => {
    it('should set itemprop=image attribute', () => {
      const parent = doc.createElement('div')
      const image = doc.createElement('img')
      image.setAttribute('src', 'https://example.com/image.jpg')
      parent.appendChild(image)

      img(image)

      expect(image.getAttribute('itemprop')).toBe('image')
    })

    it('should remove unsafe attributes', () => {
      const parent = doc.createElement('div')
      const image = doc.createElement('img')
      image.setAttribute('src', 'https://example.com/image.jpg')
      image.setAttribute('onerror', 'alert(1)')
      image.setAttribute('dynsrc', 'malicious.gif')
      image.setAttribute('lowsrc', 'low.jpg')
      image.setAttribute('width', '500')
      image.setAttribute('height', '300')
      parent.appendChild(image)

      img(image)

      expect(image.getAttribute('onerror')).toBeNull()
      expect(image.getAttribute('dynsrc')).toBeNull()
      expect(image.getAttribute('lowsrc')).toBeNull()
      expect(image.getAttribute('width')).toBeNull()
      expect(image.getAttribute('height')).toBeNull()
    })
  })

  describe('image source validation', () => {
    it('should handle empty src attribute', () => {
      const parent = doc.createElement('div')
      const image = doc.createElement('img')
      image.setAttribute('src', '')
      parent.appendChild(image)

      img(image)

      expect(image.getAttribute('src')).toBeNull()
    })

    it('should handle missing src attribute', () => {
      const parent = doc.createElement('div')
      const image = doc.createElement('img')
      parent.appendChild(image)

      img(image)

      expect(image.getAttribute('src')).toBeNull()
    })

    it('should reject javascript: URLs', () => {
      const parent = doc.createElement('div')
      const image = doc.createElement('img')
      image.setAttribute('src', 'javascript:alert(1)')
      parent.appendChild(image)

      img(image)

      expect(image.getAttribute('src')).toBeNull()
    })

    it('should reject vbscript: URLs', () => {
      const parent = doc.createElement('div')
      const image = doc.createElement('img')
      image.setAttribute('src', 'vbscript:msgbox(1)')
      parent.appendChild(image)

      img(image)

      expect(image.getAttribute('src')).toBeNull()
    })

    it('should reject placeholder x value', () => {
      const parent = doc.createElement('div')
      const image = doc.createElement('img')
      image.setAttribute('src', 'x')
      parent.appendChild(image)

      img(image)

      expect(image.getAttribute('src')).toBeNull()
    })

    it('should reject relative paths without protocol', () => {
      const parent = doc.createElement('div')
      const image = doc.createElement('img')
      image.setAttribute('src', 'photo.jpg')
      parent.appendChild(image)

      img(image)

      expect(image.getAttribute('src')).toBeNull()
    })

    it('should reject relative paths with ./', () => {
      const parent = doc.createElement('div')
      const image = doc.createElement('img')
      image.setAttribute('src', './photo.png')
      parent.appendChild(image)

      img(image)

      expect(image.getAttribute('src')).toBeNull()
    })

    it('should reject relative paths with subdirectories', () => {
      const parent = doc.createElement('div')
      const image = doc.createElement('img')
      image.setAttribute('src', 'assets/pic.jpeg')
      parent.appendChild(image)

      img(image)

      expect(image.getAttribute('src')).toBeNull()
    })

    it('should accept absolute URLs with https', () => {
      const parent = doc.createElement('div')
      const image = doc.createElement('img')
      image.setAttribute('src', 'https://example.com/image.jpg')
      parent.appendChild(image)

      img(image)

      const src = image.getAttribute('src')
      expect(src).toContain('https://i.ecency.com')
    })

    it('should accept absolute URLs with http', () => {
      const parent = doc.createElement('div')
      const image = doc.createElement('img')
      image.setAttribute('src', 'http://example.com/image.jpg')
      parent.appendChild(image)

      img(image)

      const src = image.getAttribute('src')
      expect(src).toContain('https://i.ecency.com')
    })

    it('should preserve original src when proxifyImageSrc returns empty for / paths', () => {
      const parent = doc.createElement('div')
      const image = doc.createElement('img')
      image.setAttribute('src', '/images/photo.jpg')
      parent.appendChild(image)

      img(image)

      // URLs starting with / pass the relative check but fail proxifyImageSrc validation
      // because they're not valid absolute URLs. Original src is preserved.
      const src = image.getAttribute('src')
      expect(src).toBe('/images/photo.jpg')
    })
  })

  describe('encoded character handling', () => {
    it('should decode decimal HTML entities', () => {
      const parent = doc.createElement('div')
      const image = doc.createElement('img')
      // &#106; = j, &#97; = a, &#118; = v, &#97; = a, &#115; = s, &#99; = c, &#114; = r, &#105; = i, &#112; = p, &#116; = t
      image.setAttribute('src', '&#106;&#97;&#118;&#97;&#115;&#99;&#114;&#105;&#112;&#116;:alert(1)')
      parent.appendChild(image)

      img(image)

      expect(image.getAttribute('src')).toBeNull()
    })

    it('should decode hexadecimal HTML entities', () => {
      const parent = doc.createElement('div')
      const image = doc.createElement('img')
      // &#x6a; = j, etc.
      image.setAttribute('src', '&#x6a;&#x61;&#x76;&#x61;&#x73;&#x63;&#x72;&#x69;&#x70;&#x74;:alert(1)')
      parent.appendChild(image)

      img(image)

      expect(image.getAttribute('src')).toBeNull()
    })

    it('should decode mixed decimal and hex entities', () => {
      const parent = doc.createElement('div')
      const image = doc.createElement('img')
      image.setAttribute('src', '&#106;&#x61;vascript:alert(1)')
      parent.appendChild(image)

      img(image)

      expect(image.getAttribute('src')).toBeNull()
    })

    it('should handle case-insensitive hex entities', () => {
      const parent = doc.createElement('div')
      const image = doc.createElement('img')
      image.setAttribute('src', '&#X6A;avascript:alert(1)')
      parent.appendChild(image)

      img(image)

      expect(image.getAttribute('src')).toBeNull()
    })

    it('should decode URL-encoded characters', () => {
      const parent = doc.createElement('div')
      const image = doc.createElement('img')
      // %20 = space
      image.setAttribute('src', 'https://example.com/image%20with%20spaces.jpg')
      parent.appendChild(image)

      img(image)

      const src = image.getAttribute('src')
      expect(src).toBeTruthy()
      expect(src).toContain('https://i.ecency.com')
    })
  })

  describe('state management', () => {
    it('should not mutate state when state is not provided', () => {
      const parent = doc.createElement('div')
      const image = doc.createElement('img')
      image.setAttribute('src', 'https://example.com/image.jpg')
      parent.appendChild(image)

      expect(() => img(image)).not.toThrow()
    })

    it('should mutate state.firstImageFound only once', () => {
      const parent = doc.createElement('div')
      const image1 = doc.createElement('img')
      const image2 = doc.createElement('img')
      image1.setAttribute('src', 'https://example.com/image1.jpg')
      image2.setAttribute('src', 'https://example.com/image2.jpg')
      parent.appendChild(image1)
      parent.appendChild(image2)

      const state = { firstImageFound: false }
      img(image1, state)

      expect(state.firstImageFound).toBe(true)

      const stateBeforeSecondCall = state.firstImageFound
      img(image2, state)

      expect(state.firstImageFound).toBe(stateBeforeSecondCall)
    })

    it('should handle multiple images with separate state objects', () => {
      const parent = doc.createElement('div')
      const image1 = doc.createElement('img')
      const image2 = doc.createElement('img')
      image1.setAttribute('src', 'https://example.com/image1.jpg')
      image2.setAttribute('src', 'https://example.com/image2.jpg')
      parent.appendChild(image1)
      parent.appendChild(image2)

      const state1 = { firstImageFound: false }
      const state2 = { firstImageFound: false }

      img(image1, state1)
      img(image2, state2)

      expect(state1.firstImageFound).toBe(true)
      expect(state2.firstImageFound).toBe(true)
      expect(image1.getAttribute('loading')).toBe('eager')
      expect(image2.getAttribute('loading')).toBe('eager')
    })
  })

  describe('edge cases', () => {
    it('should throw error for null element', () => {
      // The function does not handle null elements and will throw
      expect(() => img(null as any)).toThrow()
    })

    it('should handle element without parent', () => {
      const image = doc.createElement('img')
      image.setAttribute('src', 'https://example.com/image.jpg')

      expect(() => img(image)).not.toThrow()
    })

    it('should handle malformed URL', () => {
      const parent = doc.createElement('div')
      const image = doc.createElement('img')
      image.setAttribute('src', 'not a valid url')
      parent.appendChild(image)

      img(image)

      expect(image.getAttribute('src')).toBeNull()
    })

    it('should handle URL with query parameters', () => {
      const parent = doc.createElement('div')
      const image = doc.createElement('img')
      image.setAttribute('src', 'https://example.com/image.jpg?width=500&height=300')
      parent.appendChild(image)

      img(image)

      const src = image.getAttribute('src')
      expect(src).toContain('https://i.ecency.com')
    })

    it('should handle URL with hash fragments', () => {
      const parent = doc.createElement('div')
      const image = doc.createElement('img')
      image.setAttribute('src', 'https://example.com/image.jpg#section')
      parent.appendChild(image)

      img(image)

      const src = image.getAttribute('src')
      expect(src).toContain('https://i.ecency.com')
    })

    it('should handle very long URLs', () => {
      const parent = doc.createElement('div')
      const image = doc.createElement('img')
      const longUrl = 'https://example.com/' + 'a'.repeat(1000) + '.jpg'
      image.setAttribute('src', longUrl)
      parent.appendChild(image)

      expect(() => img(image)).not.toThrow()
    })

    it('should handle image with existing class attribute', () => {
      const parent = doc.createElement('div')
      const image = doc.createElement('img')
      image.setAttribute('src', 'https://example.com/image.jpg')
      image.setAttribute('class', 'existing-class')
      parent.appendChild(image)

      img(image)

      expect(image.getAttribute('class')).toBe('existing-class')
    })

    it('should handle leading/trailing whitespace in src attribute correctly', () => {
      const parent = doc.createElement('div')
      const image = doc.createElement('img')
      image.setAttribute('src', '  https://example.com/image.jpg  ')
      parent.appendChild(image)

      img(image)

      // After fix: function now uses trimmed decodedSrc for protocol check
      // So URLs with whitespace are recognized as absolute and proxified (not removed)
      const src = image.getAttribute('src')
      expect(src).toContain('https://i.ecency.com')
      expect(src).not.toBe('') // Should not be empty (the bug made it empty)
    })

    it('should handle case variations in protocols', () => {
      const parent = doc.createElement('div')
      const image = doc.createElement('img')
      image.setAttribute('src', 'HTTPS://EXAMPLE.COM/IMAGE.JPG')
      parent.appendChild(image)

      img(image)

      const src = image.getAttribute('src')
      expect(src).toContain('https://i.ecency.com')
    })
  })

  describe('integration with LCP and format', () => {
    it('should apply LCP settings with match format (webp via server)', () => {
      const parent = doc.createElement('div')
      const image = doc.createElement('img')
      image.setAttribute('src', 'https://example.com/image.jpg')
      parent.appendChild(image)

      const state = { firstImageFound: false }
      img(image, state)

      expect(state.firstImageFound).toBe(true)
      expect(image.getAttribute('loading')).toBe('eager')
      expect(image.getAttribute('fetchpriority')).toBe('high')
      const src = image.getAttribute('src')
      expect(src).toContain('format=match')
    })

    it('should apply lazy loading with match format for non-LCP images', () => {
      const parent = doc.createElement('div')
      const image = doc.createElement('img')
      image.setAttribute('src', 'https://example.com/image.jpg')
      parent.appendChild(image)

      // Index 3+ under the tiered policy (#1672): genuinely below the fold.
      const state = { firstImageFound: true, imageCount: 3 }
      img(image, state)

      expect(image.getAttribute('loading')).toBe('lazy')
      expect(image.getAttribute('decoding')).toBe('async')
      const src = image.getAttribute('src')
      expect(src).toContain('format=match')
    })
  })

  describe('forApp = false: <picture> content-negotiation wrapping', () => {
    function makeImg(src: string): HTMLElement {
      const d = DOMParser.parseFromString('<html><body><p></p></body></html>', 'text/html')
      const p = d.getElementsByTagName('p')[0]
      const image = d.createElement('img')
      image.setAttribute('src', src)
      p.appendChild(image)
      return image as unknown as HTMLElement
    }
    const parentName = (el: HTMLElement) => (el.parentNode as HTMLElement).nodeName.toLowerCase()

    it('wraps an eligible raw image in <picture> with avif then webp <source>s, keeping the <img> as the format=match fallback', () => {
      const image = makeImg('https://files.peakd.com/x/a.png')
      img(image, { firstImageFound: false }, false)
      const picture = image.parentNode as HTMLElement
      expect(picture.nodeName.toLowerCase()).toBe('picture')
      const sources = picture.getElementsByTagName('source')
      expect(sources.length).toBe(2)
      expect(sources[0].getAttribute('type')).toBe('image/avif')
      expect(sources[0].getAttribute('srcset')).toContain('format=avif')
      expect(sources[1].getAttribute('type')).toBe('image/webp')
      expect(image.getAttribute('src')).toContain('format=match')
    })

    it('does NOT wrap when forApp is true (default — mobile/React Native)', () => {
      const image = makeImg('https://files.peakd.com/x/a.png')
      img(image, { firstImageFound: false }, true)
      expect(parentName(image)).toBe('p')
    })

    it('does NOT wrap ineligible (animated gif) images', () => {
      const image = makeImg('https://files.peakd.com/x/a.gif')
      img(image, { firstImageFound: false }, false)
      expect(parentName(image)).toBe('p')
    })

    it('does NOT wrap already-proxified /p/ images (extension lost)', () => {
      const image = makeImg('https://i.ecency.com/p/abc?format=match&mode=fit')
      img(image, { firstImageFound: false }, false)
      expect(parentName(image)).toBe('p')
    })

    it('createImageHTML decodes its source consistently with img() (same proxy hash for an encoded URL)', () => {
      const url = 'https://files.peakd.com/x/my%20pic.png'
      // DOM path (forApp=true → bare <img>, no <picture> to keep the comparison simple)
      const d = DOMParser.parseFromString('<html><body><p></p></body></html>', 'text/html')
      const image = d.createElement('img')
      image.setAttribute('src', url)
      d.getElementsByTagName('p')[0].appendChild(image)
      img(image as unknown as HTMLElement, { firstImageFound: false }, true)
      const domSrc = image.getAttribute('src')
      // string path
      const strSrc = (createImageHTML(url, false, true).match(/src="([^"]+)"/) || [])[1]
      expect(strSrc).toBe(domSrc)
    })

    it('does not double-wrap an <img> already inside a <picture>', () => {
      const d = DOMParser.parseFromString('<html><body><picture></picture></body></html>', 'text/html')
      const pic = d.getElementsByTagName('picture')[0]
      const image = d.createElement('img')
      image.setAttribute('src', 'https://files.peakd.com/x/a.png')
      pic.appendChild(image)
      img(image as unknown as HTMLElement, { firstImageFound: false }, false)
      expect((image.parentNode as HTMLElement).nodeName.toLowerCase()).toBe('picture')
      expect(pic.getElementsByTagName('picture').length).toBe(0)
    })
  })
})

describe('exclusive high hint and precise avatar detection (#1673 review)', () => {
  const doc = DOMParser.parseFromString('<html><body></body></html>', 'text/html')

  function makeImg(src: string, cls?: string): HTMLElement {
    const parent = doc.createElement('div')
    const el = doc.createElement('img')
    el.setAttribute('src', src)
    if (cls) el.setAttribute('class', cls)
    parent.appendChild(el)
    return el
  }

  it('strips an inherited fetchpriority from every non-LCP tier', () => {
    const state = { firstImageFound: false }
    const first = makeImg('https://example.com/one.jpg')
    const second = makeImg('https://example.com/two.jpg')
    const fourth = makeImg('https://example.com/four.jpg')
    second.setAttribute('fetchpriority', 'high')
    fourth.setAttribute('fetchpriority', 'high')
    img(first, state)
    img(second, state)
    img(makeImg('https://example.com/three.jpg'), state)
    img(fourth, state)
    expect(first.getAttribute('fetchpriority')).toBe('high')
    expect(second.getAttribute('fetchpriority')).toBeNull()
    expect(fourth.getAttribute('fetchpriority')).toBeNull()
  })

  it('strips an inherited fetchpriority from avatars', () => {
    const el = makeImg('https://i.ecency.com/u/foo/avatar/small')
    el.setAttribute('fetchpriority', 'high')
    img(el, { firstImageFound: false })
    expect(el.getAttribute('fetchpriority')).toBeNull()
    expect(el.getAttribute('loading')).toBe('lazy')
  })

  it('treats only the proxy avatar route as an avatar, not arbitrary /avatar/ URLs', () => {
    const state = { firstImageFound: false }
    const content = makeImg('https://cdn.example/avatar/art.jpg')
    img(content, state)
    // Legitimate content image: consumes slot 0 and gets the LCP treatment.
    expect(content.getAttribute('loading')).toBe('eager')
    expect(content.getAttribute('fetchpriority')).toBe('high')

    const avatar = makeImg('https://i.ecency.com/u/foo/avatar/medium')
    img(avatar, state)
    expect(avatar.getAttribute('loading')).toBe('lazy')

    // The avatar did not consume slot 1.
    const next = makeImg('https://example.com/next.jpg')
    img(next, state)
    expect(next.getAttribute('loading')).toBe('eager')
    expect(next.getAttribute('fetchpriority')).toBeNull()
  })

  it('matches the author-link class as an exact token only', () => {
    const state = { firstImageFound: true, imageCount: 3 }
    const notAvatar = makeImg('https://example.com/pic.jpg', 'not-er-author-link-image-x')
    img(notAvatar, state)
    // Exact-token miss: tiered normally (index 3+ here, lazy) but counted.
    expect(state.imageCount).toBe(4)

    const avatar = makeImg('https://example.com/pic2.jpg', 'foo er-author-link-image')
    img(avatar, state)
    expect(avatar.getAttribute('loading')).toBe('lazy')
    expect(state.imageCount).toBe(4)
  })
})
