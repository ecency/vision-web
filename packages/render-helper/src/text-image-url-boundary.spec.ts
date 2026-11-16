import { describe, expect, it } from 'vitest'
import { markdown2Html } from './markdown-2-html'
import { proxifyImageSrc } from './proxify-image-src'

// #2094. A bare image URL followed by more text in the same text node was
// proxied as the URL plus that text (IMG_REGEX's trailing `(.*)` went into the
// image src), and the text disappeared from the output.
let n = 0
const render = (body: string, forApp: boolean) =>
  markdown2Html({ author: 'tb', permlink: `t${n++}`, last_update: '2026-11-16', body } as never, forApp)
const proxyOf = (url: string) => proxifyImageSrc(url, 0, 0, 'match', { forceProxy: true }).replace(/&/g, '&amp;')

describe('image URL in a text node (#2094)', () => {
  it.each([false, true])('keeps the text after the URL (forApp %s)', (forApp) => {
    const html = render('<div>https://e.com/i.png &amp; friends</div>', forApp)
    expect(html).toContain(`src="${proxyOf('https://e.com/i.png')}"`)
    expect(html).toMatch(/friends/)
  })

  it.each([false, true])('keeps the text before and after (forApp %s)', (forApp) => {
    const html = render('<div>Look at https://e.com/a.jpg?w=1 then more</div>', forApp)
    expect(html).toContain(`src="${proxyOf('https://e.com/a.jpg?w=1')}"`)
    expect(html).toMatch(/Look at/)
    expect(html).toMatch(/then more/)
  })

  it('a URL alone still becomes the image', () => {
    expect(render('<div>https://e.com/i.png</div>', false)).toContain(`src="${proxyOf('https://e.com/i.png')}"`)
  })
})
