import { catchPostImage, getEntryImageRawUrl } from './catch-post-image'
import { markdown2Html } from './markdown-2-html'
import { buildPictureSources, proxifyImageSrc } from './proxify-image-src'
import type { Entry } from './types'

// Distinct author/permlink per fixture: catchPostImage memoizes per post and
// size, process-wide, so two fixtures sharing a key would share an answer.
let n = 0
const entry = (body: string, json_metadata: unknown = {}): Entry => ({
  author: 'fast',
  permlink: `p-${n++}`,
  last_update: '2019-05-10T09:15:21',
  body,
  json_metadata
})

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

  it('falls through to image when the thumbnail cannot be proxied', () => {
    const overlong = 'https://files.peakd.com/x/' + 'a'.repeat(5000) + '.png'
    for (const thumbnails of [['   '], [overlong], 'not a url']) {
      const e = entry('text', { thumbnails, image: ['https://images.hive.blog/cover.png'] })
      expect(catchPostImage(e, 320, 180, 'match'), JSON.stringify(thumbnails).slice(0, 40)).toBe(
        proxifyImageSrc('https://images.hive.blog/cover.png', 320, 180, 'match')
      )
    }
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

  it('finds a bare image or video URL wrapped in parentheses, as the renderer does', () => {
    for (const body of [
      'see (https://files.peakd.com/x/paren.png) here',
      'see (https://youtu.be/dQw4w9WgXcQ) here',
      '(https://www.youtube.com/watch?v=dQw4w9WgXcQ)'
    ]) {
      const r = both(body)
      expect(r.full, body).toBeTruthy()
      expect(r.fast, body).toBe(r.full)
    }
  })

  it('still leaves a [label](href) link alone, whose href also follows a parenthesis', () => {
    for (const body of [
      'see [my photo](https://files.peakd.com/x/linked.png) here',
      'watch [clip](https://youtu.be/dQw4w9WgXcQ) here'
    ]) {
      const r = both(body)
      expect(r.fast, body).toBe(r.full)
      expect(r.fast, body).toBeNull()
    }
  })

  it('recognizes every YouTube host the renderer does', () => {
    for (const body of [
      'https://music.youtube.com/watch?v=dQw4w9WgXcQ',
      'https://m.youtube.com/watch?v=dQw4w9WgXcQ',
      'https://youtube.com/watch?v=dQw4w9WgXcQ'
    ]) {
      const r = both(body)
      expect(r.full, body).toBeTruthy()
      expect(r.fast, body).toBe(r.full)
    }
  })

  it('ignores URLs the page never shows as images: comments, style and pre', () => {
    for (const body of [
      '<!-- https://files.peakd.com/x/hidden.png -->\n\nplain text',
      '<!-- open comment, never closed https://files.peakd.com/x/hidden.png',
      '<!-- one --> text <!-- https://files.peakd.com/x/hidden.png --> more',
      '<style>.x{background:url(https://files.peakd.com/x/hidden.png)}</style>\n\nplain text',
      '<pre>https://files.peakd.com/x/hidden.png</pre>\n\nplain text',
      '<PRE class="x">https://files.peakd.com/x/hidden.png</PRE>\n\nplain text',
      '<pre>never closed https://files.peakd.com/x/hidden.png',
      '<style>a{}</style><pre>https://files.peakd.com/x/hidden.png</pre>\n\nplain text',
      '<pre\tclass="x">https://files.peakd.com/x/hidden.png</pre >\n\nplain text',
      '<pre\r>https://files.peakd.com/x/hidden.png</pre>\n\nplain text',
      '<pre\rclass="x">https://files.peakd.com/x/hidden.png</pre>\n\nplain text',
      '<pre data-x="/>">https://files.peakd.com/x/hidden.png</pre>\n\nplain text',
      '<pre title=\'a > b\'>https://files.peakd.com/x/hidden.png</pre>\n\nplain text',
      '<pre\fclass="x">https://files.peakd.com/x/hidden.png</pre\n>\n\nplain text',
      '<pre>one https://files.peakd.com/x/a.png</prefix> two https://files.peakd.com/x/b.png</pre>\n\nplain',
      '<pre>one</prelude> https://files.peakd.com/x/hidden.png</pre>\n\nplain',
      '<pre>https://www.youtube.com/watch?v=dQw4w9WgXcQ</pre>\n\nplain text'
    ]) {
      const r = both(body)
      expect(r.fast, body).toBe(r.full)
      expect(r.fast, body).toBeNull()
      expect(getEntryImageRawUrl(entry(body)), body).toBeNull()
    }
  })

  it('reads a markdown autolink <https://...> as prose, not as a tag', () => {
    for (const body of [
      'cover: <https://files.peakd.com/x/autolink.png> end',
      'cover: <HTTPS://files.peakd.com/x/autolink.png> end',
      'watch: <https://www.youtube.com/watch?v=dQw4w9WgXcQ> end'
    ]) {
      const r = both(body)
      expect(r.full, body).toBeTruthy()
      expect(r.fast, body).toBe(r.full)
    }
    expect(getEntryImageRawUrl(entry('cover: <https://files.peakd.com/x/autolink.png> end'))).toBe(
      'https://files.peakd.com/x/autolink.png'
    )
  })

  it('follows the renderer where a <pre tag is broken or empty: a line break inside the tag, or self-closing', () => {
    // Probed: the renderer does not read these as a <pre> block, so the URL
    // renders as an image, and the scanner must not hide it either.
    for (const body of [
      '<pre\r\nclass="x">https://files.peakd.com/x/shown.png</pre>\n\nplain text',
      '<pre\n>https://files.peakd.com/x/shown.png</pre>\n\nplain text',
      '<pre\nclass="x">https://files.peakd.com/x/shown.png</pre>\n\nplain text',
      '<pre/>https://files.peakd.com/x/shown.png\n\nplain text',
      '<style data-x="/>">.a{}</style>https://files.peakd.com/x/shown.png\n\nplain text'
    ]) {
      const r = both(body)
      expect(r.full, body).toBeTruthy()
      expect(r.fast, body).toBe(r.full)
    }
  })

  it('hides <pre> only in markdown HTML-block context, as the parser does', () => {
    const U = 'https://files.peakd.com/x/ctx.png'
    // A line opened by an inline element is a paragraph: the <pre> inside is
    // inline content and its URL renders as an image.
    for (const par of ['code', 'kbd', 'em', 'span', 'center', 'h1', 'details']) {
      const r = both(`<${par}><pre>${U}</pre></${par}>\n\nplain`)
      expect(r.full, par).toBeTruthy()
      expect(r.fast, par).toBe(r.full)
    }
    for (const body of [
      `<code>x</code><pre>${U}</pre>\n\nplain`,
      `<code><div><pre>${U}</pre></div></code>\n\nplain`,
      `<code><pre>https://www.youtube.com/watch?v=dQw4w9WgXcQ</pre></code>\n\nplain`
    ]) {
      const r = both(body)
      expect(r.full, body).toBeTruthy()
      expect(r.fast, body).toBe(r.full)
    }
    // A line opened by a block tag is an HTML block: the <pre> is honoured.
    for (const par of ['div', 'p', 'blockquote', 'li', 'td', 'section']) {
      const r = both(`<${par}><pre>${U}</pre></${par}>\n\nplain`)
      expect(r.full, par).toBeNull()
      expect(r.fast, par).toBeNull()
    }
    for (const body of [`<div><code><pre>${U}</pre></code></div>\n\nplain`, `   <pre>${U}</pre>\n\nplain`]) {
      const r = both(body)
      expect(r.full, body).toBeNull()
      expect(r.fast, body).toBeNull()
    }
  })

  it('decides block context on the original lines, before any region is removed', () => {
    const U = 'https://files.peakd.com/x/ctx2.png'
    // A leading comment or <style> opens the block; what follows on that line
    // (and on following lines up to a blank one) is raw HTML, not prose.
    for (const body of [
      `<style>a{}</style><code><pre>${U}</pre></code>\n\nplain`,
      `<!-- c --><code><pre>${U}</pre></code>\n\nplain`,
      `<!-- a\nb --><code><pre>${U}</pre></code>\n\nplain`,
      `<!-- c --><code>${U}</code>\n\nplain`,
      `<div>\n<code><pre>${U}</pre></code>\n</div>\n\nplain`,
      `<span>x</span>\n<pre>${U}</pre>\n\nplain`,
      `intro text\n<pre>${U}</pre>\n\nplain`
    ]) {
      const r = both(body)
      expect(r.full, body).toBeNull()
      expect(r.fast, body).toBeNull()
    }
    // A blank line ends the block; a line that starts with prose is a paragraph.
    for (const body of [
      `<!-- c -->\n\n<code><pre>${U}</pre></code>\n\nplain`,
      `text <!-- c --> <code><pre>${U}</pre></code>\n\nplain`,
      `<!-- c --> ${U}\n\nplain`,
      `<div>x</div>\n\n<code><pre>${U}</pre></code>\n\nplain`,
      `intro text\n<code><pre>${U}</pre></code>\n\nplain`
    ]) {
      const r = both(body)
      expect(r.full, body).toBeTruthy()
      expect(r.fast, body).toBe(r.full)
    }
  })

  it('strips blockquote and list prefixes before deciding block context, as the parser does', () => {
    const U = 'https://files.peakd.com/x/ctx3.png'
    const V = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'
    for (const body of [
      `> <pre>${U}</pre>\n\nplain`,
      `> <pre>${V}</pre>\n\nplain`,
      `> > <pre>${U}</pre>\n\nplain`,
      `><pre>${U}</pre>\n\nplain`,
      `- <pre>${U}</pre>\n\nplain`,
      `* <pre>${U}</pre>\n\nplain`,
      `1. <pre>${U}</pre>\n\nplain`,
      `1) <pre>${U}</pre>\n\nplain`,
      `> <div>\n> <pre>${U}</pre>\n\nplain`,
      `- item\n  <pre>${U}</pre>\n\nplain`,
      `> text\n> <pre>${U}</pre>\n\nplain`,
      `> <!-- c --><code>${U}</code>\n\nplain`,
      `>     <pre>${U}</pre>\n\nplain`,
      `>     ${U}\n\nplain`,
      `- > <pre>${U}</pre>\n\nplain`,
      `> - <pre>${U}</pre>\n\nplain`,
      `> 1. <pre>${V}</pre>\n\nplain`,
      `- > - <pre>${U}</pre>\n\nplain`,
      `> > - > <pre>${U}</pre>\n\nplain`,
      `-  > <pre>${U}</pre>\n\nplain`,
      `- item\n  > <pre>${U}</pre>\n\nplain`,
      `<div>\n- - <pre>${U}</pre>\n</div>\n\nplain`,
      `<div>\n> <code>${U}</code>\n</div>\n\nplain`,
      `<div>\n- <code>${U}</code>\n</div>\n\nplain`,
      `<div>\n    <pre>${U}</pre>\n</div>\n\nplain`,
      `- - > <pre>${U}</pre>\n\nplain`,
      `- - - > <pre>${U}</pre>\n\nplain`,
      `- - > - <pre>${U}</pre>\n\nplain`,
      `1. - > <pre>${U}</pre>\n\nplain`
    ]) {
      const r = both(body)
      expect(r.full, body).toBeNull()
      expect(r.fast, body).toBeNull()
      expect(getEntryImageRawUrl(entry(body)), body).toBeNull()
    }
    for (const body of [
      `<div>\n\n- - <pre>${U}</pre>\n\nplain`,
      `- - <pre>${U}</pre>\n\nplain`,
      `- - - <pre>${U}</pre>\n\nplain`,
      `> - - <pre>${U}</pre>\n\nplain`,
      `- - > <code>${U}</code>\n\nplain`,
      `- - <!-- c --><code>${U}</code>\n\nplain`,
      `- - x\n    <pre>${U}</pre>\n\nplain`,
      `- > <code>${U}</code>\n\nplain`,
      `> <code>${U}</code>\n\nplain`,
      `> <code><pre>${U}</pre></code>\n\nplain`,
      `- <code>${U}</code>\n\nplain`,
      `- <code><pre>${U}</pre></code>\n\nplain`,
      `  - <pre>${U}</pre>\n\nplain`,
      `# <pre>${U}</pre>\n\nplain`
    ]) {
      const r = both(body)
      expect(r.full, body).toBeTruthy()
      expect(r.fast, body).toBe(r.full)
    }
  })

  it('reads a URL right after an exclamation mark as prose, as the renderer does', () => {
    for (const body of [
      '!https://files.peakd.com/x/bang.png',
      'wow!https://files.peakd.com/x/bang.png end',
      '!https://www.youtube.com/watch?v=dQw4w9WgXcQ'
    ]) {
      const r = both(body)
      expect(r.full, body).toBeTruthy()
      expect(r.fast, body).toBe(r.full)
    }
  })

  it('matches anchors quote-aware and with bare hrefs, so link text is never read as a bare URL', () => {
    const i = 'https://files.peakd.com/x/quoted-anchor.png'
    for (const body of [
      `<a title="a > b" href="https://example.com/page">${i}</a>`,
      `<a title='a > b' href="https://example.com/page">${i}</a>`,
      `<a href=https://example.com/page>${i}</a>`,
      `<a title="a > b" href="https://example.com/page">https://www.youtube.com/watch?v=dQw4w9WgXcQ</a>`
    ]) {
      const r = both(body)
      expect(r.full, body).toBeNull()
      expect(r.fast, body).toBeNull()
      expect(getEntryImageRawUrl(entry(body)), body).toBeNull()
    }
    for (const body of [`<a title="a > b" href="${i}">${i}</a>`, `<a href=${i}>${i}</a>`]) {
      const r = both(body)
      expect(r.full, body).toBeTruthy()
      expect(r.fast, body).toBe(r.full)
    }
  })

  it('stays linear on a body with thousands of mismatched anchors', () => {
    const many = Array.from(
      { length: 20_000 },
      (_, i) => `<a href="https://example.com/p${i}">https://files.peakd.com/x/t${i}.png</a>`
    ).join(' ')
    const started = performance.now()
    expect(getEntryImageRawUrl(entry(many))).toBeNull()
    expect(catchPostImage(entry(many), 0, 0, 'match', FAST)).toBeNull()
    // Generous for slow CI: the quadratic form took over a second at 4,000.
    expect(performance.now() - started).toBeLessThan(3_000)
  })

  it('does not read an anchor whose first text continues past the href with a literal < as promoted', () => {
    const i = 'https://files.peakd.com/x/lt.png'
    for (const body of [`<a href="${i}">${i} < caption</a>`, `<a href="${i}">${i} <3</a>`]) {
      const r = both(body)
      expect(r.full, body).toBeNull()
      expect(r.fast, body).toBeNull()
      expect(getEntryImageRawUrl(entry(body)), body).toBeNull()
    }
  })

  it('does not mistake a tag that merely starts with pre or style for a hidden region', () => {
    const r = both('<prefix-tag>https://files.peakd.com/x/shown.png</prefix-tag>')
    expect(r.fast).toBe(r.full)
    expect(r.fast).toBeTruthy()
  })

  it('keeps a URL in <code> text, which the renderer does linkify', () => {
    const r = both('<code>https://files.peakd.com/x/shown.png</code>\n\nplain text')
    expect(r.full).toBeTruthy()
    expect(r.fast).toBe(r.full)
  })

  it('reads a URL in <script> text as prose, which the sanitizer unwraps and the renderer linkifies', () => {
    // `u="https://..."` looks like an attribute value but sits in text, not
    // inside a tag; the in-tag marks tell the two apart, so a real
    // <video poster="..."> still does not count while this does. The two
    // lookups do not agree byte for byte here, and that is the renderer's
    // doing: its greedy linkifier swallows the closing quote into the image
    // URL, so the full lookup hands back a thumbnail that cannot load. Fast
    // mode returns the URL itself. Pinned so a change on either side shows.
    const raw = 'https://files.peakd.com/x/shown.png'
    const r = both(`<script>var u="${raw}"</script>\n\nplain text`)
    expect(r.full).toBeTruthy()
    expect(r.fast).toBe(proxifyImageSrc(raw, 600, 500, 'match'))
    expect(r.full).not.toBe(r.fast)
  })

  it('finds a bare image URL wrapped in emphasis or quotes, as the renderer does', () => {
    for (const body of [
      'see *https://files.peakd.com/x/em.png* here',
      'he said "https://files.peakd.com/x/quoted.png" ok'
    ]) {
      const r = both(body)
      expect(r.full, body).toBeTruthy()
      expect(r.fast, body).toBe(r.full)
    }
  })

  it('does not read a URL glued to another token or used as an attribute value as bare', () => {
    for (const body of [
      'go to https://example.com/?u=https://files.peakd.com/x/inner.png now',
      '<video poster="https://files.peakd.com/x/poster.png"></video>',
      '[https://files.peakd.com/x/label.png](https://example.com/page)'
    ]) {
      const r = both(body)
      expect(r.fast, body).toBe(r.full)
    }
  })

  it('does not read a URL nested anywhere inside a tag as bare: style url(), JSON in data-*, odd quoting', () => {
    for (const body of [
      '<div style="background:url(https://files.peakd.com/x/bg.jpg)">text</div>',
      '<div data-config=\'{"image":"https://files.peakd.com/x/cfg.png"}\'>text</div>',
      '<div title="a > b" data-x="https://files.peakd.com/x/quoted-gt.png">text</div>',
      '<span data-v="https://www.youtube.com/watch?v=dQw4w9WgXcQ">text</span>'
    ]) {
      const r = both(body)
      expect(r.fast, body).toBe(r.full)
      expect(r.fast, body).toBeNull()
      expect(getEntryImageRawUrl(entry(body)), body).toBeNull()
    }
  })

  it('skips a YouTube channel or playlist link and still finds a later watch link', () => {
    const r = both('my channel https://www.youtube.com/channel/UCabc and the video\n\nhttps://www.youtube.com/watch?v=dQw4w9WgXcQ')
    expect(r.full).toBeTruthy()
    expect(r.fast).toBe(r.full)
  })

  it('follows the renderer on anchors with nested markup: video by textContent, image by first text child', () => {
    const v = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'
    const i = 'https://files.peakd.com/x/wrapped.png'
    const promoted = [
      `<a href="${v}"><span>${v}</span></a>`,
      `<a href="${i}">${i}<span>x</span></a>`,
      `<a href="${i}">${i} <em>caption</em></a>`
    ]
    const notPromoted = [
      `<a href="${i}"><strong>${i}</strong></a>`,
      `<a href="${i}"><span>x</span>${i}</a>`,
      `<a href="${i}">${i} caption</a>`,
      `<a href="${v}">${v}<span>x</span></a>`,
      `<a href="${v}">${v} caption</a>`
    ]
    for (const body of promoted) {
      const r = both(body)
      expect(r.full, body).toBeTruthy()
      expect(r.fast, body).toBe(r.full)
    }
    for (const body of notPromoted) {
      const r = both(body)
      expect(r.full, body).toBeNull()
      expect(r.fast, body).toBeNull()
      expect(getEntryImageRawUrl(entry(body)), body).toBeNull()
    }
    expect(getEntryImageRawUrl(entry(`<a href="${i}">${i}<span>x</span></a>`))).toBe(i)
  })

  it('returns null, not a later poster, when an ambiguous markdown image comes first', () => {
    const r = both('![a](https://images.hive.blog/path_(a)_full.jpg)\n\nhttps://www.youtube.com/watch?v=dQw4w9WgXcQ')
    expect(r.full).toBeTruthy()
    expect(r.full).not.toContain('img.youtube.com')
    expect(r.fast).toBeNull()
  })

  it('keeps an anchor whose text equals its href once entities are decoded, as the page renders it', () => {
    // The page render (forApp=false) promotes this anchor to an image; the
    // forApp=true render the full lookup uses does not. The scans compare
    // entity-decoded values, the way the DOM exposes them, so the preload and
    // the fast card follow what the page shows. The old raw comparison would
    // have blanked the anchor and lost both.
    const u = 'https://files.peakd.com/x/q.png?a=1&b=2'
    const body = `<a href="${u.replaceAll('&', '&amp;')}">${u}</a>`
    expect(markdown2Html(entry(body), false)).toContain('<img')
    expect(getEntryImageRawUrl(entry(body))).toBe(u)
    expect(catchPostImage(entry(body), 0, 0, 'match', FAST)).toBe(proxifyImageSrc(u, 0, 0, 'match'))
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
