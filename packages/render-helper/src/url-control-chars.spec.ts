import { describe, expect, it } from 'vitest'
import { simpleMarkdownToHTML } from './methods/simple-markdown-to-html.method'
import { sanitizeHtml } from './methods/sanitize-html.method'
import { isAllowedEmbedSrc } from './consts'
import { decodeHTMLAttribute } from 'entities'

// What a browser loads: attribute decoded, then the WHATWG URL parser.
const loaded = (html: string, attr = 'src') =>
  [...html.matchAll(new RegExp(`\\s${attr}="([^"]*)"`, 'g'))].map((m) => new URL(decodeHTMLAttribute(m[1])).href)

describe('r21: raw TAB/LF/CR inside a dot segment', () => {
  for (const [name, c] of [['TAB', '\t'], ['LF', '\n'], ['CR', '\r']] as const) {
    const src = `https://archive.org/download/ITEM/.${c}./.${c}./embed/x`
    it(`${name}: untransformed fallback`, () => {
      for (const href of loaded(sanitizeHtml(`<iframe src="${src}"></iframe>`, { untransformed: true }))) expect(isAllowedEmbedSrc(href)).toBe(true)
    })
    it(`${name}: plain sanitizeHtml`, () => {
      for (const href of loaded(sanitizeHtml(`<iframe src="${src}"></iframe>`))) expect(isAllowedEmbedSrc(href)).toBe(true)
    })
    it(`${name}: simpleMarkdownToHTML`, () => {
      for (const href of loaded(simpleMarkdownToHTML(`<iframe src="${src}"></iframe>`))) expect(isAllowedEmbedSrc(href)).toBe(true)
    })
    it(`${name}: data-embed-src plain`, () => {
      for (const href of loaded(sanitizeHtml(`<a data-embed-src="${src}" href="#">x</a>`), 'data-embed-src')) expect(isAllowedEmbedSrc(href)).toBe(true)
    })
  }
})
