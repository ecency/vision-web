import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { markdown2Html } from './markdown-2-html'
import { sanitizeHtml } from './methods/sanitize-html.method'
import { simpleMarkdownToHTML } from './methods/simple-markdown-to-html.method'
import { isAllowedEmbedSrc } from './consts'
import { getProxyBase } from './proxify-image-src'

// #1919: the embed allow list and render-helper's own link markers held only
// on the DOM transform path. All bodies below are synthetic.

// The sanitize-only fallback (no DOM transform at all) is covered in
// untransformed-fallback.spec.ts.

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
  })

  describe('upper and mixed case attribute names', () => {
    it('strips markers written with upper case names', () => {
      const out = markdown2Html(
        '<a CLASS="Markdown-Author-Link" DATA-AUTHOR="evil" Data-Embed-Src="https://www.youtube.com/embed/dQw4w9WgXcQ" href="https://evil.example">hi</a>',
        true
      )
      expect(out.toLowerCase()).not.toContain('markdown-author-link')
      expect(out.toLowerCase()).not.toContain('data-author')
      expect(out.toLowerCase()).not.toContain('data-embed-src')
    })

    it('proxies an upper case SRC image and applies the link policy to HREF/TARGET/REL', () => {
      const out = markdown2Html(
        '<img SRC="https://evil.example/t.png"> <a HREF="https://evil.example/x" TARGET="_blank" REL="opener">l</a>',
        false
      )
      expect(out).not.toMatch(/src="https:\/\/evil\.example/)
      expect(out).not.toContain('rel="opener"')
      expect(out).toContain('rel="nofollow ugc noopener"')
    })

    it('keeps a legit upper case IFRAME SRC embed', () => {
      const out = markdown2Html('<IFRAME SRC="https://www.youtube.com/embed/dQw4w9WgXcQ"></IFRAME>', false)
      expect(iframeSrcs(out)).toEqual(['https://www.youtube.com/embed/dQw4w9WgXcQ'])
    })
  })

  describe('escaped markup in text never becomes real markers', () => {
    it('web: entity-escaped anchor next to a tag stays text', () => {
      for (const body of [
        '&lt;a class="markdown-author-link" data-author="evil" data-href="web+evil://x"&gt;x&lt;/a&gt; #tag',
        '&#60;a class="markdown-author-link" data-author="evil" data-href="web+evil://x"&#62;x&#60;/a&#62; #tag',
      ]) {
        const out = markdown2Html(body, false)
        expect(out).not.toMatch(/<a [^>]*data-author=/)
        expect(out).not.toMatch(/<a [^>]*data-href=/)
        expect(out).toContain('&lt;a class=')
        expect(out).toContain('href="/trending/tag"')
      }
    })

    it('app: backslash-escaped anchor next to a mention stays text', () => {
      const out = markdown2Html(
        '\\<a class="markdown-post-link" data-author="evil" data-permlink="x" data-tag="y"\\>x\\</a\\> @alice',
        true
      )
      expect(out).not.toMatch(/<a [^>]*data-author="evil"/)
      expect(out).toContain('data-author="alice"')
    })

    it('a literal > before a tag still links it', () => {
      expect(markdown2Html('a >#quote', false)).toContain('href="/trending/quote"')
    })
  })

  describe('allow list paths for every embed host', () => {
    const refused = [
      'https://archive.org/download/x/evil.html',
      'https://cdn.dapplr.in/anything',
      'https://.dapplr.in/file/dapplr-videos/x',
      'https://w.soundcloud.com/evil',
      'https://audio.3speak.tv/evil',
      'https://3speak.tv/evil',
      'https://lbry.tv/@evil/page',
      'https://www.skatehype.com/evil.php',
      'https://embed.truvvl.com/evil',
      'https://aureal-embed.web.app/evil/page',
      'https://brandnewtube.com/@evil',
      'https://www.vimm.tv/a/b/c/evil.html',
    ]
    for (const src of refused) {
      it(`refuses ${src}`, () => {
        expect(isAllowedEmbedSrc(src)).toBe(false)
      })
    }
  })

  describe('bare iframe clean-up', () => {
    it('treats src= inside another attribute value as no src', () => {
      expect(sanitizeHtml('<iframe class="a src=x"></iframe>')).not.toContain('<iframe')
    })

    it('does not swallow content after an unclosed refused iframe', () => {
      const out = sanitizeHtml('<iframe src="https://evil.example/x"><p>keep me</p><iframe src="https://www.youtube.com/embed/dQw4w9WgXcQ"></iframe>')
      expect(out).toContain('keep me')
    })
  })

  describe('sanitize-only callers keep canonical embeds (simpleMarkdownToHTML: editor, chat)', () => {
    const cases: Array<[string, string]> = [
      ['//www.youtube.com/embed/dQw4w9WgXcQ', 'https://www.youtube.com/embed/dQw4w9WgXcQ'],
      ['http://www.youtube.com/embed/dQw4w9WgXcQ', 'https://www.youtube.com/embed/dQw4w9WgXcQ'],
      ['https://m.youtube.com/embed/dQw4w9WgXcQ', 'https://www.youtube.com/embed/dQw4w9WgXcQ'],
      ['https://3speak.online/embed?v=a/b', 'https://play.3speak.tv/embed?v=a/b'],
      ['https://player.twitch.tv/?channel=foo', 'https://player.twitch.tv/?channel=foo'],
    ]
    for (const [src, want] of cases) {
      it(src, () => {
        expect(iframeSrcs(simpleMarkdownToHTML(`<iframe src="${src}"></iframe>`))).toEqual([want])
      })
    }

    it('still drops an off-list iframe', () => {
      expect(simpleMarkdownToHTML('<iframe src="https://example.com/widget"></iframe>')).not.toContain('<iframe')
    })

    it('keeps a video poster as before (images are not proxied on this path either)', () => {
      expect(simpleMarkdownToHTML('<video poster="https://files.peakd.com/a.jpg" src="https://files.peakd.com/a.mp4" controls></video>'))
        .toContain('poster="https://files.peakd.com/a.jpg"')
    })
  })

  describe('markup hidden in CDATA, processing instructions and comments (review r5)', () => {
    const E = 'https://evil.example'
    const payload = `<img src="${E}/t.png"><a class="markdown-post-link" data-author="evil" data-permlink="p" data-tag="t" href="${E}" target="_blank" rel="opener">x</a><iframe src="${E}/"></iframe><iframe src="https://ipfs.skatehive.app/ipfs/QmEvil"></iframe><span class="markdown-video-link markdown-video-link-youtube" data-embed-src="https://www.youtube.com/embed/AAAAAAAAAAA">v</span><video poster="${E}/p.png" controls></video>`
    const shapes: Record<string, string> = {
      cdataInline: `hello <![CDATA[${payload}]]> world`,
      cdataBlock: `<div>\n<![CDATA[${payload}]]>\n</div>`,
      piInline: `hello <?x ${payload} ?> world`,
      piBlock: `<div>\n<?x ${payload} ?>\n</div>`,
      commentOpenClose: `<div>\n<!--> ${payload} -->\n</div>`,
      commentDashes: `<div>\n<!---> ${payload} -->\n</div>`,
    }
    const leaks = (out: string) => [
      /<img[^>]*src="https:\/\/evil/.test(out) && 'raw img',
      /<a[^>]*data-author="evil"/.test(out) && 'marker',
      /<a\b[^>]*rel="opener"/.test(out) && 'opener',
      /<iframe[^>]*(evil|skatehive)/.test(out) && 'iframe',
      /<span[^>]*data-embed-src/.test(out) && 'embed marker',
      /<video\b[^>]*poster="https:\/\/evil/.test(out) && 'poster',
    ].filter(Boolean)
    for (const [name, body] of Object.entries(shapes)) {
      for (const forApp of [false, true]) {
        it(`${name} forApp=${forApp}`, () => {
          expect(leaks(markdown2Html(body, forApp))).toEqual([])
        })
      }
    }

    it('a plain comment just vanishes', () => {
      const out = markdown2Html('before\n\n<!-- more -->\n\nafter', false)
      expect(out).not.toContain('more')
      expect(out).toContain('before')
      expect(out).toContain('after')
    })
  })

  describe('control characters between tag name and attributes (review r5)', () => {
    // Inside an HTML block Remarkable passes the markup through raw; xmldom
    // then reads these separators as attribute boundaries and keeps the names
    // upper case, which the string pre-pass never sees.
    const E = 'https://evil.example'
    for (const sep of ['\u0000', '\u0001', '\u0008', '\u000b', '\u000e', '\u001f', ' ']) {
      const code = `U+${sep.charCodeAt(0).toString(16).padStart(4, '0')}`
      const block = (inner: string) => `<div>\n${inner}\n</div>`
      for (const forApp of [false, true]) {
        it(`${code} forApp=${forApp}`, () => {
          const out = [
            markdown2Html(block(`<img${sep}SRC="${E}/t.png">`), forApp),
            markdown2Html(block(`<a${sep}HREF="${E}"${sep}TARGET="_blank" REL="opener">k</a>`), forApp),
            markdown2Html(block(`<a${sep}CLASS="markdown-post-link" DATA-AUTHOR="evil" DATA-PERMLINK="p">k</a>`), forApp),
            markdown2Html(block(`<video${sep}POSTER="${E}/p.png" controls></video>`), forApp),
          ].join('\n')
          expect(out).not.toMatch(/<img[^>]*src="https:\/\/evil/i)
          // forApp anchors carry no href (the app routes taps via data-href),
          // and keep an author rel exactly as develop does; web applies the
          // link policy.
          if (!forApp) expect(out).not.toMatch(/rel="opener"/i)
          expect(out).not.toMatch(/<a\b[^>]*(data-author="evil"|markdown-post-link)/i)
          expect(out).not.toMatch(/poster="https:\/\/evil/i)
        })
      }
    }
  })

  describe('malformed HTML repair path keeps provider iframes for iframe() (review r5)', () => {
    const cases: Array<[string, RegExp]> = [
      ['https://www.bitchute.com/video/AbCdEf123/', /^https:\/\/www\.bitchute\.com\/embed\/AbCdEf123\/$/],
      ['https://www.brighteon.com/1a2b3c4d-5e6f', /^https:\/\/www\.brighteon\.com\/embed\/1a2b3c4d-5e6f$/],
      ['https://www.youtube.com/EMBED/dQw4w9WgXcQ', /^https:\/\/www\.youtube\.com\/embed\/dQw4w9WgXcQ$/],
      ['https://www.youtube.com/shorts/dQw4w9WgXcQ', /^https:\/\/www\.youtube\.com\/embed\/dQw4w9WgXcQ$/],
    ]
    for (const [src, want] of cases) {
      it(src, () => {
        const out = markdown2Html(`<center>\n\n<iframe src="${src}"></iframe>`, false)
        const srcs = iframeSrcs(out)
        expect(srcs).toHaveLength(1)
        expect(srcs[0]).toMatch(want)
      })
    }
  })

  it('strips markers from thousands of elements in linear time (review r5)', () => {
    const body = '<div>' + '<i class="markdown-a" data-tag="x">x</i>'.repeat(8000) + '</div>'
    const t0 = performance.now()
    const out = markdown2Html(body, false)
    expect(performance.now() - t0).toBeLessThan(2500)
    expect(out).not.toContain('markdown-a')
  })

  it('refuses a skatehive IPFS iframe src, which iframe() never emits (review r5)', () => {
    const src = 'https://ipfs.skatehive.app/ipfs/QmEvil'
    expect(sanitizeHtml(`<iframe src="${src}"></iframe>`)).not.toContain('<iframe')
    expect(simpleMarkdownToHTML(`<iframe src="${src}"></iframe>`)).not.toContain('<iframe')
    // The transform path still turns it into a <video>.
    expect(markdown2Html(`<iframe src="${src}"></iframe>`, false)).toContain('<video')
  })

  it('stays safe when thousands of unclosed tags exhaust the repair path (review r5)', () => {
    const out = markdown2Html('<b>'.repeat(5000) + '<img src="https://evil.example/t.png"> @alice', false)
    expect(out).not.toMatch(/<img[^>]*src="https:\/\/evil/)
  })
})
