import { describe, expect, it } from 'vitest'
import { markdown2Html } from './markdown-2-html'
import { getEntryImageRawUrl } from './catch-post-image'
import { proxifyImageSrc } from './proxify-image-src'

// Edges of the #2092/#2093/#2094 fixes found in review of #2101.
let n = 0
const render = (body: string, forApp: boolean) =>
  markdown2Html({ author: 'edge', permlink: `e${n++}`, last_update: '2026-11-16', body } as never, forApp)
const firstImg = (html: string) => /<img[^>]*\ssrc="([^"]+)"/.exec(html)?.[1]?.replace(/&amp;/g, '&')
const proxyOf = (url: string) => proxifyImageSrc(url, 0, 0, 'match', { forceProxy: true })
const strip = (html: string) => html.replace(/<[^>]+>/g, '')

describe('a text URL is an image when an image extension ends at a boundary', () => {
  // An extension followed by a query keeps the whole token: a query that
  // happens to hold `.jpg` used to cut the URL there, dropping `&token=secret`.
  it.each([false, true])('keeps the whole query of an image URL (forApp %s)', (forApp) => {
    const html = render('<div>https://e.com/i.png?filename=photo.jpg&amp;token=secret</div>', forApp)
    expect(firstImg(html)).toBe(proxyOf('https://e.com/i.png?filename=photo.jpg&token=secret'))
    expect(strip(html)).not.toContain('token=secret')
  })

  it.each([false, true])('an image handler with the extension in its query stays whole (forApp %s)', (forApp) => {
    const html = render('<div>https://e.com/image.php?file=x.jpg&amp;w=2</div>', forApp)
    expect(firstImg(html)).toBe(proxyOf('https://e.com/image.php?file=x.jpg&w=2'))
  })

  it('the LCP preload reads the same URL', () => {
    for (const body of [
      '<div>https://e.com/i.png?filename=photo.jpg&amp;token=secret</div>',
      'https://e.com/i.png?filename=photo.jpg&token=secret'
    ]) {
      expect(proxyOf(getEntryImageRawUrl(body)!)).toBe(firstImg(render(body, false)))
    }
  })

  // `.ico` inside `.icons`, `.jpg` before `.html`: not images.
  it.each([
    ['<div>https://e.com/.icons/readme</div>', false],
    ['<div>https://e.com/.icons/readme</div>', true],
    ['<div>https://e.com/photo.jpg.html</div>', false],
    ['<div>https://e.com/photo.jpg.html</div>', true]
  ])('%s is not an image (forApp %s)', (body, forApp) => {
    expect(render(body as string, forApp as boolean)).not.toContain('<img')
    expect(getEntryImageRawUrl(body as string)).toBeNull()
  })

  // Sentence punctuation after the extension stays text.
  it.each([false, true])('punctuation after the URL stays text (forApp %s)', (forApp) => {
    const html = render('<div>See https://e.com/i.png, nice.</div>', forApp)
    expect(firstImg(html)).toBe(proxyOf('https://e.com/i.png'))
    expect(strip(html)).toContain(', nice.')
  })
})

describe('entities in quoted code, app render (#2093)', () => {
  it.each([
    '> ~~~\n> &amp; &lt;b&gt;\n> ~~~',
    '> ```js\n> const a = 1 &amp;&amp; 2\n> ```',
    '> > ~~~\n> > &amp;\n> > ~~~'
  ])('renders %j as the web does', (body) => {
    const app = render(body, true)
    expect(app).not.toContain('​')
    expect(strip(app)).toBe(strip(render(body, false)))
  })

  it('a quoted fence ends with its blockquote', () => {
    // The unclosed quoted fence must not shield the paragraph after the quote.
    const body = '> ~~~\n> code\n\nafter &amp; text'
    expect(strip(render(body, true))).toBe(strip(render(body, false)))
  })
})

describe('markdown destinations', () => {
  // CommonMark: a backslash-escaped `&` is a literal ampersand, so `\&copy;`
  // in a destination is the text `&copy;`, not ©.
  it.each([false, true])('an escaped ampersand stays literal (forApp %s)', (forApp) => {
    const html = render('[x](https://e.com/?q=\\&copy;)', forApp)
    expect(html).toContain('href="https://e.com/?q=&amp;copy;"'.replace('href', forApp ? 'data-href' : 'href'))
  })

  it('an escaped ampersand in an image destination stays literal for the preload too', () => {
    const body = '![](https://e.com/i.png?q=\\&copy;)'
    expect(firstImg(render(body, false))).toBe(proxyOf('https://e.com/i.png?q=&copy;'))
    expect(proxyOf(getEntryImageRawUrl(body)!)).toBe(firstImg(render(body, false)))
  })

  it('an escaped ampersand in text still shows as written', () => {
    expect(strip(render('a \\&copy; b', false))).toContain('a &amp;copy; b')
  })

  it('a backslash before & inside code is kept', () => {
    expect(strip(render('`x\\&copy;`', false))).toContain('x\\&amp;copy;')
  })
})

