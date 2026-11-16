import { describe, expect, it } from 'vitest'
import { markdown2Html } from './markdown-2-html'
import { getEntryImageRawUrl } from './catch-post-image'
import { proxifyImageSrc } from './proxify-image-src'

// #2092. The app render swaps every entity in the body for a `​<n>​`
// placeholder while it renders and restores them in the final string. An image
// URL carrying `&amp;` was proxied with the placeholder in it, inside the proxy
// hash where the restore cannot reach, so the app loaded a different URL than
// the post names. Both renders must proxy the same URL.
let n = 0
const render = (body: string, forApp: boolean) =>
  markdown2Html({ author: 'parity', permlink: `p${n++}`, last_update: '2026-11-16', body } as never, forApp)
const imgSrcs = (html: string) =>
  [...html.matchAll(/<img[^>]*\ssrc="([^"]+)"/g)].map((m) => m[1].replace(/&amp;/g, '&'))
const proxyOf = (url: string) => proxifyImageSrc(url, 0, 0, 'match', { forceProxy: true })

const AMP_CASES = [
  '<img src="https://e.com/i.png?a=1&amp;b=2">',
  "<img src='https://e.com/i.png?a=1&amp;b=2'>",
  '<img src="https://e.com/i.png?x=1&amp;times=2">',
  '![](https://e.com/i.png?a=1&amp;b=2)',
  '![](https://e.com/i.png?x=1&amp;times=2)',
  'Look\n\nhttps://e.com/i.png?a=1&amp;b=2\n\nhere',
  '[https://e.com/i.png?a=1&amp;b=2](https://e.com/i.png?a=1&amp;b=2)',
  '<video controls poster="https://e.com/p.png?a=1&amp;b=2" src="https://e.com/v.mp4"></video>',
  'Text &amp; more &nbsp; then ![](https://e.com/i.png?a=1&amp;b=2) and &copy;'
]

describe('app render image URLs (#2092)', () => {
  it.each(AMP_CASES)('proxies the same URL as the web render: %s', (body) => {
    const app = render(body, true)
    expect(app).not.toContain('​')
    const web = render(body, false)
    const posters = (html: string) => [...html.matchAll(/\sposter="([^"]+)"/g)].map((m) => m[1])
    expect(imgSrcs(app)).toEqual(imgSrcs(web))
    expect(posters(app)).toEqual(posters(web))
    expect(imgSrcs(web).length + posters(web).length).toBeGreaterThan(0)
  })

  it('still restores entities in text', () => {
    const app = render('Fish &amp; chips &copy; 2026', true)
    expect(app).toContain('Fish &amp; chips &copy; 2026')
  })
})

describe('LCP preload matches the web render', () => {
  it.each([
    '<img src="https://e.com/i.png?a=1&amp;b=2">',
    "<img src='https://e.com/i.png?a=1&amp;b=2'>",
    '<img src="https://e.com/i.png?a=1&b=2">',
    '![](https://e.com/i.png?a=1&amp;b=2)',
    '![](https://e.com/i.png?x=1&amp;times=2)'
  ])('%s', (body) => {
    expect(imgSrcs(render(body, false))[0]).toBe(proxyOf(getEntryImageRawUrl(body)!))
  })
})
