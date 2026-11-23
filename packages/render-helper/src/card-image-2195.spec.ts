import { describe, expect, it } from 'vitest'
import { markdown2Html } from './markdown-2-html'
import { catchPostImage } from './catch-post-image'
import { getEntryImageRawUrl, getEntryLcpImage } from './card-image'
import { getProxyBase, isPictureEligibleRawUrl, proxifyImageSrc } from './proxify-image-src'

let n = 0
const entry = (body: string) => ({ author: 'cs', permlink: `q${n++}`, last_update: '2026-11-21', body, json_metadata: '{}' }) as never
// The first image the body shows: the first <img> with a nonempty src (an
// <img> the render dropped shows nothing), as the request it makes.
const shown = (body: string) =>
  [...markdown2Html(entry(body), false).matchAll(/<img\b[^>]*?\ssrc="([^"]+)"/g)].map((m) => m[1].replace(/&amp;/g, '&'))[0] ?? null
// One request, however it is spelled: the proxy reads `/p/<hash>.png` and
// `/p/<hash>?format=match&mode=fit` as the same image.
const request = (src: string | null) => (src === null ? null : proxifyImageSrc(src, 0, 0, 'match') || src)

const FAST = { fast: true }

// Milliseconds per call, timed over a batch long enough to measure: a sample
// under the timer's resolution would hide how the call grows.
const perCall = (run: () => void) => {
  for (let count = 1; ; count *= 2) {
    const started = performance.now()
    for (let i = 0; i < count; i++) run()
    const spent = performance.now() - started
    if (spent >= 20) return spent / count
  }
}
// How much longer `large` takes than `small`, the least of a few tries.
const growth = (once: (text: string) => void, small: string, large: string) => {
  once(small)
  let ratio = Infinity
  for (let attempt = 0; attempt < 3 && ratio >= 30; attempt++) {
    ratio = Math.min(ratio, perCall(() => once(large)) / perCall(() => once(small)))
  }
  return ratio
}
// The image the entry page requests from a raw URL, built the way it builds it
// and never from the render (entry-lcp-match.ts): a picture-eligible cover
// through the proxy hash of the raw URL, anything else (already proxied, gif, a
// poster) through proxifyImageSrc as it stands. This checks which image, not
// which size: for an already-proxied first image the page preloads another
// rendition than the body requests (#2191).
const preload = (url: string, poster = false) =>
  request(!poster && isPictureEligibleRawUrl(url) ? proxifyImageSrc(url, 0, 0, 'match', { forceProxy: true }) : url)
const lookups = {
  fast: (body: string) => request(catchPostImage(entry(body), 0, 0, 'match', FAST)),
  raw: (body: string) => {
    const url = getEntryImageRawUrl(entry(body))
    return url ? preload(url) : null
  },
  lcp: (body: string) => {
    const found = getEntryLcpImage(entry(body))
    return found ? preload(found.url, found.poster) : null
  }
}

const A = 'https://e.com/a.png'
const B = 'https://e.com/b.png'

const P = `${getProxyBase()}/p/2bP4pJr4wVimqCWjYimXJe2cnCgnAhYxiBtbXg5JBpk.png`

describe('a lookup names the image the body shows, or defers (#2195)', () => {
  it.each([
    // 1. An <img inside another tag's quoted attribute is text.
    `<div title='<img src="${A}">'>text</div>\n\n![](${B})`,
    `<div title='<img src="${A}">'>text</div> ![](${B})`,
    `<div title='<img src="${A}">'>text</div>`,
    `<div title="<img src='${A}'>">text</div>\n\n![](${B})`,
    `<div title="<img src='${A}'>">text</div>\n\n<img src="${B}">`,
    `<span data-x='x <img src="${A}"> y'>t</span>\n\n${B}`,
    `<a href="https://x.com/q" title='<img src="${A}">'>y</a>\n\n![](${B})`,
    `<div\ntitle='<img src="${A}">'>text</div>\n\n![](${B})`,
    `<p><span title='<img src="${A}">'>t</span></p>\n\n![](${B})`,
    `<div title='a' data-x='<img src="${A}">'>t</div>\n\n![](${B})`,
    `<div title='<img src="${A}">'>t</div><img src="${B}">`,
    // A real tag after the attribute closes is still read.
    `<div title='x'><img src="${A}"></div>\n\n![](${B})`,
    `<div title=">"><img src="${A}"></div>\n\n![](${B})`,
    // 2. The render tier reads the rendered src once.
    `<img src="${P}?x=&amp;amp;copy;"x>`,
    `<img data-src="x" src="${P}?x=&amp;amp;copy;">`,
    `<img src="${P}?x=&amp;copy;"x>`,
    `<img src="${P}?x=&amp;lt;b&amp;gt;"x>`,
    `<img data-src="x" src="${P}?x=&amp;amp;lt;">`,
    `<img src="${P}?a=1&amp;b=2"x>`
  ])('%j', (body) => {
    const rendered = shown(body)
    expect(['card', catchPostImage(entry(body), 0, 0, 'match')]).toEqual(['card', rendered])
    for (const name of ['fast', 'raw', 'lcp'] as const) {
      const found = lookups[name](body)
      if (found !== null) expect([name, found]).toEqual([name, request(rendered)])
    }
  })
})
