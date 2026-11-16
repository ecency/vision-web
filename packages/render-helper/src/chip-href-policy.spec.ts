import { describe, expect, it } from 'vitest'
import { markdown2Html } from './markdown-2-html'
import { sanitizeHtml } from './methods/sanitize-html.method'
import { proxifyImageSrc } from './proxify-image-src'

// A browser reads `\` as `/` in an http(s) href and drops tab, LF and CR, so
// `/\evil.example/x` goes off-site. A chip class an author put on such a link
// must not earn it the in-site treatment that skips the link policy.
let n = 0
const render = (body: string) =>
  markdown2Html({ author: 'chip', permlink: `c${n++}`, last_update: '2026-11-16', body } as never, false)

const OFF_SITE = [
  '/\\evil.example/x',
  '/\\/evil.example/x',
  '/\t/evil.example/x',
  '/\n/evil.example/x',
  '\\\\evil.example/x',
  '/\\\tevil.example/x'
]

// The sanitize-only path emits an off-site href the way a browser reads it,
// with the policy: no raw control characters, no backslash forms.
describe('sanitize-only path emits the browser reading of an off-site href', () => {
  it.each([
    ['/\\evil.example/x', '//evil.example/x'],
    ['https:\\\\evil.example/x', 'https://evil.example/x'],
    ['\u0000//evil.example/x', '//evil.example/x'],
    ['&#0;//evil.example/x', '//evil.example/x']
  ])('%j', (href, emitted) => {
    const out = sanitizeHtml(`<a href="${href}">x</a>`, { untransformed: true })
    expect(out).toContain(`href="${emitted}" rel="nofollow ugc noopener"`)
  })
})

// Every emitted link either stays on the site, read the way a browser reads
// it, or carries the external-link policy.
const offSiteLinksWithoutPolicy = (html: string): string[] =>
  [...html.matchAll(/<a\b[^>]*>/g)]
    .map((m) => m[0])
    .filter((tag) => {
      const href = /\shref="([^"]*)"/.exec(tag)?.[1]?.replace(/&amp;/g, '&')
      if (href === undefined) return false
      let host = ''
      try {
        host = new URL(href, 'https://ecency.com/').hostname
      } catch {
        // Unparseable: treat as off-site, so it must carry the policy.
      }
      return host !== 'ecency.com' && !tag.includes('rel="nofollow ugc noopener"')
    })

describe('chip-classed links that leave the site', () => {
  it.each(OFF_SITE)('%j: no off-site link without the policy', (href) => {
    expect(offSiteLinksWithoutPolicy(render(`<a class="er-author" href="${href}">x</a>`))).toEqual([])
  })

  it('an in-site chip link stays in-site', () => {
    const html = render('<a class="er-author" href="/@alice">x</a>')
    expect(html).not.toContain('nofollow')
  })

  it.each(OFF_SITE)('sanitize-only path, %j: no off-site link without the policy', (href) => {
    // `untransformed` is the sanitize-only fallback: the DOM transforms did not
    // run, so the sanitizer applies the link policy itself.
    expect(offSiteLinksWithoutPolicy(sanitizeHtml(`<a href="${href}">x</a>`, { untransformed: true }))).toEqual([])
  })
})

// A poster comes only from raw HTML, already entity-decoded by the parser:
// decoding it again turned `?x=1&amp;times=2` into `?x=1×=2`.
describe('video poster proxy URL', () => {
  it('proxies the URL the post names', () => {
    const html = render('<video controls poster="https://e.com/p.png?x=1&amp;times=2" src="https://e.com/v.mp4"></video>')
    const expected = proxifyImageSrc('https://e.com/p.png?x=1&times=2', 0, 0, 'match', { forceProxy: true }).replace(/&/g, '&amp;')
    expect(html).toContain(`poster="${expected}"`)
  })
})
