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

  it.each([
    ['İ<!--c-->![x](https://e.com/a.png)'],
    ['İİ<style>s</style>![x](https://e.com/a.png)'],
    ['İİİİİİ <a href="https://e.com/p">t</a>https://e.com/b.png']
  ])('finds the image after text that lowercases to a longer string: %j', (body) => {
    // `İ`.toLowerCase() is two characters; the scan's offsets must not move.
    expect(getEntryCardImage(body, 0, 0)).toBe(getEntryCardImage(body.replace(/İ/g, 'I'), 0, 0))
    expect(getEntryCardImage(body, 0, 0)).not.toBeNull()
  })

  it.each([
    ['unterminated anchors', (k: number) => '<a '.repeat(k)],
    ['unterminated quoted anchors', (k: number) => '<a href="x '.repeat(k)]
  ])('stays linear on %s', (_label, make) => {
    const time = (k: number) => {
      let best = Infinity
      for (let r = 0; r < 7; r++) {
        const body = `${make(k)} ${r}`
        const t = performance.now()
        getEntryCardImage(body, 0, 0)
        best = Math.min(best, performance.now() - t)
      }
      return best
    }
    let k = 2_000
    while (time(k) < 5 && k < 256_000) k *= 2
    expect(time(8 * k) / time(k)).toBeLessThan(40)
  }, 60_000)

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
    'Comparisons stay: a < b and c > d, I <3 this.',
    'Hidden <!-- a comment --> text and <b>bold</b> tags.',
    'Word '.repeat(80),
    '* * *\n\n* * *\n\n(Text below).\n---\n\n* * *\n\nThe post body.',
    '- - -\n\nAfter a rule.',
    'Steps\t\t\t17/11/2026\t\t\t3048\t\tDaily',
    'Use \x60<div>\x60 for blocks, and <b>bold</b> stays plain.',
    'Code:\n\n\x60\x60\x60html\n<span class="x">hi</span>\n\x60\x60\x60\n\nafter <i>it</i>',
    '1. ***\n\ntext',
    '1. - - -\n\ntext',
    '+ * * *\n\ntext',
    ':-|\n-|-\n\ntext'
  ])('matches the rendered summary for %j', (body) => {
    expect(getPostBodyText(body, 200)).toBe(getPostBodySummary(body, 200))
  })

  it('drops a short table separator row and keeps cells apart', () => {
    // The rendered summary runs the cells together ("EnglishEspañol").
    const body = '|<center>English</center>|<center>Español</center>\n|-|-|\n------\nHello there.'
    expect(getPostBodyText(body, 200)).toBe('English Español Hello there.')
  })

  it('keeps an escaped character literal, never as emphasis', () => {
    expect(getPostBodyText('\\*literal asterisks\\* and more', 200)).toBe('*literal asterisks* and more')
  })

  it('leaves no complete tag behind when tags are nested inside each other', () => {
    for (const body of ['a <scr<b>ipt>x</scr</b>ipt> b <<i>img src=x> c', '<<<Z>', '<<<<a>', 'x <<<script y>', '<scr<!-- c -->ipt>']) {
      expect(getPostBodyText(body, 200)).not.toMatch(/<[A-Za-z/!][^>]*>/)
    }
  })

  it.each([
    ['Compare a<b in prose.', 'Compare a<b in prose.'],
    ['x<y', 'x<y'],
    ['<<<Z', '<<<Z']
  ])('keeps a < that can never close as a tag: %j', (body, expected) => {
    // No > after it anywhere, so it is text, as the renderer shows it.
    expect(getPostBodyText(body, 200)).toBe(expected)
    expect(getPostBodyText(body, 200)).toBe(getPostBodySummary(body, 200))
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
    ['table separator runs', (k: number) => '|-'.repeat(k)],
    ['image openers', (k: number) => '!['.repeat(k)],
    ['image openers with text', (k: number) => '![a'.repeat(k)],
    ['autolink openers', (k: number) => '<http://x'.repeat(k)]
  ])('stays linear on %s', (_label, make) => {
    // Growth, not wall-clock time: eight times the input should cost about
    // eight times as much (linear), not about 64 times (quadratic).
    const time = (k: number) => {
      let best = Infinity
      for (let r = 0; r < 7; r++) {
        const body = `${make(k)} ${r}`
        const t = performance.now()
        getPostBodyText(body, 200)
        best = Math.min(best, performance.now() - t)
      }
      return best
    }
    // The base size doubles until a render takes milliseconds, so a cheap
    // case measures real work rather than timer noise.
    let k = 20_000
    while (time(k) < 5 && k < 2_560_000) k *= 2
    // A shared CI runner has measured a linear case at 28x for reasons not
    // known, so the limit sits between that and quadratic.
    expect(time(8 * k) / time(k)).toBeLessThan(40)
    // Several rounds on large inputs: more than the default 5 s on a slow runner.
  }, 60_000)
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
