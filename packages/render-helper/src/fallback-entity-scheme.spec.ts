import { describe, expect, it, vi } from 'vitest'

// Both DOM passes fail -> markdownToHTML sanitizes the Remarkable output with no
// DOM transform. A scheme written as an entity (`data&colon;`) must not come out
// as a live dangerous URL on that path either (#2099).
vi.mock('./methods/traverse.method', () => ({
  traverse: () => {
    throw new Error('forced fallback')
  },
  MAX_TRAVERSE_DEPTH: 500,
}))

import { decodeHTMLAttribute } from 'entities'
import { markdown2Html } from './markdown-2-html'
import { sanitizeHtml } from './methods/sanitize-html.method'
import { simpleMarkdownToHTML } from './methods/simple-markdown-to-html.method'

const DANGEROUS = /^[\s\u0000-\u0020\ufffd]*(data|javascript|vbscript):/i
// Read the way a browser reads an href: tab/LF/CR inside the scheme are dropped.
const hrefs = (html: string) =>
  [...html.matchAll(/\shref="([^"]*)"/g)].map((m) => decodeHTMLAttribute(m[1]).replace(/[\t\n\r]/g, ''))

const bodies = [
  '<a href="data&colon;image/svg+xml,<svg/onload=alert(1)>">x</a>',
  '<a href="data&#58;text/html,hi">x</a>',
  '<a href="data&#x3a;text/html,hi">x</a>',
  '<a href="javascript&colon;alert(1)">x</a>',
  '<a href="vbscript&colon;msgbox(1)">x</a>',
  '<a href="jav&Tab;ascript&colon;alert(1)">x</a>',
  '<a href="&#x20;data&colon;text/html,hi">x</a>',
  // Spellings xss reads differently from our own decode: Unicode whitespace it
  // trims, a semicolon-less `&colon` it decodes, and a double encoding it
  // decodes a second time.
  '<a href="&#xfeff;data:image/svg+xml,AAA">x</a>',
  '<a href="&#x2028;data:image/svg+xml,AAA">x</a>',
  '<a href="&#x3000;data:image/svg+xml,AAA">x</a>',
  '<a href="&#x1680;data:image/svg+xml,AAA">x</a>',
  '<a href="data&colonimage/svg+xml,AAA">x</a>',
  '<a href="data&#38;colon;image/svg+xml,AAA">x</a>',
]

describe('sanitize-only fallback: entity-encoded schemes', () => {
  for (const body of bodies) {
    it(`sanitizeHtml untransformed: ${body}`, () => {
      for (const h of hrefs(sanitizeHtml(body, { untransformed: true }))) expect(h).not.toMatch(DANGEROUS)
    })
    it(`sanitizeHtml: ${body}`, () => {
      for (const h of hrefs(sanitizeHtml(body))) expect(h).not.toMatch(DANGEROUS)
    })
    it(`simpleMarkdownToHTML: ${body}`, () => {
      for (const h of hrefs(simpleMarkdownToHTML(body))) expect(h).not.toMatch(DANGEROUS)
    })
    for (const forApp of [false, true]) {
      it(`markdown2Html forApp=${forApp}: ${body}`, () => {
        for (const h of hrefs(markdown2Html(body, forApp))) expect(h).not.toMatch(DANGEROUS)
      })
    }
  }
})

describe('a refused href', () => {
  it('leaves no bare href on a tag that does not allow href', () => {
    expect(sanitizeHtml('<img href="data:image/x" src="https://i.example/a.png">')).not.toMatch(/\shref[\s>=]/)
  })
  it('keeps a telephone link on the sanitize-only paths', () => {
    expect(sanitizeHtml('<a href="tel:+15551234567">call</a>')).toBe('<a href="tel:+15551234567">call</a>')
    expect(simpleMarkdownToHTML('<a href="tel:+15551234567">call</a>')).toContain('href="tel:+15551234567"')
  })
  it('stays a bare href on a link', () => {
    expect(sanitizeHtml('<a href="data:image/x">x</a>')).toBe('<a href>x</a>')
  })
})
