import { describe, expect, it, vi } from 'vitest'
vi.mock('./methods/traverse.method', () => ({
  traverse: () => {
    throw new Error('forced fallback')
  },
  MAX_TRAVERSE_DEPTH: 500,
}))
import { markdown2Html } from './markdown-2-html'
import { isAllowedEmbedSrc } from './consts'
import { decodeHTMLAttribute } from 'entities'
describe('r21: raw LF in a dot segment, real last-resort fallback', () => {
  for (const forApp of [true, false]) for (const c of ['&#9;','&#10;','&#13;','&Tab;','&NewLine;','&#x9;']) it(`forApp=${forApp} ${JSON.stringify(c)}`, () => {
    const out = markdown2Html(`<iframe src="https://archive.org/download/ITEM/.${c}./.${c}./embed/x"></iframe> ${JSON.stringify(c)}${forApp}`, forApp)
    const hrefs = [...out.matchAll(/<iframe[^>]*\ssrc="([^"]*)"/g)].map((m) => new URL(decodeHTMLAttribute(m[1])).href)
    
    for (const h of hrefs) expect(isAllowedEmbedSrc(h)).toBe(true)
  })
})
