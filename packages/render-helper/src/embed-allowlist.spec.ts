import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { markdown2Html } from './markdown-2-html'
import { sanitizeHtml } from './methods/sanitize-html.method'
import { isAllowedEmbedSrc } from './consts'
import { getProxyBase } from './proxify-image-src'

// #1919: the embed allow list and render-helper's own link markers held only
// on the DOM transform path. All bodies below are synthetic.

// Nesting past the traverse depth cap sends a body down the sanitize-only
// fallback, the path that runs no DOM transform at all.
const viaFallback = (inner: string) => '<div>'.repeat(600) + inner + '</div>'.repeat(600)

const decode = (s: string) => s.replace(/&amp;/g, '&')
const iframeSrcs = (html: string) =>
  [...html.matchAll(/<iframe\b[^>]*?\ssrc="([^"]*)"/g)].map((m) => decode(m[1]))

describe('#1919 embed allow list and author markers', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>
  beforeEach(() => {
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
  })
  afterEach(() => warnSpy.mockRestore())

  describe('sanitizer enforces the iframe allow list and sandbox grants', () => {
    it('drops an iframe whose src is off the allow list', () => {
      const out = sanitizeHtml('<p>a</p><iframe src="https://evil.example/embed/x"></iframe><p>b</p>')
      expect(out).not.toContain('evil.example')
      expect(out).not.toContain('<iframe')
      expect(out).toContain('<p>b</p>')
    })

    it('drops an allowed host aimed at a non-embed path', () => {
      const out = sanitizeHtml('<iframe src="https://www.youtube.com/redirect?q=https://evil.example"></iframe>')
      expect(out).not.toContain('<iframe')
    })

    it('keeps an allowed embed and only the sandbox tokens iframe() grants', () => {
      const out = sanitizeHtml(
        '<iframe src="https://www.youtube.com/embed/dQw4w9WgXcQ" sandbox="allow-scripts allow-top-navigation allow-forms allow-same-origin"></iframe>'
      )
      expect(iframeSrcs(out)).toEqual(['https://www.youtube.com/embed/dQw4w9WgXcQ'])
      expect(out).toContain('sandbox="allow-scripts allow-same-origin"')
    })

    it('enforces the allow list on the sanitize-only fallback path', () => {
      const out = markdown2Html(
        viaFallback('<iframe src="https://evil.example/embed/x" sandbox="allow-scripts allow-top-navigation"></iframe>'),
        false
      )
      expect(out).not.toContain('evil.example')
      expect(out).not.toContain('allow-top-navigation')
    })
  })

  describe('iframe() emits only sources isAllowedEmbedSrc accepts', () => {
    const cases: Array<[string, string]> = [
      ['Spotify embed-podcast', 'https://open.spotify.com/embed-podcast/episode/4rOoJ6Egrf8K2IrywzwOMk'],
      ['upper case YouTube /EMBED/', 'https://www.youtube.com/EMBED/dQw4w9WgXcQ'],
      ['BitChute /video/', 'https://www.bitchute.com/video/AbCdEf12345/'],
      ['BitChute without scheme host', 'https://bitchute.com/embed/AbCdEf12345/'],
      ['Brighteon page URL', 'https://www.brighteon.com/1a2b3c4d-5e6f-7a8b-9c0d-1e2f3a4b5c6d'],
      ['protocol-relative Twitch', '//player.twitch.tv/?channel=somechannel'],
      ['http archive.org', 'http://archive.org/embed/some-item'],
      ['http YouTube embed', 'http://www.youtube.com/embed/dQw4w9WgXcQ'],
      ['protocol-relative Loom', '//www.loom.com/embed/abc123'],
    ]
    for (const [name, src] of cases) {
      it(`${name}`, () => {
        const out = markdown2Html(`<iframe src="${src}"></iframe>`, false)
        const srcs = iframeSrcs(out)
        expect(srcs).toHaveLength(1)
        expect(isAllowedEmbedSrc(srcs[0])).toBe(true)
      })
    }

    it('turns a YouTube Shorts URL without an 11 character id into the unsupported placeholder', () => {
      const out = markdown2Html('<iframe src="https://www.youtube.com/shorts/short"></iframe>', false)
      expect(out).not.toContain('<iframe')
      expect(out).toContain('unsupported-iframe')
    })
  })

  describe('author written markdown-* classes and render-helper data-* attributes', () => {
    it('strips a fake post card and keeps the link a plain external link', () => {
      const out = markdown2Html(
        '<a class="markdown-post-link" data-author="victim" data-permlink="fake" data-tag="hive" href="https://evil.example/x">read</a>',
        true
      )
      expect(out).not.toContain('markdown-post-link')
      expect(out).not.toContain('data-author')
      expect(out).not.toContain('data-permlink')
      expect(out).toContain('href="https://evil.example/x"')
    })

    it('strips a fake mention and an app-uri data-href', () => {
      const out = markdown2Html(
        '<span class="markdown-author-link other">x</span> <a class="markdown-profile-link" data-href="web+evil:go" data-community="hive-1">y</a>',
        true
      )
      expect(out).not.toMatch(/markdown-(author|profile)-link/)
      expect(out).not.toContain('data-href')
      expect(out).not.toContain('data-community')
      // Unrelated author classes survive.
      expect(out).toContain('class="other"')
    })

    it('strips an author click-to-play marker', () => {
      const out = markdown2Html(
        '<a class="markdown-video-link markdown-video-link-youtube" data-embed-src="https://www.youtube.com/embed/dQw4w9WgXcQ" data-youtube="dQw4w9WgXcQ" href="https://evil.example">v</a>',
        false
      )
      expect(out).not.toContain('markdown-video-link')
      expect(out).not.toContain('data-embed-src')
      expect(out).not.toContain('data-youtube')
    })

    it('keeps the markers render-helper itself builds', () => {
      const app = markdown2Html('@alice #hive https://www.youtube.com/watch?v=dQw4w9WgXcQ', true)
      expect(app).toContain('class="markdown-author-link" data-author="alice"')
      expect(app).toContain('class="markdown-tag-link" data-tag="hive"')
      expect(app).toContain('data-embed-src="https://www.youtube.com/embed/dQw4w9WgXcQ?autoplay=1"')
      const web = markdown2Html('https://ecency.com/hive/@alice/a-post', true)
      expect(web).toContain('data-author="alice"')
      expect(web).toContain('data-permlink="a-post"')
    })

    it('strips them on the sanitize-only fallback path too', () => {
      const out = markdown2Html(
        viaFallback('<a class="markdown-post-link x" data-author="victim" data-permlink="fake" href="https://ecency.com/">c</a>'),
        true
      )
      expect(out).not.toContain('markdown-post-link')
      expect(out).not.toContain('data-author')
      expect(out).toContain('class="x"')
    })
  })

  describe('<video poster> goes through the image proxy', () => {
    it('proxies the poster on the transform path', () => {
      const out = markdown2Html(
        '<video src="https://example.com/v.mp4" poster="https://tracker.example/p.jpg" controls></video>',
        false
      )
      const poster = out.match(/poster="([^"]*)"/)
      expect(poster).not.toBeNull()
      expect(decode(poster![1]).startsWith(`${getProxyBase()}/`)).toBe(true)
      expect(out).not.toContain('tracker.example')
    })

    it('drops an unproxied poster on the sanitize-only path', () => {
      const out = markdown2Html(
        viaFallback('<video src="https://example.com/v.mp4" poster="https://tracker.example/p.jpg" controls></video>'),
        false
      )
      expect(out).not.toContain('tracker.example')
      expect(out).toContain('<video')
    })
  })
})
