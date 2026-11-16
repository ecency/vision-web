import { describe, expect, it } from 'vitest'
import { decodeHTMLAttribute } from 'entities'
import { isAllowedEmbedSrc } from './consts'
import { sanitizeHtml } from './methods/sanitize-html.method'
import { simpleMarkdownToHTML } from './methods/simple-markdown-to-html.method'
import { markdown2Html } from './markdown-2-html'
import { getProxyBase } from './proxify-image-src'

// #1919 review r24: a value is only safe if what a BROWSER loads from it is.
// Browsers resolve attribute URLs against the page, so a spelling the URL
// parser rejects or treats as relative (`https:/host`, `https:host`, a
// leading NBSP/BOM, a NUL) must never be accepted as an absolute embed.
const PAGE = 'https://ecency.com/hive-1/@a/b'
// The HTML parser turns NUL into U+FFFD before the URL parser sees it.
const resolve = (v: string) => {
  try {
    return new URL(v.replace(/\u0000/g, '\uFFFD'), PAGE).href
  } catch {
    return 'INVALID'
  }
}

const hosts = ['www.youtube.com/embed/abc', 'archive.org/embed/x', 'player.twitch.tv/?channel=x', 'x.dapplr.in/file/dapplr-videos/a']
const prefixes = [
  'https://', 'https:/', 'https:', 'https:\\\\', 'https:///', '&nbsp;https://', '&#xa0;https://', '&#xfeff;https://',
  '&#x2028;https://', '&#x3000;https://', '&#x1680;https://', '&#x85;https://', '\u0000https://', 'https://\u0000',
  '&#x20;https://', '&#x1f;https://', ' https://', '﻿https://', '&shy;https://',
]

describe('embed URLs against a base-relative browser oracle (review r24)', () => {
  it('isAllowedEmbedSrc only accepts what a browser resolves to an allowed embed', () => {
    for (const h of hosts) {
      for (const p of prefixes) {
        const v = decodeHTMLAttribute(p + h)
        if (isAllowedEmbedSrc(v)) expect(isAllowedEmbedSrc(resolve(v)), JSON.stringify(v)).toBe(true)
      }
    }
  })

  it('rejects scheme spellings a browser reads as relative', () => {
    for (const v of ['\u0000https://www.youtube.com/embed/abc', 'https://www.youtube.com/embed/abc\u0000', 'https:/www.youtube.com/embed/abc', 'https:www.youtube.com/embed/abc', ' https://www.youtube.com/embed/abc', '﻿https://www.youtube.com/embed/abc', 'https://www.you\u0000tube.com/embed/abc']) {
      expect(isAllowedEmbedSrc(v), JSON.stringify(v)).toBe(false)
    }
    expect(isAllowedEmbedSrc(' https://www.youtube.com/embed/abc ')).toBe(true)
  })

  const renders: Record<string, (b: string) => string> = {
    web: (b) => markdown2Html(b, false),
    app: (b) => markdown2Html(b, true),
    simple: (b) => simpleMarkdownToHTML(b),
    plain: (b) => sanitizeHtml(b),
    untransformed: (b) => sanitizeHtml(b, { untransformed: true }),
  }
  for (const [name, render] of Object.entries(renders)) {
    it(`rendered iframe sources resolve to allowed embeds: ${name}`, () => {
      for (const h of hosts) {
        for (const p of prefixes) {
          const out = render(`<div><iframe src="${p}${h}"></iframe></div>`)
          for (const m of out.matchAll(/<iframe\b[^>]*?\ssrc="([^"]*)"/g)) {
            expect(isAllowedEmbedSrc(resolve(decodeHTMLAttribute(m[1]))), `${p}${h} -> ${m[1]}`).toBe(true)
          }
        }
      }
    })
  }

  // WHATWG srcset candidate URLs: split on ASCII whitespace and commas only.
  const srcsetUrls = (v: string) =>
    v.split(',').map((c) => c.replace(/^[\t\n\f\r ]+/, '').split(/[\t\n\f\r ]+/)[0]).filter(Boolean)
  const base = `${getProxyBase()}/`
  for (const [name, render] of Object.entries({ web: renders.web, app: renders.app, untransformed: renders.untransformed })) {
    it(`srcset candidates resolve onto the proxy: ${name}`, () => {
      for (const lead of ['&nbsp;', '&#xfeff;', '&#x2028;', '&#x3000;', ' ']) {
        const out = render(`<div><picture><source type="image/webp" srcset="${lead}${base}p/x 1x"><img src="${base}p/abc" srcset="${lead}${base}p/y 1x"></picture></div>`)
        for (const m of out.matchAll(/\ssrcset="([^"]*)"/g)) {
          for (const u of srcsetUrls(decodeHTMLAttribute(m[1]))) expect(resolve(u).startsWith(base), `${lead} -> ${u}`).toBe(true)
        }
      }
    })
  }
})
