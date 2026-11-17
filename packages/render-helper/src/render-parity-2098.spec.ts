import { describe, expect, it } from 'vitest'
import { markdown2Html } from './markdown-2-html'
import { getEntryImageRawUrl } from './catch-post-image'
import { proxifyImageSrc } from './proxify-image-src'

// #2098: the edge cases left after #2092-#2094 and #2101. Each one made the
// app render differ from the web render, or the LCP preload name an image the
// render does not show (a wasted download).
let n = 0
const render = (body: string, forApp: boolean) =>
  markdown2Html({ author: 'parity', permlink: `p${n++}`, last_update: '2026-11-17', body } as never, forApp)
const strip = (html: string) => html.replace(/ data-[a-z-]+="[^"]*"/g, '')
const firstImg = (html: string) => /<img[^>]*\ssrc="([^"]+)"/.exec(html)?.[1]?.replace(/&amp;/g, '&') ?? null
const proxyOf = (url: string) => proxifyImageSrc(url, 0, 0, 'match', { forceProxy: true })
const preloadOf = (body: string) => {
  const raw = getEntryImageRawUrl(body)
  return raw ? proxyOf(raw) : null
}

describe('fenced code inside list items, app render', () => {
  it.each([
    '- item\n\n    ~~~js\n    a &amp; b\n    ~~~',
    '- ~~~\n  &amp;\n  ~~~',
    '1. ```\n   &amp; &lt;b&gt;\n   ```',
    '- > ~~~\n  > &amp;\n  > ~~~',
    '> - ~~~\n>   &amp;\n>   ~~~',
    '- a\n  - ~~~\n    &amp;\n    ~~~',
    // No close: the fence ends with its list item, and the text after it is
    // prose again, where the app keeps its entity handling.
    '- ~~~\n  &amp;\n\nafter &amp; text',
    '- ~~~\n  &amp;\n~~~\n\n&copy; text',
    // A tab-indented code line inside a list item's fence (Makefiles, Go).
    '1. Makefile:\n   ```make\n\tgcc a.c &amp;&amp; ./a.out\n   ```',
    '- item\n\n  ```go\n\tif a &amp;&amp; b {}\n  ```',
    // A tab after the list marker.
    '-\t```\n    &amp; x\n    ```',
    '1.\t~~~\n    &lt;b&gt;\n    ~~~',
    // A nested item indented with a tab on the parent's continuation line.
    '- a\n\t- ```\n\t  &amp; x\n\t  ```',
    '- a\n\n\t-\t~~~\n\t\t&lt;b&gt;\n\t\t~~~',
    // A quote line ends the list item: the fence after it is top-level.
    '1. step\n> tip\n\n   ```\nx &lt; y\n   ```'
  ])('renders %j as the web does', (body) => {
    const app = render(body, true)
    expect(app).not.toContain('\u200B')
    expect(strip(app)).toBe(strip(render(body, false)))
  })

  it('keeps the app entity handling for prose after a fence that follows a quote', () => {
    // In prose the app keeps an entity as written (its placeholder pass); a
    // fence range running past its close would take that away.
    const app = render('1. step\n> tip\n\n   ```\nx &lt; y\n   ```\n\nafter &copy;', true)
    expect(app).toContain('after &copy;')
  })

  it('stays linear on a long line of list markers', () => {
    // A backtracking pattern hung here. Growth, not wall-clock time: four
    // times the markers costs about four times as long on a linear scan.
    let run = 0
    // Best of three, each a fresh body (the render caches): one GC pause must
    // not decide the ratio.
    const time = (markers: number) => {
      let best = Infinity
      for (let k = 0; k < 3; k++) {
        const body = '- '.repeat(markers) + `~~~\n&amp; ${run++}\n`
        const started = performance.now()
        render(body, true)
        best = Math.min(best, performance.now() - started)
      }
      return Math.max(best, 1)
    }
    time(500)
    expect(time(20000) / time(5000)).toBeLessThan(10)
  })
})

