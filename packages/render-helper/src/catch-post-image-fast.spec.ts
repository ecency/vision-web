import { catchPostImage, getEntryImageRawUrl } from './catch-post-image'
import { markdown2Html } from './markdown-2-html'
import { buildPictureSources, proxifyImageSrc } from './proxify-image-src'

// Distinct author/permlink per fixture: catchPostImage memoizes per post and
// size, process-wide, so two fixtures sharing a key would share an answer.
let n = 0
const entry = (body: string, json_metadata: unknown = {}) => ({
  author: 'fast',
  permlink: `p-${n++}`,
  last_update: '2019-05-10T09:15:21',
  body,
  json_metadata
}) as any

const FAST = { fast: true }

describe('catchPostImage thumbnails tier', () => {
  it('prefers json_metadata.thumbnails[0] over image[0]', () => {
    const e = entry('text', {
      thumbnails: ['https://images.hive.blog/poster.png'],
      image: ['https://images.hive.blog/cover.png']
    })
    expect(catchPostImage(e, 320, 180, 'match')).toBe(
      proxifyImageSrc('https://images.hive.blog/poster.png', 320, 180, 'match')
    )
  })

  it('accepts thumbnails published as a bare string', () => {
    const e = entry('text', { thumbnails: 'https://images.hive.blog/single.png' })
    expect(catchPostImage(e, 320, 180, 'match')).toBe(
      proxifyImageSrc('https://images.hive.blog/single.png', 320, 180, 'match')
    )
  })

  it('skips non-string members and falls through to image when thumbnails holds nothing usable', () => {
    const junk = entry('text', { thumbnails: [null, 42, ''], image: ['https://images.hive.blog/cover.png'] })
    expect(catchPostImage(junk, 320, 180, 'match')).toBe(
      proxifyImageSrc('https://images.hive.blog/cover.png', 320, 180, 'match')
    )
    const shape = entry('text', { thumbnails: { 0: 'https://images.hive.blog/object.png' }, image: ['https://images.hive.blog/cover.png'] })
    expect(catchPostImage(shape, 320, 180, 'match')).toBe(
      proxifyImageSrc('https://images.hive.blog/cover.png', 320, 180, 'match')
    )
  })

  it('proxies a gif thumbnail unsized, like a gif cover', () => {
    const e = entry('text', { thumbnails: ['https://images.hive.blog/anim.gif'] })
    expect(catchPostImage(e, 320, 180, 'match')).toBe(
      proxifyImageSrc('https://images.hive.blog/anim.gif', 0, 0, 'match')
    )
  })

  it('still reads image when there is no thumbnails field at all', () => {
    const e = entry('text', { image: ['https://images.hive.blog/cover.png'] })
    expect(catchPostImage(e, 320, 180, 'match')).toBe(
      proxifyImageSrc('https://images.hive.blog/cover.png', 320, 180, 'match')
    )
  })
})