describe('app render of a URL with an unbalanced parenthesis', () => {
  it('proxies the same image as the web', () => {
    const body = 'https://e.example/a_(x&amp;y.png'
    const web = firstImg(render(body, false))
    expect(web).toBeTruthy()
    expect(firstImg(render(body, true))).toBe(web)
  })
})

describe('raw HTML anchor with an image URL as its text', () => {
  it.each([
    '<a href="https://e.com/i.png?x=1&copy;">https://e.com/i.png?x=1&copy;</a>',
    '<a href="https://e.com/i.png?x=1&amp;y=2">https://e.com/i.png?x=1&amp;y=2</a>'
  ])('the LCP preload matches the rendered image for %s', (body) => {
    const img = firstImg(render(body, false))
    expect(img).toBeTruthy()
    expect(proxyOf(getEntryImageRawUrl(body)!)).toBe(img)
  })
})

// Second review round of #2101.
describe('a backslash-escaped & is rewritten only in link and image destinations', () => {
  it.each([
    ['    curl https://e.com/?a=1\\&b=2', 'curl https://e.com/?a=1\\&amp;b=2'],
    ['- item\n\n        curl https://e.com/?a=1\\&b=2', 'curl https://e.com/?a=1\\&amp;b=2'],
    ['<pre>curl https://e.com/?a=1\\&b=2</pre>', 'curl https://e.com/?a=1\\&amp;b=2'],
    ['<div>\ncurl https://e.com/?a=1\\&b=2\n</div>', 'curl https://e.com/?a=1\\&amp;b=2']
  ])('%j keeps its backslash', (body, text) => {
    for (const forApp of [false, true]) expect(strip(render(body, forApp))).toContain(text)
  })

  it('an autolink is not double escaped', () => {
    for (const forApp of [false, true]) expect(render('<https://e.com/?a=1\\&b=2>', forApp)).not.toContain('&amp;amp;')
  })
})

describe('a text URL with a suffix after its extension', () => {
  // Develop imaged these whole; they must not turn into plain unlinked text.
  const SUFFIXED = [
    'https://pbs.twimg.com/media/ABC.jpg:large',
    'https://e.com/i.jpg!small',
    'https://e.com/i.png/100x100',
    'https://e.com/a.jpg=s1600',
    'https://e.com/a.jpg@2x',
    'https://e.com/a.jpg_600x600',
    'https://e.com/a.jpg-large',
    'https://e.com/a.jpg/',
    'https://e.com/a.jpg%3Fx'
  ]
  it.each(SUFFIXED)('%s in an HTML block is the whole-URL image, web, app and preload', (url) => {
    const body = `<div>\n${url}\n</div>`
    const web = firstImg(render(body, false))
    expect(web).toBeTruthy()
    expect(strip(render(body, false)).trim()).toBe('')
    expect(firstImg(render(body, true))).toBe(web)
    expect(proxyOf(getEntryImageRawUrl(body)!)).toBe(web)
  })

  // A paragraph URL goes through the link path (a.method); the preload must agree.
  it.each(['https://e.com/photo.jpg.html', 'https://e.com/.icons/readme', ...SUFFIXED])(
    'paragraph %s: render and preload agree',
    (url) => {
      const img = firstImg(render(url, false))
      const pre = getEntryImageRawUrl(url)
      expect(pre ? proxyOf(pre) : undefined).toBe(img)
    }
  )

  it.each(['https://e.com/photo.jpg.html', 'https://e.com/.icons/readme'])('paragraph %s is not an image', (url) => {
    expect(render(url, false)).not.toContain('<img')
  })
})

describe('an unquoted fence is not closed by a quoted fence line', () => {
  it('app renders the code as the web does', () => {
    const body = '```\ncode &amp;\n> ```\nmore &lt;b&gt; `x` &amp;\n```'
    expect(strip(render(body, true))).toBe(strip(render(body, false)))
  })
})

describe('escaped angle brackets end a text URL', () => {
  it.each([false, true])('&lt;URL&gt; proxies the URL alone (forApp %s)', (forApp) => {
    const html = render('see &lt;https://e.com/i.png&gt; ok', forApp)
    expect(firstImg(html)).toBe(proxyOf('https://e.com/i.png'))
    expect(strip(html)).toContain('&gt; ok')
  })

  it('the preload agrees', () => {
    expect(getEntryImageRawUrl('see &lt;https://e.com/i.png&gt; ok')).toBe('https://e.com/i.png')
  })
})
