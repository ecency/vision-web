import { describe, expect, it } from 'vitest'
import { markdown2Html } from './markdown-2-html'
import { getEntryImageRawUrl } from './catch-post-image'
import { proxifyImageSrc } from './proxify-image-src'

// #2092. An image URL is proxied as the URL a browser reads from the markup,
// decoded once: `?x=1&amp;times=2` names `?x=1&times=2`, and a bare
// `&timestamp=2` stays as written. The web render, the app render and the LCP
// preload all compute that same URL.
let n = 0
const render = (body: string, forApp: boolean) =>
  markdown2Html({ author: 'dec', permlink: `d${n++}`, last_update: '2026-11-16', body } as never, forApp)
const firstImg = (html: string) => /<img[^>]*\ssrc="([^"]+)"/.exec(html)?.[1]?.replace(/&amp;/g, '&')
const proxyOf = (url: string) => proxifyImageSrc(url, 0, 0, 'match', { forceProxy: true })

const CASES: Array<[string, string]> = [
  ['<img src="https://e.com/i.png?x=1&amp;times=2">', 'https://e.com/i.png?x=1&times=2'],
  ['<img src="https://e.com/i.png?a=1&timestamp=2">', 'https://e.com/i.png?a=1&timestamp=2'],
  ['<img src="https://e.com/i.png?a=1&amp;b=2">', 'https://e.com/i.png?a=1&b=2'],
  ['![](https://e.com/i.png?x=1&amp;times=2)', 'https://e.com/i.png?x=1&times=2'],
  ['![](https://e.com/i.png?a=1&timestamp=2)', 'https://e.com/i.png?a=1&timestamp=2'],
  ['![](https://e.com/i.png?a=1&amp;b=2)', 'https://e.com/i.png?a=1&b=2'],
  ['![](https://e.com/i.png?a=1&b=2)', 'https://e.com/i.png?a=1&b=2'],
  ['[https://e.com/i.png?x=1&amp;copy=2](https://e.com/i.png?x=1&amp;copy=2)', 'https://e.com/i.png?x=1&copy=2'],
  ['Look\n\nhttps://e.com/i.png?x=1&amp;times=2\n\nhere', 'https://e.com/i.png?x=1&times=2'],
  ['![](https://e.com/i%20j.png?a=1&amp;b=2)', 'https://e.com/i j.png?a=1&b=2']
]

describe('image URL decoding (#2092)', () => {
  it.each(CASES)('web proxies what a browser reads: %s', (body, url) => {
    expect(firstImg(render(body, false))).toBe(proxyOf(url))
  })

  it.each(CASES)('app proxies the same URL: %s', (body, url) => {
    expect(firstImg(render(body, true))).toBe(proxyOf(url))
  })

  it.each(CASES)('the LCP preload matches: %s', (body, url) => {
    expect(proxyOf(getEntryImageRawUrl(body)!)).toBe(proxyOf(url))
  })

  // The app's entity swap kept a URL whole only up to its first `)`.
  it.each([
    '<img src="https://e.com/photo_(1).png?a=1&amp;b=2">',
    '![](https://upload.wikimedia.org/a/thumb/X_(Y).jpg?w=1&amp;h=2)'
  ])('app keeps a URL with parentheses whole: %s', (body) => {
    expect(firstImg(render(body, true))).toBe(firstImg(render(body, false)))
  })

  // CommonMark only reads a reference that ends in `;` in a destination: a
  // legacy name without one stays as written.
  it.each([
    ['[x](https://e.com/?a=1&copy)', 'https://e.com/?a=1&amp;copy'],
    ['[x](https://e.com/?a=1&not-b=2)', 'https://e.com/?a=1&amp;not-b=2'],
    ['[x](https://e.com/?a=1&amp)', 'https://e.com/?a=1&amp;amp'],
    ['[x](https://e.com/?a=1&copy;)', 'https://e.com/?a=1©']
  ])('markdown destination %s keeps a reference without `;` as written', (body, href) => {
    expect(render(body, false)).toContain(`href="${href}"`)
  })

  // A legacy name that only prefixes the `name;` token is not a reference.
  it.each([
    ['[x](https://e.com/?a=1&region;b=2)', 'https://e.com/?a=1&amp;region;b=2'],
    ['[x](https://e.com/?a=1&timestamp;b=2)', 'https://e.com/?a=1&amp;timestamp;b=2'],
    ['[x](https://e.com/?a=1&copyx;)', 'https://e.com/?a=1&amp;copyx;'],
    ['[x](https://e.com/?a=1&ampb;c)', 'https://e.com/?a=1&amp;ampb;c']
  ])('markdown destination %s is not prefix-decoded', (body, href) => {
    expect(render(body, false)).toContain(`href="${href}"`)
  })

  // The preload reads a markdown destination the same way the render does.
  it.each([
    '![](https://e.com/i.png?a=1&copy)',
    '![](https://e.com/i.png?a=1&not-b=2)',
    '![](https://e.com/i.png?a=1&amp)',
    '![](https://e.com/i.png?a=1&region;b=2)'
  ])('the LCP preload matches the render for %s', (body) => {
    expect(proxyOf(getEntryImageRawUrl(body)!)).toBe(firstImg(render(body, false)))
  })

  it('a markdown link with an escaped ampersand points where it says', () => {
    expect(render('[x](https://e.com/p?a=1&amp;b=2)', false)).toContain('href="https://e.com/p?a=1&amp;b=2"')
  })
})