describe('catchPostImage fast mode', () => {
  // Two fixtures with identical content, one per mode, so the memo cannot hand
  // the second call the first one's answer.
  const both = (body: string, meta: unknown = {}) => ({
    full: catchPostImage(entry(body, meta), 600, 500, 'match'),
    fast: catchPostImage(entry(body, meta), 600, 500, 'match', FAST)
  })

  it('agrees with the full lookup on a metadata image', () => {
    const r = both('text', { image: ['https://images.hive.blog/cover.png'] })
    expect(r.fast).toBe(r.full)
    expect(r.fast).toBeTruthy()
  })

  it('agrees with the full lookup on a markdown image', () => {
    const r = both('intro\n\n![pic](https://images.hive.blog/in-body.png)\n\nrest')
    expect(r.fast).toBe(r.full)
    expect(r.fast).toBe(proxifyImageSrc('https://images.hive.blog/in-body.png', 600, 500, 'match'))
  })

  it('agrees with the full lookup on an HTML img', () => {
    const r = both('<p>hi</p><img src="https://images.hive.blog/tag.png" alt="">')
    expect(r.fast).toBe(r.full)
    expect(r.fast).toBeTruthy()
  })

  it('finds a <center>-wrapped bare image URL without rendering', () => {
    const r = both('<center>https://images.hive.blog/DQmb59qYM1czWSDDw2dRmUHJ7s97L6S6Rk3uZLyA5vCxAEr/pic.jpg</center>')
    expect(r.fast).toBe(r.full)
    expect(r.fast).toBeTruthy()
  })

  it('derives the same YouTube poster the full render produces for a bare URL', () => {
    const r = both('Check this out\n\nhttps://www.youtube.com/watch?v=dQw4w9WgXcQ\n\nthanks')
    expect(r.full).toBeTruthy()
    expect(r.fast).toBe(r.full)
  })

  it('derives the poster for youtu.be, shorts and a [url](url) link too', () => {
    for (const body of [
      'see https://youtu.be/dQw4w9WgXcQ now',
      'see https://www.youtube.com/shorts/dQw4w9WgXcQ now',
      'see [https://www.youtube.com/watch?v=dQw4w9WgXcQ](https://www.youtube.com/watch?v=dQw4w9WgXcQ) now'
    ]) {
      const r = both(body)
      expect(r.full, body).toBeTruthy()
      expect(r.fast, body).toBe(r.full)
    }
  })

  it('keeps the full lookup precedence: a markdown image wins over an earlier video', () => {
    // The full lookup returns the regex-found image before it would ever render
    // the markdown and see the poster. Fast mode mirrors that, not source order.
    const r = both('https://www.youtube.com/watch?v=dQw4w9WgXcQ\n\n![pic](https://images.hive.blog/later.png)')
    expect(r.fast).toBe(r.full)
    expect(r.fast).toBe(proxifyImageSrc('https://images.hive.blog/later.png', 600, 500, 'match'))
  })

  it('keeps the full lookup precedence: a markdown image before the video', () => {
    const r = both('![pic](https://images.hive.blog/first.png)\n\nhttps://www.youtube.com/watch?v=dQw4w9WgXcQ')
    expect(r.fast).toBe(r.full)
    expect(r.fast).toBe(proxifyImageSrc('https://images.hive.blog/first.png', 600, 500, 'match'))
  })

  it('orders a bare image URL and a video poster by source position, as the render does', () => {
    const posterFirst = both('https://www.youtube.com/watch?v=dQw4w9WgXcQ\n\nhttps://files.peakd.com/x/bare.png')
    expect(posterFirst.full).toBeTruthy()
    expect(posterFirst.fast).toBe(posterFirst.full)
    expect(posterFirst.fast).not.toBe(proxifyImageSrc('https://files.peakd.com/x/bare.png', 600, 500, 'match'))

    const bareFirst = both('https://files.peakd.com/x/bare.png\n\nhttps://www.youtube.com/watch?v=dQw4w9WgXcQ')
    expect(bareFirst.fast).toBe(bareFirst.full)
    expect(bareFirst.fast).toBe(proxifyImageSrc('https://files.peakd.com/x/bare.png', 600, 500, 'match'))
  })

  it('does not read a YouTube link whose label differs from its href as a poster', () => {
    const r = both('watch [this](https://www.youtube.com/watch?v=dQw4w9WgXcQ) later')
    expect(r.fast).toBe(r.full)
    expect(r.fast).toBeNull()
  })

  it('ignores a YouTube URL inside a code block', () => {
    const r = both('```\nhttps://www.youtube.com/watch?v=dQw4w9WgXcQ\n```')
    expect(r.fast).toBe(r.full)
    expect(r.fast).toBeNull()
  })

  it('returns null for a body with no image at all, same as the full lookup', () => {
    const r = both('<p>lorem ipsum dolor</p> sit amet')
    expect(r.fast).toBeNull()
    expect(r.full).toBeNull()
  })

  it('gives up where only the markdown tier could decide (ambiguous markdown URL)', () => {
    // The regex bails on a markdown image URL containing `(`; the full render
    // resolves it. That is the one class fast mode knowingly hands back null for.
    const r = both('![a](https://images.hive.blog/path_(a)_full.jpg)')
    expect(r.full).toBeTruthy()
    expect(r.fast).toBeNull()
  })

  it('applies to a raw markdown string as well', () => {
    expect(catchPostImage('<center>https://images.hive.blog/x/pic.jpg</center>', 0, 0, 'match', FAST)).toBeTruthy()
    expect(catchPostImage('https://www.youtube.com/watch?v=dQw4w9WgXcQ', 0, 0, 'match', FAST)).toBe(
      catchPostImage('https://www.youtube.com/watch?v=dQw4w9WgXcQ', 0, 0, 'match')
    )
    expect(catchPostImage('![a](https://images.hive.blog/path_(a)_full.jpg)', 0, 0, 'match', FAST)).toBeNull()
  })

  it('memoizes the two modes separately', () => {
    const e = entry('![a](https://images.hive.blog/path_(a)_full.jpg)')
    expect(catchPostImage(e, 0, 0, 'match', FAST)).toBeNull()
    expect(catchPostImage(e, 0, 0, 'match')).toBeTruthy()
    expect(catchPostImage(e, 0, 0, 'match', FAST)).toBeNull()
  })
})

