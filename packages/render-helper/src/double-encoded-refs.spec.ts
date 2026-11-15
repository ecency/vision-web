import { describe, expect, it } from 'vitest'
import { markdown2Html } from './markdown-2-html'
import { sanitizeHtml } from './methods/sanitize-html.method'
import { simpleMarkdownToHTML } from './methods/simple-markdown-to-html.method'
import { decodeEntities } from './helper'
import { isAllowedEmbedSrc } from './consts'
import { getProxyBase } from './proxify-image-src'

// #1919 review r20: the sanitizer validated each URL decoded once but let xss
// emit the raw value, which a browser decodes again. `&#38;#47;` validated as
// the literal text `&#47;` and then loaded as `/`. Whatever is emitted must be
// exactly the string that was validated.

const S = '&#38;#47;'
const iframeSrc = `https://archive.org/embed/x${S}..${S}..${S}download${S}item${S}evil.html`
const base = `${getProxyBase()}/`
const srcset = `${base}p/x&#38;#32;1x&#38;#44;https://evil.example/t.png 2x`

/** What a browser would load: attribute values decoded once more. */
const browserValues = (html: string, attr: string) =>
  [...html.matchAll(new RegExp(`\\s${attr}="([^"]*)"`, 'g'))].map((m) => decodeEntities(m[1]))

const paths: Record<string, (body: string) => string> = {
  app: (b) => markdown2Html(b, true),
  web: (b) => markdown2Html(b, false),
  simple: (b) => simpleMarkdownToHTML(b),
  untransformed: (b) => sanitizeHtml(b, { untransformed: true }),
  plain: (b) => sanitizeHtml(b),
}

describe('double-encoded character references in URL attributes (review r20)', () => {
  for (const [name, render] of Object.entries(paths)) {
    it(`iframe src past the per-host path pattern: ${name}`, () => {
      for (const src of browserValues(render(`<div><iframe src="${iframeSrc}"></iframe></div>`), 'src')) {
        expect(isAllowedEmbedSrc(src)).toBe(true)
        expect(src).not.toContain('download/item')
      }
    })

    it(`srcset candidate off the proxy: ${name}`, () => {
      const out = render(`<div><picture><source type="image/webp" srcset="${srcset}"><img src="${base}p/abc"></picture></div>`)
      for (const value of browserValues(out, 'srcset')) {
        const candidates = value.split(',').map((c) => c.trim()).filter(Boolean)
        expect(candidates.every((c) => c.startsWith(base))).toBe(true)
      }
    })
  }

  it('a URL whose query string is entity-encoded keeps working', () => {
    const out = markdown2Html('<div><iframe src="https://www.youtube.com/embed/dQw4w9WgXcQ?a=1&amp;b=2"></iframe></div>', false)
    expect(out).toContain('src="https://www.youtube.com/embed/dQw4w9WgXcQ"')
  })
})
