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
    expect(catchPostImage(entry(body), 0, 0, 'match')).toBe(catchPostImage(entry(plain), 0, 0, 'match'))
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

describe('#2156-#2160 review round', () => {
  it('an entity in the second of two adjacent images stays out of its proxied URL (app)', () => {
    const body = '![a](https://e.com/i.png)![b](https://e.com/j.png?x=1&amp;y=2)'
    const srcs = (html: string) => [...html.matchAll(/<img [^>]*src="([^"]*)"/g)].map((m) => m[1])
    expect(srcs(render(body))).toEqual(srcs(render(body, false)))
    expect(render('[a](https://e.com/1)https://e.com/2?x=1&amp;y=2').match(/data-href="(https:\/\/e\.com\/2[^"]*)"/)?.[1]).toBe('https://e.com/2?x=1&amp;y=2')
  })

  it.each([
    '(https://e.com/a)&amp;x', "https://e.com/a'&amp;x", 'https://e.com/a))&amp;x', 'https://e.com/a)(&amp;x', 'x https://e.com/a)&amp;x'
  ])('linkify names the URL the web names (%j)', (body) => {
    const hrefs = (html: string) => [...html.matchAll(/(?:data-)?href="([^"]*)"/g)].map((m) => m[1])
    expect(hrefs(render(body))).toEqual(hrefs(render(body, false)))
  })

  it.each(['**https://h.example/p.jpg**', '*https://h.example/p.jpg*', '~~https://h.example/p.jpg~~', 'text **https://h.example/p.jpg**.'])('the card leaves emphasis markers out (%j)', (body) => {
    expect(getEntryCardImageRawUrl(entry(body))).toBe('https://h.example/p.jpg')
  })

  it.each(['https://h.example/p.jpg[^1]', 'https://h.example/p.jpg[x](https://e.com)', 'https://h.example/p.jpg![x](https://e.com/q.png)'])('the card leaves a following construct out (%j)', (body) => {
    expect(getEntryCardImageRawUrl(entry(body))).toBe('https://h.example/p.jpg')
  })

  it('an underscore host is a host', () => {
    expect(getEntryCardImageRawUrl(entry('https://my_bucket.s3.amazonaws.com/a/p.jpg'))).toBe('https://my_bucket.s3.amazonaws.com/a/p.jpg')
  })

  it.each([
    ['![x](<https://e.com/50% off.png>)', '![x](https://e.com/50%25%20off.png)'],
    ['![x](<https://e.com/a\\_b.png>)', '![x](https://e.com/a_b.png)']
  ])('an angle image destination reads as its plain spelling (%j)', (angle, plain) => {
    expect(getEntryCardImageRawUrl(entry(angle))).toBe(getEntryCardImageRawUrl(entry(plain)))
    for (const forApp of [true, false]) {
      expect(render(angle, forApp).match(/<img [^>]*src="([^"]*)"/)?.[1]).toBe(render(plain, forApp).match(/<img [^>]*src="([^"]*)"/)?.[1])
    }
  })

  it('an angle link with a stray % keeps a well-formed URL', () => {
    expect(href(render('[x](<https://e.com/50% off>)', false))).toBe('https://e.com/50%25%20off')
  })
})

describe('#2156-#2160 second review round', () => {
  const renderedImage = (body: string) => render(body, false).match(/<img [^>]*src="([^"]*)"/)?.[1] ?? null

  it.each([
    ['*italic*https://e.com/a*b.png', 'https://e.com/a*b.png'],
    ['_**https://e.com/a_b.png**_', 'https://e.com/a_b.png'],
    ['https://e.com/a.png[a[b]](c)', 'https://e.com/a.png'],
    ['https://e.com/a.png[x]\n\n[x]: /u', 'https://e.com/a.png']
  ])('the card reads %j as the render does', (body, url) => {
    expect(getEntryCardImageRawUrl(entry(body))).toBe(url)
    expect(renderedImage(body)).toBe(proxifyImageSrc(url, 0, 0, 'match').replace(/&/g, '&amp;').replace(/\?format=match&amp;mode=fit$/, '') + '?format=match&amp;mode=fit')
  })

  it.each(['https://a_.b.com/p.jpg', 'https://a.b_c/p.jpg', 'https://x.y_z.com/p.jpg', 'https://e..com/p.jpg'])('a host Autolinker cuts short is no image (%j)', (body) => {
    expect(getEntryCardImageRawUrl(entry(body))).toBeNull()
    expect(renderedImage(body)).toBeNull()
  })

  it('stays linear on long emphasis runs', () => {
    const body = (n: number) => '*'.repeat(n) + 'https://e.com/x.png' + ('*'.repeat(n - 1) + 'a').repeat(2)
    const time = (n: number) => { const t = performance.now(); getEntryCardImageRawUrl(entry(body(n))); return performance.now() - t }
    time(1000)
    expect(time(80_000)).toBeLessThan(2000)
  })

  it('an invalid numeric reference reads as the web reads it, for linkify', () => {
    const body = 'see www.e.com/it&#146;s now'
    expect(href(render(body))).toBe(href(render(body, false)))
  })
})