describe('an escaped ampersand before an entity in a non-http destination', () => {
  it.each(['[a](/path?q=\\&copy;)', '[a](//host/x?q=\\&copy;)', '[a](mailto:a@e.com?q=\\&copy;)'])(
    'links %j the same in the app as on the web',
    (body) => {
      const href = (html: string) => /(?:data-)?href="([^"]*)"/.exec(html)?.[1]
      expect(href(render(body, true))).toBe(href(render(body, false)))
      expect(href(render(body, false))).toContain('&amp;copy;')
    }
  )
})

describe('an autolink inside a link label keeps its backslash', () => {
  it.each([false, true])('as an autolink outside a label does (forApp %s)', (forApp) => {
    const inLabel = render('[<https://e.com/?a\\&b>](https://e.com/u)', forApp)
    const alone = render('<https://e.com/?a\\&b>', forApp)
    const autolinkHref = (html: string) => /(?:data-)?href="(https:\/\/e\.com\/\?a[^"]*)"/.exec(html)?.[1]
    expect(autolinkHref(inLabel)).toBe(autolinkHref(alone))
  })
})

describe('the LCP preload names the image the render shows, or none', () => {
  it.each([
    // A bare URL in an HTML block is text to the DOM: decoded with text rules.
    '<div>https://e.com/i.png?w=1&times=2</div>',
    '<div>\nhttps://e.com/i.png?w=1&times=2\n</div>',
    '<div>\nhttps://e.com/i.png?q=\\&copy;\n</div>',
    '<div>\nhttps://e.com/i.png?x=(1)\n</div>',
    // In a paragraph the autolinker drops trailing punctuation, query or not.
    'x https://e.com/a.gif#frag.',
    'see https://e.com/a.png?w=1, then',
    'end https://e.com/a.png?w=1..',
    'x https://e.com/a.png?x=1&amp;y=2. y',
    'x https://e.com/a.png?x=1&copy; y',
    'x https://e.com/a.png?x=1&copy;. y',
    '[r]: https://e.com/a.png?x=1&copy;\n\n![][r]',
    // Only a whole entity name decodes in HTML text, as the render reads it.
    '<div>https://e.com/i.png?w=1&region=eu</div>',
    '<div>https://e.com/i.png?w=1&notify=1&section=2&ampx=1</div>',
    '<div>https://e.com/i.png?w=1&para=1&reg</div>',
    // Lowercasing must not move offsets (Turkish dotted I).
    'İyi günler\n\nhttps://e.com/i.png',
    'İyi\n\n<center>https://e.com/i.png?w=1&times=2</center>',
    // The autolinker keeps a `.` before `)`; a raw anchor's text is not autolinked.
    '(see https://e.com/a.png?w=600.)',
    '<a href="https://e.com/i.png?x=1.">https://e.com/i.png?x=1.</a>',
    // A comment line opens an HTML block (no autolinker there).
    '<!-- c -->\nhttps://e.com/i.png?x=1.',
    '<style>p{}</style>\nhttps://e.com/i.png?x=1.',
    // An HTML tag inside a fenced code block opens no HTML block.
    '```\n<div>\n```\nhttps://e.com/i.png?a=1&copy',
    // Kept as before.
    'https://e.com/i.png?a=1&copy',
    'x https://e.com/a.png y'
  ])('%j', (body) => {
    const shown = firstImg(render(body, false))
    expect(shown).not.toBeNull()
    expect(preloadOf(body)).toBe(shown)
  })

  it.each([
    // The render links these, it does not show an image.
    '[https://e.com/i.png?a=1&amp;amp;b](https://e.com/i.png?a=1&amp;amp;b)',
    '[https://e.com/i.png?a&lt;b](https://e.com/i.png?a&lt;b)'
  ])('%j has no image and no preload', (body) => {
    expect(firstImg(render(body, false))).toBeNull()
    expect(preloadOf(body)).toBeNull()
  })

  it('does not preload a destination that decodes to a control character', () => {
    // The render reads `&Tab;` its own way; a guess would be a wasted download.
    expect(preloadOf('![](https://e.com/i.png?a=1&Tab;b)')).toBeNull()
  })

  it('still promotes a [url](url) image link with an escaped ampersand', () => {
    const body = '[https://e.com/i.png?x=1&amp;copy=2](https://e.com/i.png?x=1&amp;copy=2)'
    const shown = firstImg(render(body, false))
    expect(shown).not.toBeNull()
    expect(preloadOf(body)).toBe(shown)
  })
})
