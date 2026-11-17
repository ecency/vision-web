import { describe, expect, it } from 'vitest'
import { catchPostImage, getEntryCardImage } from './catch-post-image'
import { getPostBodySummary } from './post-body-summary'
import { getPostBodyText } from './post-body-text'

// #2113: the feed card's image and summary without the markdown renderer.
let n = 0
const entry = (body: string, json_metadata: unknown = {}) =>
  ({ author: 'card', permlink: `c${n++}`, last_update: '2026-11-17', body, json_metadata }) as never

describe('getEntryCardImage', () => {
  it.each([
    ['metadata image', 'text', { image: ['https://e.com/cover.png'] }],
    ['metadata thumbnail first', 'text', { thumbnails: ['https://e.com/t.png'], image: ['https://e.com/c.png'] }],
    ['markdown image', 'Hello\n\n![x](https://e.com/a.png)', {}],
    ['html image', '<p><img src="https://e.com/b.jpg"></p>', {}],
    ['bare image URL', 'look\n\nhttps://e.com/c.gif\n\nhere', {}],
    ['youtube poster', 'watch https://www.youtube.com/watch?v=O8xoAtKjnqs now', {}],
    ['nothing', 'just words', {}]
  ])('equals catchPostImage in fast mode: %s', (_label, body, meta) => {
    const e = entry(body, meta)
    expect(getEntryCardImage(e, 600, 500, 'match')).toBe(catchPostImage(e, 600, 500, 'match', { fast: true }))
  })

  it('takes a raw body string too', () => {
    expect(getEntryCardImage('![x](https://e.com/a.png)', 600, 500)).toBe(
      catchPostImage('![x](https://e.com/a.png)', 600, 500, 'match', { fast: true })
    )
  })
})

describe('getPostBodyText', () => {
  it.each([
    '# Title\n\nSome **bold** and _italic_ and ~~gone~~ text.',
    'A [link](https://e.com/x) and an image ![alt](https://e.com/a.png) here.',
    '> quoted line\n\n- one\n- two\n\n1. first',
    'Code `inline` and\n\n```js\nconst a = 1\n```\n\nafter',
    'Escaped \\*not emphasis\\* and \\_this\\_ too.',
    'Ampersand & quote " and entity &amp; in text.',
    '<center>Centered <b>html</b> text</center>',
    'A URL https://e.com/page in prose is dropped.',
    'Word '.repeat(80)
  ])('matches the rendered summary for %j', (body) => {
    expect(getPostBodyText(body, 200)).toBe(getPostBodySummary(body, 200))
  })

  it('keeps an escaped character literal, never as emphasis', () => {
    expect(getPostBodyText('\\*literal asterisks\\* and more', 200)).toBe('*literal asterisks* and more')
  })

  it('returns the whole text with length 0', () => {
    const body = 'word '.repeat(100)
    expect(getPostBodyText(body, 0)).toBe(getPostBodySummary(body, 0))
  })

  it.each([
    ['emphasis openers', (k: number) => '**a '.repeat(k)],
    ['underscore runs', (k: number) => '_a'.repeat(k)],
    ['escapes', (k: number) => '\\*'.repeat(k)],
    ['link openers', (k: number) => '[a]('.repeat(k)],
    ['unclosed brackets', (k: number) => '['.repeat(k)],
    ['fence-like runs', (k: number) => '`'.repeat(k)],
    ['table separator runs', (k: number) => '|-'.repeat(k)]
  ])('stays linear on %s', (_label, make) => {
    // Growth, not wall-clock time: four times the input, about four times the cost.
    const time = (k: number) => {
      let best = Infinity
      for (let r = 0; r < 3; r++) {
        const body = `${make(k)} ${r}`
        const t = performance.now()
        getPostBodyText(body, 200)
        best = Math.min(best, performance.now() - t)
      }
      return Math.max(best, 1)
    }
    time(2000)
    expect(time(80_000) / time(20_000)).toBeLessThan(10)
  })
})

describe('getEntryLcpImage (#2119)', () => {
  // Late import keeps this block independent of the cases above.
  const lcpSrc = (html: string) =>
    /<img[^>]*fetchpriority="high"[^>]*>/.exec(html)?.[0].match(/\ssrc="([^"]+)"/)?.[1].replace(/&amp;/g, '&')

  it.each([
    'Intro\n\nhttps://www.youtube.com/watch?v=O8xoAtKjnqs\n\n![](https://e.com/a.png)',
    'Intro\n\n[https://youtu.be/O8xoAtKjnqs](https://youtu.be/O8xoAtKjnqs)\n\n<img src="https://e.com/a.png">'
  ])('names the video poster the page shows first: %j', async (body) => {
    const { getEntryLcpImage } = await import('./card-image')
    const { markdown2Html } = await import('./markdown-2-html')
    const { proxifyImageSrc } = await import('./proxify-image-src')
    const lcp = getEntryLcpImage(entry(body))
    expect(lcp?.poster).toBe(true)
    expect(proxifyImageSrc(lcp!.url, 0, 0, 'match')).toBe(lcpSrc(markdown2Html(entry(body), false)))
  })

  it('keeps the first image when it comes before the video, as getEntryImageRawUrl does', async () => {
    const { getEntryLcpImage, getEntryImageRawUrl } = await import('./card-image')
    const body = '![](https://e.com/a.png)\n\nhttps://www.youtube.com/watch?v=O8xoAtKjnqs'
    expect(getEntryLcpImage(entry(body))).toEqual({ url: getEntryImageRawUrl(body), poster: false })
  })

  it('keeps the metadata image first, as getEntryImageRawUrl does', async () => {
    const { getEntryLcpImage, getEntryImageRawUrl } = await import('./card-image')
    const e = entry('https://www.youtube.com/watch?v=O8xoAtKjnqs', { image: ['https://e.com/cover.png'] })
    expect(getEntryLcpImage(e)).toEqual({ url: getEntryImageRawUrl(e), poster: false })
  })
})
