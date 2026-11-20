import { describe, expect, it } from 'vitest'
import { markdown2Html } from './markdown-2-html'
import { sanitizeHtml } from './methods/sanitize-html.method'
import { catchPostImage } from './catch-post-image'
import { getEntryCardImageRawUrl } from './card-image'
import { proxifyImageSrc } from './proxify-image-src'
import { imageUrlEnd } from './helper'
import { isAllowedEmbedSrc } from './consts'

// #2155, found by the native app's port of the renderer.
let n = 0
const entry = (body: string) => ({ author: 'edges', permlink: `x${n++}`, last_update: '2026-11-20', body }) as never
const untransformed = (html: string) => sanitizeHtml(html, { untransformed: true } as never)

describe('a refused iframe leaves nothing behind (#2155)', () => {
  it('drops the fallback text with the tags, as a browser never shows it', () => {
    expect(untransformed('<iframe src="https://evil.example.com/x">Unavailable</iframe>')).toBe('')
    expect(untransformed('<iframe src="https://evil.example.com/x">\n</iframe >after')).toBe('after')
    expect(untransformed('<IFRAME SRC="https://evil.example.com/x">Unavailable</IFRAME>')).toBe('')
  })

  it('keeps markup inside it, so the tags around it stay balanced', () => {
    expect(untransformed('a<iframe src="https://evil.example.com/x">Unavailable <b>x</b></iframe>b')).toBe('aUnavailable <b>x</b>b')
    expect(untransformed('<div><iframe src="https://evil.example.com/x">x</div><p>important</p><div></iframe></div>z')).toBe(
      '<div>x</div><p>important</p><div></div>z'
    )
    expect(untransformed('<table><tr><td><iframe src="https://evil.example.com/x">x</td></tr></table>after</iframe>z')).toBe(
      '<table><tr><td>x</td></tr></table>afterz'
    )
  })

  it('leaves no close tag that closes no kept iframe', () => {
    expect(untransformed('<iframe/src="https://evil.example.com/x">Unavailable</iframe>')).not.toContain('iframe')
    expect(untransformed('<iframe>a<iframe>b<iframe>c</iframe>d</iframe>e</iframe>f')).toBe('abdef')
  })

  it('keeps what follows an unclosed one', () => {
    expect(untransformed('<iframe src="https://evil.example.com/x">after')).toBe('after')
  })

  it('keeps an allowed iframe and its neighbours', () => {
    const ok = '<iframe src="https://www.youtube.com/embed/abcdefghijk"></iframe>'
    const kept = untransformed(`${ok}<iframe src="https://evil.example.com/x">gone</iframe>tail`)
    expect(kept).toContain('src="https://www.youtube.com/embed/abcdefghijk"')
    expect(kept).not.toContain('gone')
    expect(kept.endsWith('</iframe>tail')).toBe(true)
  })
})

describe('a bare image URL keeps an unbalanced ) as text (#2155)', () => {
  const url = 'https://host.example/photo.jpg?size=1'
  const proxied = proxifyImageSrc(url, 0, 0, 'match')
  const withParen = proxifyImageSrc(`${url})`, 0, 0, 'match')

  it('trims it from the token, with or without a query', () => {
    expect(imageUrlEnd(`${url})`)).toBe(url.length)
    expect(imageUrlEnd('https://host.example/photo.jpg)')).toBe('https://host.example/photo.jpg'.length)
    expect(imageUrlEnd('https://host.example/photo.jpg#a)')).toBe('https://host.example/photo.jpg#a'.length)
    // Balanced: the `)` belongs to the URL.
    expect(imageUrlEnd('https://host.example/photo.jpg?a=(1)')).toBe('https://host.example/photo.jpg?a=(1)'.length)
  })

  it.each([
    `(${url})`,
    `<div>(${url})</div>`,
    `<p>(${url})</p>`
  ])('%s proxies the URL without it, on both renders and the card', (body) => {
    for (const forApp of [true, false]) {
      const html = markdown2Html(entry(body), forApp)
      expect(html).toContain(proxied.replace(/&/g, '&amp;'))
      expect(html).not.toContain(withParen.split('?')[0])
      expect(html).toMatch(/(?:\/>|<\/picture>)\)(?:<\/span>)?<\/(?:p|div)>/)
    }
    expect(getEntryCardImageRawUrl(entry(body))).toBe(url)
    expect(catchPostImage(entry(body), 0, 0, 'match')).toBe(proxied)
  })
})

describe('Dapplr hosts: the allow list and the transform agree (#2155)', () => {
  it.each([
    'https://player.eu.dapplr.in/file/dapplr-videos/x.mp4',
    'https://cdn.dapplr.in/file/dapplr-videos/x.mp4'
  ])('%s is embedded by both', (src) => {
    expect(isAllowedEmbedSrc(src)).toBe(true)
    const html = markdown2Html(entry(`<iframe src="${src}"></iframe>`), false)
    expect(html).toContain(`<iframe src="${src}" sandbox="allow-scripts allow-same-origin"`)
    expect(html).not.toContain('unsupported-iframe')
  })

  it.each([
    'https://.dapplr.in/file/dapplr-videos/x.mp4',
    'https://a..dapplr.in/file/dapplr-videos/x.mp4',
    'https://a_b.dapplr.in/file/dapplr-videos/x.mp4',
    'https://a.dapplr.in:8443/file/dapplr-videos/x.mp4',
    'https://u:p@a.b.dapplr.in/file/dapplr-videos/x.mp4',
    'https://a.dapplr.in\\file\\dapplr-videos\\x',
    'https:///a.b.dapplr.in/file/dapplr-videos/x.mp4',
    'https://a%2eb.dapplr.in/file/dapplr-videos/x.mp4'
  ])('%s is refused by both', (src) => {
    expect(isAllowedEmbedSrc(src)).toBe(false)
    expect(markdown2Html(entry(`<iframe src="${src}"></iframe>`), false)).not.toContain('<iframe')
    expect(untransformed(`<iframe src="${src}"></iframe>`)).not.toContain('<iframe')
  })
})

describe('a kept iframe keeps its close (#2155 review)', () => {
  it('leaves an iframe tag inside a kept one to it', () => {
    const ok = '<iframe src="https://www.youtube.com/embed/abcdefghijk">'
    expect(untransformed(`${ok}<iframe src="https://evil.example.com/x">text</iframe> rest of post`)).toContain('</iframe> rest of post')
  })
})