describe('getEntryImageRawUrl and the LCP preload for a <center>-wrapped bare URL', () => {
  it('finds it, and the preload avif still byte-matches the in-body <picture>', () => {
    const firstAvif = (ss: string) => ss.split(',')[0].trim().split(/\s+/)[0].replace(/&amp;/g, '&')
    const e = entry('<center>https://files.peakd.com/x/center-cover.png</center>')
    const raw = getEntryImageRawUrl(e)
    expect(raw).toBe('https://files.peakd.com/x/center-cover.png')
    const m = markdown2Html(e, false).match(/<source type="image\/avif" srcset="([^"]+)"/)
    expect(m).not.toBeNull()
    expect(firstAvif(buildPictureSources(raw as string).avif)).toBe(firstAvif(m![1]))
  })

  it('does not read the text of an anchor pointing elsewhere as a bare URL', () => {
    // `>` before a URL is allowed for wrapping tags, which would also admit an
    // anchor's text. The renderer leaves such a link alone unless text equals
    // href, so the scan blanks those anchors first. Applies to images and to
    // YouTube URLs alike, and to the LCP preload (getEntryImageRawUrl).
    const img = '<a href="https://example.com/page">https://files.peakd.com/x/linked.png</a>'
    expect(markdown2Html(entry(img), false)).not.toContain('<img')
    expect(getEntryImageRawUrl(entry(img))).toBeNull()
    expect(catchPostImage(entry(img), 0, 0, 'match', FAST)).toBeNull()
    expect(catchPostImage(entry(img), 0, 0, 'match')).toBeNull()

    const yt = '<a href="https://example.com/page">https://www.youtube.com/watch?v=dQw4w9WgXcQ</a>'
    expect(catchPostImage(entry(yt), 0, 0, 'match', FAST)).toBe(catchPostImage(entry(yt), 0, 0, 'match'))
  })

  it('still reads an anchor whose text equals its image href, which the renderer promotes', () => {
    const u = 'https://files.peakd.com/x/self.png'
    const body = `<a href="${u}">${u}</a>`
    const full = catchPostImage(entry(body), 0, 0, 'match')
    expect(catchPostImage(entry(body), 0, 0, 'match', FAST)).toBe(full)
    expect(getEntryImageRawUrl(entry(body))).toBe(markdown2Html(entry(body), false).includes('<img') ? u : null)
  })
})
