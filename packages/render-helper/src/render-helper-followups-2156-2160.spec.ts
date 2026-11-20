import { describe, expect, it } from 'vitest'
import { markdown2Html } from './markdown-2-html'
import { getEntryCardImageRawUrl } from './card-image'
import { catchPostImage } from './catch-post-image'
import { proxifyImageSrc } from './proxify-image-src'

let n = 0
const entry = (body: string) => ({ author: 'followup', permlink: `f${n++}`, last_update: '2026-11-21', body }) as never
const render = (body: string, forApp = true) => markdown2Html(entry(body), forApp)
const href = (html: string) => html.match(/(?:data-)?href="([^"]*)"/)?.[1]

describe('card image reads an angle-bracket image destination (#2156)', () => {
  it('as the plain form', () => {
    expect(getEntryCardImageRawUrl(entry('![x](<https://example.com/a.png?q=&amp;amp;>)'))).toBe(
      getEntryCardImageRawUrl(entry('![x](https://example.com/a.png?q=&amp;amp;)'))
    )
    expect(getEntryCardImageRawUrl(entry('![x](https://example.com/a.png?q=&amp;amp;)'))).toBe('https://example.com/a.png?q=&amp;')
  })

  it('with a space, as the render proxies it', () => {
    const body = '![x](<https://example.com/a b.png>)'
    const plain = '![x](https://example.com/a%20b.png)'
    expect(getEntryCardImageRawUrl(entry(body))).toBe(getEntryCardImageRawUrl(entry(plain)))
    // The LCP preload proxies the image the body shows, for both spellings.
    const shown = (b: string) => render(b).match(/<img [^>]*src="([^"]*)"/)?.[1]?.replace(/&amp;/g, '&')
    for (const b of [body, plain]) expect(catchPostImage(entry(b), 0, 0, 'match')).toBe(shown(b))
  })
})

describe('card image reads a bare markdown URL as the render does (#2157)', () => {
  it.each([
    ['https://h.example/p.jpg?a=1&#41;', 'https://h.example/p.jpg?a=1'],
    ['https://h.example/p.jpg?a=(1)', 'https://h.example/p.jpg?a=(1)'],
    ['https://h.example/p.jpg?a=1))', 'https://h.example/p.jpg?a=1)'],
    ['(https://h.example/p.jpg?size=1)text', 'https://h.example/p.jpg?size=1)text']
  ])('%s', (body, url) => {
    expect(getEntryCardImageRawUrl(entry(body))).toBe(url)
    expect(render(body, false)).toContain(proxifyImageSrc(url, 0, 0, 'match').split('?')[0])
  })
})

describe('angle destination leftovers (#2158)', () => {
  it.each([true, false])('a lone surrogate in an angle destination keeps the body (forApp %s)', (forApp) => {
    const html = render('text\n\n[y](<https://e.com/\ud800?q=1>)', forApp)
    expect(html).toContain('text')
    expect(html).toContain('y')
  })

  it('U+2029 inside an autolink names the web URL on the app', () => {
    const body = '<https://e.com/a b?q=&copy;&amp;z=1>'
    const app = render(body)
    expect(app).not.toMatch(/%E2%80%8B|​/)
    expect(href(app)).toBe(href(render(body, false)))
  })

  it.each([
    ['[x][k]\n\n[k]: https://e.com/%', '[x][k]\n\n[k]: <https://e.com/%>'],
    ['[x](https://e.com/é)', '[x](<https://e.com/é>)']
  ])('the plain and angle forms name the same URL (%j)', (plain, angle) => {
    for (const forApp of [true, false]) expect(href(render(angle, forApp))).toBe(href(render(plain, forApp)))
  })
})

describe('an uppercase scheme keeps its href on the web render (#2159)', () => {
  it.each(['HTTPS://A.com/p', 'Http://a.com', 'HTTP://a.com/x?y=1'])('%s', (url) => {
    const h = href(render(url, false))
    expect(h).toBeTruthy()
    expect(h!.toLowerCase()).toBe(url.toLowerCase().replace(/&/g, '&amp;'))
  })
})

describe('a bare URL followed by ) and an entity (#2160)', () => {
  it('links the same target with the same trailing text on both renders', () => {
    const body = 'see https://e.com/a)&amp;x end'
    const app = render(body)
    const web = render(body, false)
    expect(href(app)).toBe(href(web))
    const tail = (html: string) => html.replace(/<a [^>]*>[^<]*<\/a>/, '<a/>')
    expect(tail(app)).toBe(tail(web))
  })
})
