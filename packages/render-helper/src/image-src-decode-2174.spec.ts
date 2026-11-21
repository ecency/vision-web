import { describe, expect, it } from 'vitest'
import { markdown2Html } from './markdown-2-html'
import { catchPostImage } from './catch-post-image'
import { getEntryLcpImage } from './card-image'
import { proxifyImageSrc } from './proxify-image-src'

let n = 0
const entry = (body: string) => ({ author: 'decode2174', permlink: `d${n++}`, last_update: '2026-11-21', body }) as never
const shown = (body: string) =>
  markdown2Html(entry(body), false).match(/<img [^>]*src="([^"]*)"/)?.[1]?.replace(/&amp;/g, '&') ?? null
const proxied = (url: string) => proxifyImageSrc(url, 0, 0, 'match')

describe('image src keeps escaped URL delimiters (#2174)', () => {
  it.each([
    'https://example.com/a%23b.png',
    'https://example.com/i.png?sig=ab%2Bcd%3D&u=a%26b',
    'https://example.com/dir%2Fa.png',
    'https://example.com/a.png?x=%3F',
    'https://example.com/a%2520b.png'
  ])('body, card and preload proxy %s as written', (url) => {
    const body = `![x](${url})`
    expect(shown(body)).toBe(proxied(url))
    expect(catchPostImage(entry(body), 0, 0, 'match')).toBe(proxied(url))
    expect(getEntryLcpImage(entry(body))?.url).toBe(url)
  })

  it.each([
    ['https://example.com/a%20b.png', 'https://example.com/a b.png'],
    ['https://example.com/caf%C3%A9.png', 'https://example.com/café.png']
  ])('still decodes %s as before (#2169 parity)', (url, decoded) => {
    const body = `![x](${url})`
    expect(shown(body)).toBe(proxied(decoded))
    expect(catchPostImage(entry(body), 0, 0, 'match')).toBe(proxied(decoded))
  })

  it('an HTML image keeps %23 as well', () => {
    const body = '<img src="https://example.com/a%23b.png">'
    expect(shown(body)).toBe(proxied('https://example.com/a%23b.png'))
    expect(catchPostImage(entry(body), 0, 0, 'match')).toBe(proxied('https://example.com/a%23b.png'))
  })

  it('a video poster keeps %23', () => {
    const html = markdown2Html(entry('<video poster="https://example.com/a%23b.png"></video>'), false)
    expect(html).toContain(`poster="${proxifyImageSrc('https://example.com/a%23b.png', 0, 0, 'match', { forceProxy: true }).replace(/&/g, '&amp;')}"`)
  })

  it.each([
    ['https://steemitimages.com/0x0/https%3A%2F%2Fe.com%2Fa.png', 'https://e.com/a.png'],
    ['https://images.hive.blog/640x0/https%3A%2F%2Fe.com%2Fa%20b.png', 'https://e.com/a%20b.png']
  ])('a legacy proxy URL with an encoded inner URL still unwraps to it (%s)', (url, inner) => {
    const body = `![x](${url})`
    expect(shown(body)).toBe(proxied(inner))
    expect(catchPostImage(entry(body), 600, 500, 'match')).toBe(proxifyImageSrc(inner, 600, 500, 'match'))
  })

  it('a malformed escape still keeps the URL as written', () => {
    const body = '![x](https://example.com/a%zz%23.png)'
    expect(shown(body)).toBe(proxied('https://example.com/a%zz%23.png'))
  })
})
