import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { markdown2Html } from './markdown-2-html'
import { sanitizeHtml } from './methods/sanitize-html.method'
import { simpleMarkdownToHTML } from './methods/simple-markdown-to-html.method'
import { getProxyBase } from './proxify-image-src'
import { xmldomNodeFilter } from './methods/render-boundary.method'
import { stripAuthorMarkers } from './methods/strip-author-markers.method'
import { stripDocumentWrapper } from './methods/markdown-to-html.method'
import { DOMParser, XMLSerializer } from './consts'

// #1919 review r10: enforcement at the output boundary. Synthetic bodies only.

const E = 'https://evil.example'
const P = `<a class="markdown-post-link" data-author="SENT" rel="opener" target="_top" href="${E}/q">hi</a><img src="${E}/t?x"><video poster="${E}/p?x" controls></video>`

/** Every way an author payload can survive into the final HTML. */
function violations(html: string, forApp: boolean): string[] {
  const out: string[] = []
  const base = `${getProxyBase()}/`
  const tagRe = /<([a-zA-Z][^\s>/]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/g
  let m: RegExpExecArray | null
  while ((m = tagRe.exec(html))) {
    const tag = m[1].toLowerCase()
    const attrs: Record<string, string> = {}
    for (const a of m[2].matchAll(/\s([^\s"'>/=]+)(?:="([^"]*)")?/g)) {
      attrs[a[1].toLowerCase()] = (a[2] ?? '').replace(/&amp;/g, '&')
    }
    const off = (u: string) => !u.trim().startsWith(base)
    if (tag === 'img' && attrs.src !== undefined && off(attrs.src)) out.push(`img src ${attrs.src}`)
    if (tag === 'img' && attrs.srcset && attrs.srcset.split(',').some((c) => off(c))) out.push('img srcset')
    if (tag === 'video' && attrs.poster !== undefined && off(attrs.poster)) out.push(`poster ${attrs.poster}`)
    if (attrs['data-author'] === 'SENT') out.push(`${tag} forged data-author`)
    if (!forApp && tag === 'a' && (attrs.rel === 'opener' || attrs.target === '_top')) out.push('author rel/target')
    if (['script', 'style'].includes(tag)) out.push(`tag ${tag}`)
  }
  return out
}

describe('output boundary (#1919 review r10)', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>
  beforeEach(() => {
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
  })
  afterEach(() => warnSpy.mockRestore())

  describe('script and style raw text', () => {
    const shapes: Record<string, string> = {
      script: `<script>${P}</script>`,
      SCRIPT: `<SCRIPT>${P}</SCRIPT>`,
      scriptAttr: `<script type="text/plain" src="x">${P}</script>`,
      scriptUnclosed: `<script>${P}`,
      scriptInDiv: `<div><script>${P}</script></div>`,
      scriptNs: `<x:script>${P}</x:script>`,
      svgScript: `<svg><script>${P}</script></svg>`,
      scriptClose2: `<script>${P}</script >`,
      scriptInA: `<a href="${E}/z"><script>${P}</script></a>`,
      scriptInCode: `<code><script>${P}</script></code>`,
      scriptInPre: `<pre><script>${P}</script></pre>`,
      scriptMd: `text\n<script>\n\n${P}\n\n</script>\n`,
      style: `<style>${P}</style>`,
      STYLE: `<STYLE>${P}</STYLE>`,
      styleInStyle: `<style></style\t>${P}</style>`,
      styleNs: `<x:style>${P}</x:style>`,
      styleUnclosed: `<div><style>${P}</div>`,
    }
    for (const [name, body] of Object.entries(shapes)) {
      for (const forApp of [false, true]) {
        it(`${name} forApp=${forApp}`, () => {
          expect(violations(markdown2Html(body, forApp), forApp)).toEqual([])
        })
      }
    }
  })

  describe('tag names xmldom and xss split differently', () => {
    for (const sep of [' ', '﻿']) {
      const code = `U+${sep.charCodeAt(0).toString(16).padStart(4, '0')}`
      const bodies = [
        `<div><img${sep}x src="${E}/t.gif?x"></div>`,
        `<div><img${sep}x src="${E}/t?x"/></div>`,
        `<div><video${sep}x poster="${E}/p?x" controls></video${sep}x></div>`,
        `<div><a${sep}x href="${E}/q" class="er-author markdown-x" data-author="SENT" rel="opener" target="_top">@alice</a${sep}x></div>`,
        `<div><picture${sep}x><source${sep}x type="image/webp" srcset="${E}/s"/><img${sep}x src="${E}/t?x"/></picture${sep}x></div>`,
      ]
      for (const forApp of [false, true]) {
        it(`${code} forApp=${forApp}`, () => {
          for (const body of bodies) expect(violations(markdown2Html(body, forApp), forApp)).toEqual([])
        })
      }
    }
  })

  describe('final pass trusts only elements the render itself produced', () => {
    const nonce = 'n0nce-for-test'
    it('strips markers and link policy from unstamped elements, keeps stamped ones', () => {
      const html =
        `<a class="markdown-post-link text-center" data-author="SENT" rel="opener" target="_top" href="${E}/q">a</a>` +
        `<a data-rh="${nonce}" class="markdown-author-link" data-author="alice">b</a>`
      const out = sanitizeHtml(html, { renderNonce: nonce })
      expect(out).toContain('<a class="text-center" href="https://evil.example/q" rel="nofollow ugc noopener">a</a>')
      expect(out).toContain('<a class="markdown-author-link" data-author="alice">b</a>')
      expect(out).not.toContain(nonce)
    })

    it('a guessed nonce attribute does not count', () => {
      const out = sanitizeHtml('<a data-rh="other" class="markdown-post-link" data-author="SENT">a</a>', { renderNonce: 'real' })
      expect(out).not.toContain('data-author')
    })

    it('serves every image and poster through the proxy, stamped or not', () => {
      const out = sanitizeHtml(
        `<img data-rh="n" src="${E}/a.png"><img src="${E}/b.png" srcset="${E}/c.png 1x"><video data-rh="n" poster="${E}/p.png"></video>`,
        { renderNonce: 'n' }
      )
      expect(violations(out, false)).toEqual([])
      expect(out).not.toContain('evil.example')
    })
  })

  describe('comment, PI and CDATA removal scales linearly', () => {
    const fill = (unit: string) => '<div>' + unit.repeat(Math.floor(256000 / unit.length)) + '</div>'
    for (const [name, unit] of [['pi', '<?x?>'], ['cdata', '<![CDATA[]]>'], ['comment', '<!---->']]) {
      it(`${name} x 256 KB`, () => {
        const t0 = performance.now()
        markdown2Html(fill(unit), false)
        expect(performance.now() - t0).toBeLessThan(2000)
      })
    }
  })

  describe('a() link policy on author chip classes', () => {
    it('drops an author rel on an er-tag link to an external host', () => {
      const out = markdown2Html(`<a class="er-tag" rel="dofollow" href="${E}/q">t</a>`, false)
      expect(out).not.toContain('dofollow')
      expect(out).toContain('rel="nofollow ugc noopener"')
    })

    it('matches chip classes as whole tokens', () => {
      const out = markdown2Html(`<a class="x er-authority" target="_blank" href="${E}/q">t</a>`, false)
      expect(out).toContain('rel="nofollow ugc noopener"')
      expect(out).toContain('markdown-external-link')
    })
  })

  describe('compatibility', () => {
    it('a body starting with a comment renders as on develop', () => {
      expect(markdown2Html('<!-- c -->\nHello @alice', false)).toBe(
        '<span>\nHello <a class="er-author er-author-link" href="/@alice"><img class="er-author-link-image" src="https://i.ecency.com/u/alice/avatar/small" alt="alice" itemprop="image" loading="lazy" decoding="async" />@alice</a></span>'
      )
    })

    const canon: Array<[string, string]> = [
      ['https://www.youtube.com/EMBED/dQw4w9WgXcQ', 'https://www.youtube.com/embed/dQw4w9WgXcQ'],
      ['https://www.youtube.com/shorts/dQw4w9WgXcQ', 'https://www.youtube.com/embed/dQw4w9WgXcQ'],
      ['https://www.bitchute.com/video/AbCdEf123/', 'https://www.bitchute.com/embed/AbCdEf123/'],
      ['https://www.brighteon.com/1a2b3c4d-5e6f', 'https://www.brighteon.com/embed/1a2b3c4d-5e6f'],
    ]
    for (const [src, want] of canon) {
      it(`simpleMarkdownToHTML canonicalises ${src}`, () => {
        expect(simpleMarkdownToHTML(`<iframe src="${src}"></iframe>`)).toContain(`src="${want}"`)
      })
    }

    it('a YouTube URL in non-autolinked text keeps the text around it', () => {
      const out = markdown2Html('<div>see https://www.youtube.com/watch?v=dQw4w9WgXcQ now</div>', false)
      expect(out).toContain('data-youtube="dQw4w9WgXcQ"')
      expect(out).toContain('see ')
      expect(out).toContain(' now')
    })
  })

  describe('author rel/target on links the app or the page opens itself', () => {
    it('forApp external link', () => {
      const out = markdown2Html(`<a href="${E}/q" rel="opener" target="_top">x</a>`, true)
      expect(out).not.toMatch(/rel=|target=/)
      expect(out).toContain('data-href="https://evil.example/q"')
    })
    it('web same-document link', () => {
      const out = markdown2Html('<a href="#top" rel="opener" target="_top">x</a>', false)
      expect(out).not.toMatch(/rel=|target=/)
    })
  })

  describe('attribute names xss rewrites (review r17)', () => {
    const forged = '<div><a\u000bcléass="markdown-post-link" datéa-author="zzsent" datéa-permlink="zz" hréef="https://evil.example/q" réel="opener" targéet="_top">hi</a></div>'
    for (const forApp of [false, true]) {
      it(`illegal characters in names forApp=${forApp}`, () => {
        const out = markdown2Html(forged, forApp)
        expect(out).not.toContain('markdown-post-link')
        expect(out).not.toContain('data-author')
        expect(out).not.toContain('rel="opener"')
        expect(out).not.toContain('target="_top"')
        // A link that survives carries the external-link policy.
        for (const tag of out.match(/<a\b[^>]*href="https:\/\/evil[^>]*>/g) ?? []) {
          expect(tag).toContain('rel="nofollow ugc noopener"')
        }
      })
    }

    it('entity placeholders in names (forApp)', () => {
      const out = markdown2Html('<div><a\u000bcl&a;ss="markdown-post-link" data-auth&o;r="zzsent" hr&e;f="https://evil.example/q" r&e;l="opener">hi</a></div>', true)
      expect(out).not.toContain('markdown-post-link')
      expect(out).not.toContain('rel="opener"')
      expect(out).not.toContain('data-author')
    })

    it('the final pass distrusts a stamped tag whose raw names xss would rewrite', () => {
      const out = sanitizeHtml('<a data-rh="N" cléass="markdown-post-link" datéa-author="x" réel="opener">a</a>', { renderNonce: 'N' })
      expect(out).not.toContain('markdown-post-link')
      expect(out).not.toContain('data-author')
      expect(out).not.toContain('rel="opener"')
    })

    it('an untrusted external link gets the link policy', () => {
      const out = sanitizeHtml('<a href="https://evil.example/q" rel="opener" target="_top">a</a>', { renderNonce: 'N' })
      expect(out).toBe('<a href="https://evil.example/q" rel="nofollow ugc noopener">a</a>')
    })
  })

  describe('CDATA is written as escaped text (review r17)', () => {
    it('in the render', () => {
      const out = markdown2Html('<div>\n<![CDATA[<b>bold</b>]]>\n</div>', false)
      expect(out).toContain('&lt;b&gt;bold&lt;/b&gt;')
      expect(out).not.toContain('<b>')
    })

    it('in the serializer filter', () => {
      const doc = DOMParser.parseFromString('<body id="root"><div><![CDATA[<b>x</b> & y]]></div></body>', 'text/html')
      const html = new XMLSerializer().serializeToString(doc, xmldomNodeFilter('N'))
      expect(html).toContain('&lt;b&gt;x&lt;/b&gt; &amp; y')
    })
  })

  describe('wrapper clean-up leaves author tags alone (review r17)', () => {
    it('header and lookalike names keep their content', () => {
      const out = markdown2Html('<header>a</header>keep me<head>b</head>tail <htmlx>z</htmlx>', false)
      expect(out).toContain('a')
      expect(out).toContain('keep me')
      expect(out).toContain('tail')
      expect(out).toContain('z')
    })
  })

  it('strips class tokens that contain markdown- anywhere (review r17 fuzz)', () => {
    for (const forApp of [false, true]) {
      const out = markdown2Html('<div><div class="`markdown-zzsent` text-center ]]>markdown-post-link">y</div></div>', forApp) +
        // No `>` and no reference: only the substring rule catches these.
        markdown2Html('<div><div class="`markdown-zzsent` text-center xmarkdown-post-link">y</div></div>', forApp)
      expect(out).not.toContain('markdown-')
      expect(out).toContain('class="text-center"')
    }
  })

  describe('character references in class and link values (review r19)', () => {
    const dashes = ['&#45;', '&#x2d;', '&#X2D;', '&#045;', '&#0045;', '&#x002d;']
    for (const dash of dashes) {
      for (const forApp of [false, true]) {
        it(`class "markdown${dash}video-play" forApp=${forApp}`, () => {
          const out = markdown2Html(`<div><span class="markdown${dash}video-play text-center">x</span></div>`, forApp)
          expect(out).not.toMatch(/markdown(-|&#)/i)
          expect(out).toContain('class="text-center"')
        })
      }
    }

    it('a control character inside the token (U+007F)', () => {
      for (const forApp of [false, true]) {
        const out = markdown2Html('<div><span class="mark\u007fdown-video-play text-center">x</span></div>', forApp)
        // U+007F separates tokens: `mark` and `down-video-play`, neither a
        // marker, and neither a class an author may write.
        expect(out).not.toMatch(/mark\u007f?down/i)
        expect(out).toContain('class="text-center"')
      }
    })

    it('a typed placeholder look-alike restored to an entity (forApp)', () => {
      const out = markdown2Html('<div><span class="markdown​0​video-play">x</span> a&#45;b</div>', true)
      expect(out).not.toMatch(/class="[^"]*markdown/i)
    })

    for (const forApp of [false, true]) {
      it(`anchor class, rel and target through references forApp=${forApp}`, () => {
        const forgedClass = markdown2Html('<div><a class="markdown&#45;post-link" rel="opener" target="_top">x</a></div>', forApp)
        expect(forgedClass).not.toMatch(/markdown(-|&#)post-link/)
        const out = [
          forgedClass,
          // This one is a real post link: render-helper's own marker is fine.
          markdown2Html('<div><a rel="op&#101;ner" target="_t&#111;p" href="/@alice/post-one">x</a></div>', forApp),
          markdown2Html('<div><a rel="op&#101;ner" target="_t&#111;p" href="https://evil.example/q">x</a></div>', forApp),
        ].join('\n')
        expect(out).not.toContain('rel="op')
        expect(out).not.toContain('_top')
      })
    }

    it('trusted anchors keep only the rel/target values render-helper emits', () => {
      const out = sanitizeHtml(
        '<a data-rh="N" href="https://e.example/" target="_top" rel="opener noreferrer">a</a>' +
          '<a data-rh="N" href="https://e.example/" target="_blank" rel="nofollow ugc noopener">b</a>',
        { renderNonce: 'N' }
      )
      expect(out).toContain('<a href="https://e.example/">a</a>')
      expect(out).toContain('<a href="https://e.example/" target="_blank" rel="nofollow ugc noopener">b</a>')
    })
  })

  describe('strict tag grammar at the boundary (review r19)', () => {
    const forged = [
      '<a title="t" cléass="markdown-post-link" data-rh="N">a</a>',
      '<a title="t" datéa-author="zz" x="1" datéa-permlink="p" data-rh="N">a</a>',
      '<a title="t" hréef="https://evil.example/" x="1" réel="opener" y="1" targéet="_top" data-rh="N">a</a>',
      '<a title="t" data-rh="N"\ncléass="markdown-post-link">a</a>',
      '<a title="t" cl"ass="markdown-post-link" data-rh="N">a</a>',
    ]
    for (const html of forged) {
      it(JSON.stringify(html), () => {
        const out = sanitizeHtml(html, { renderNonce: 'N' })
        expect(out).not.toContain('markdown-post-link')
        expect(out).not.toContain('data-author')
        expect(out).not.toContain('rel="opener"')
        expect(out).not.toContain('_top')
      })
    }

    it('after another attribute, end to end', () => {
      for (const forApp of [false, true]) {
        const out = markdown2Html('<div><a\u000btitle="t" cléass="markdown-post-link" x="1" datéa-author="zzsent" y="1" hréef="https://evil.example/q" z="1" réel="opener">hi</a><span\u000btitle="t" cléass="markdown-video-play">hi</span></div>', forApp)
        expect(out).not.toContain('markdown-post-link')
        expect(out).not.toContain('markdown-video-play')
        expect(out).not.toContain('data-author')
        expect(out).not.toContain('rel="opener"')
      }
    })
  })

  describe('each upstream attribute-name guard on its own (review r19)', () => {
    const parse = () =>
      DOMParser.parseFromString('<body id="root"><a cléass="markdown-post-link" title="t">x</a></body>', 'text/html')
    const attrNames = (el: { attributes: ArrayLike<{ name: string }> }) => Array.from(el.attributes, (a) => a.name)

    it('stripAuthorMarkers drops an attribute xss would rename', () => {
      const doc = parse()
      stripAuthorMarkers(doc as unknown as Document)
      expect(attrNames(doc.getElementsByTagName('a')[0])).toEqual(['title'])
    })

    it('the serializer filter drops it before stamping', () => {
      const doc = parse()
      const html = new XMLSerializer().serializeToString(doc, xmldomNodeFilter('N'))
      expect(html).toContain('<a title="t" data-rh="N">x</a>')
    })
  })

  describe('document wrapper clean-up (review r19)', () => {
    it('removes only the wrapper tags themselves', () => {
      expect(stripDocumentWrapper('<html><head><title>t</title></head><body id="root"><htmlx>z</htmlx><html-x>y</html-x></body></html>'))
        .toBe('<htmlx>z</htmlx><html-x>y</html-x>')
    })
  })

  describe('review r20 pins', () => {
    it('an unquoted attribute value makes a stamped tag untrusted', () => {
      const out = sanitizeHtml('<a data-rh="N" x=1 class="markdown-post-link" data-author="z">a</a>', { renderNonce: 'N' })
      expect(out).not.toContain('markdown-post-link')
      expect(out).not.toContain('data-author')
    })

    it('a control character in a class separates tokens, as on develop', () => {
      // The references trigger the class rebuild; the encoded form feed must
      // still separate a from b (xss turns control characters into spaces).
      const out = sanitizeHtml('<span data-rh="N" class="a&#12;b markdown&#45;x">s</span>', { renderNonce: 'N' })
      expect(out).toContain('class="a b"')
    })
  })
})
