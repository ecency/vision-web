import { afterEach, describe, expect, it, vi } from 'vitest'
import { Remarkable } from 'remarkable'
import { linkify } from 'remarkable/linkify'
import { markdown2Html } from './markdown-2-html'
import { catchPostImage } from './catch-post-image'
import { getEntryImageRawUrl, getEntryLcpImage } from './card-image'
import { getPostBodySummary } from './post-body-summary'
import { proxifyImageSrc } from './proxify-image-src'
import { decodeDomImageSrc } from './helper'
import { linearLinkify } from './methods/linear-linkify'
import { simpleMarkdownToHTML } from './methods/simple-markdown-to-html.method'

let n = 0
const entry = (body: string) => ({ author: 'cs', permlink: `p${n++}`, last_update: '2026-11-21', body, json_metadata: '{}' }) as never
// The first image the body shows: an <img> the render dropped (no src) shows nothing.
const shown = (body: string) =>
  [...markdown2Html(entry(body), false).matchAll(/<img [^>]*?src="([^"]*)"/g)].map((m) => m[1].replace(/&amp;/g, '&'))[0] ?? null

const lookups = {
  card: (body: string) => catchPostImage(entry(body), 0, 0, 'match'),
  fast: (body: string) => catchPostImage(entry(body), 0, 0, 'match', { fast: true }),
  raw: (body: string) => {
    const url = getEntryImageRawUrl(entry(body))
    return url ? proxifyImageSrc(url, 0, 0, 'match') : null
  },
  lcp: (body: string) => {
    const found = getEntryLcpImage(entry(body))
    return found ? proxifyImageSrc(found.url, 0, 0, 'match') : null
  }
}

afterEach(() => {
  vi.restoreAllMocks()
})

// #2183 (1, 2): every lookup names the URL the body shows.
describe('a query reference or a parenthesis in the first image URL (#2183)', () => {
  it.each([
    '![x](<https://e.example/a.png?a=1&copy=2>)',
    '![x](https://e.example/a.png?a=1&copy=2)',
    '<img src="https://e.example/a.png?a=1&copy=2">',
    'https://e.example/a.png?a=1&copy=2',
    'https://example.com/a.png?name=cat(dog))'
  ])('%j', (body) => {
    const rendered = shown(body)
    expect(rendered).not.toBeNull()
    for (const [name, lookup] of Object.entries(lookups)) {
      expect([name, lookup(body)]).toEqual([name, rendered])
    }
  })
})

// #2183 (3): surrounding spaces do not change which branch decodes the URL.
describe('decodeDomImageSrc with surrounding spaces (#2183)', () => {
  it('unwraps a spaced legacy proxy URL like an unspaced one', () => {
    const url = 'https://images.hive.blog/600x400/https%3A%2F%2Fexample.com%2Fa.png'
    expect(decodeDomImageSrc(` ${url} `)).toBe(decodeDomImageSrc(url))
    expect(decodeDomImageSrc(` ${url} `)).toBe('https://images.hive.blog/600x400/https://example.com/a.png')
  })
})

// #2183 (4): linkify rebuilt a paragraph's whole child list for each link.
describe('linkify over many links in one paragraph (#2183)', () => {
  const corpus = [
    'see https://e.com/a and www.e.com/b, or mail a@e.com',
    '**x** user&#64;example&#46;com **y** https://e.com/c.png',
    '[a link](https://e.com/x) then https://e.com/y',
    '<a href="https://e.com/z">https://e.com/inside</a> https://e.com/after',
    '[outer [inner](https://e.com/i) https://e.com/text](https://e.com/o) https://e.com/end',
    'no links here at all',
    'a@b.co and https://e.com/(paren) and ftp://e.com/f',
    '> quote https://e.com/q\n\n- item https://e.com/l\n- item2 x@y.io'
  ]

  it.each(corpus)('renders %j exactly as Remarkable linkify does', (body) => {
    const plain = new Remarkable({ html: true }).use(linkify)
    const linear = new Remarkable({ html: true }).use(linkify).use(linearLinkify)
    expect(linear.render(body)).toBe(plain.render(body))
  })

  it.each([
    ['renderPostBody', (text: string) => markdown2Html(entry(text), false)],
    ['simpleMarkdownToHTML', (text: string) => simpleMarkdownToHTML(text)]
  ] as const)('%s renders a long paragraph of links in linear time', (_name, render) => {
    const body = (count: number) => '**x** user&#64;example&#46;com '.repeat(count)
    const once = (text: string) => {
      const started = performance.now()
      render(text)
      return performance.now() - started
    }
    const ratioOf = (small: string, large: string) => {
      let bestSmall = Infinity
      let bestLarge = Infinity
      for (let run = 0; run < 2; run++) {
        bestSmall = Math.min(bestSmall, once(small))
        bestLarge = Math.min(bestLarge, once(large))
      }
      return bestLarge / Math.max(bestSmall, 1)
    }
    const small = body(1_000)
    const large = body(4_000)
    once(small) // warm the JIT before measuring
    let ratio = Infinity
    for (let attempt = 0; attempt < 3 && ratio >= 9; attempt++) {
      ratio = Math.min(ratio, ratioOf(small, large))
    }
    // 4x the units: about 4x for a linear pass, 16x for a rebuild per link.
    expect(ratio).toBeLessThan(9)
  }, 120_000)
})

// #2182 (1): a lone surrogate no longer empties the summary.
describe('postBodySummary on a lone surrogate (#2182)', () => {
  // The summary drops bare URLs, so a body of one URL has no text either way.
  it.each([
    ['text\n\n[y](<https://example.com/\ud800?q=1>)', 'text\n\n[y](<https://example.com/\ufffd?q=1>)', 'text y'],
    ['https://example.com/\ud800x.png', 'https://example.com/\ufffdx.png', ''],
    ['see https://example.com/\ud800x.png now', 'see https://example.com/\ufffdx.png now', 'see now']
  ])('%j', (body, replaced, expected) => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const summary = getPostBodySummary(body, 200, 'web')
    expect(summary).toBe(getPostBodySummary(replaced, 200, 'web'))
    expect(summary).toBe(expected)
    expect(error).not.toHaveBeenCalled()
  })
})

// #2182 (2): the render drops an image whose URL the proxy refuses and shows
// the next one; the card names that one too.
describe('an over-long first image (#2182)', () => {
  it.each([2030, 2100, 3000])('a %i character first URL', (length) => {
    const body = `![x](https://example.com/${'a'.repeat(length)}.png) ![y](https://example.com/b.png)`
    const rendered = shown(body)
    expect(rendered).toBe(proxifyImageSrc('https://example.com/b.png', 0, 0, 'match'))
    expect(lookups.card(body)).toBe(rendered)
    expect(lookups.fast(body)).toBe(rendered)
  })

  // A percent escape could shorten the URL, so only the render knows it drops
  // it; the card then takes the first image the render shows.
  it('a long first URL with a percent escape', () => {
    const body = `![x](https://example.com/${'a'.repeat(2100)}%41.png) ![y](https://example.com/b.png)`
    const rendered = shown(body)
    expect(rendered).toBe(proxifyImageSrc('https://example.com/b.png', 0, 0, 'match'))
    expect(lookups.card(body)).toBe(rendered)
  })
})

// Review of the #2180 changes: bodies where a scan reads something the render
// does not show as an image (a reference or footnote definition, a link's
// title or text, a misread link), a dropped image, and an autolink. Full mode
// names what the render shows; every other lookup names it too or defers.
describe('a lookup names the image the body shows, or defers', () => {
  const A = 'https://e.com/a.png'
  const B = 'https://e.com/b.png'
  const C = 'https://e.com/c.png'
  const LONG = `https://e.com/${'a'.repeat(2100)}.png`
  it.each([
    `[y]: ${A}\n\n![x](${B})`,
    `Read [the docs][y] first.\n\n[y]: ${A}\n\n![x](${B})`,
    `t[^1]\n\n[^1]: ${A}\n\n![x](${B})`,
    `*[HTML]: ${A}\n\n![x](${B})`,
    `[x](https://x.com/q "${A}") ![x](${B})`,
    `[see ${A} here](https://x.com/q) ![x](${B})`,
    `[see ${A} here](https://x.com/q)\n\n<img src="${B}">`,
    `[Image source ${A}](${A}) ![d](${B})`,
    `[x]((${A})) ![x](${B})`,
    `[x](${A}(${C})) ![d](${B})`,
    `<iframe src="https://x.com">${A}</iframe> ![x](${B})`,
    `<${A}?a=1&amp;b=2>\n\n![z](${B})`,
    `${A}?a=1&amp;amp;b=2\n\n![z](${B})`,
    `<a href="${A}?a=1&copy">${A}?a=1&copy</a>\n\n![z](${B})`,
    `${LONG}`,
    `${LONG} ![x](${B})`,
    `![x](${LONG}) <img src="${LONG}">`,
    `<${A}?a=1.>`,
    `<${A}?a=1,>`,
    `[x](<${A}>(${B})`,
    `[x](<${A}>x) ![d](${B})`,
    `[x](<${A}>"t") ![d](${B})`,
    `[x]( ${A}\n\n) ![d](${B})`,
    `[x](\n${A}\n\n"t") ![d](${B})`,
    `[x](<${A}>\n\n) ![d](${B})`,
    `[a\n\nb]( ${A}) ![d](${B})`,
    `[a\n\nb](\n${A}) ![d](${B})`,
    `[a\n\nb](${A}) ![x](${B})`,
    `[x][y](${A})\n\n[y]: https://x.com/z\n\n![x](${B})`,
    `[![x](https://e.com/${'a'.repeat(2100)}[.png)](${C}) ![d](${B})`,
    `![x](${LONG}) [x][y]\n\n[y]: ${B}`,
    `![x](${LONG}) [x](https://x.com/q "${B}")`,
    `![x](${LONG}) [see ${B} here](https://x.com/q)`,
    `![x](${LONG})\n\n*[HTML]: ${B}`,
    `![x](${LONG}) <iframe src="https://x.com">${B}</iframe>`,
    `_${A}_ ![x](${LONG})(${B})`,
    `| a | b |\n|---|---|\n| ![a|b](${LONG}) | x | ${B}`,
    // A bare URL before a markdown image that is not a line of prose.
    `    ${A}\n\n![x](${B})`,
    `<div>\n${A}\n</div>\n\n![x](${B})`,
    `[see\n${A}\nhere](https://x.com/q)\n\n![x](${B})`,
    `<${A}?a=1&amp;b=2>`,
    `<https://e.com/\ud800a.png>`,
    // A bare URL before a markdown image, even one that opens a line: the
    // scans cannot tell it from one the render shows as no image.
    `${A}\n\n![x](${B})`,
    `   ${A} ![x](${B})`,
    `[${A}](${A})\n\n![x](${B})`,
    `[x\n\n${A}\n\n![x](${B})`,
    `<center>${A}</center>\n\n![x](${B})`,
    `<div>text</div>\n<p> <br> </p>\n<center> ${A}</center>\n\n<center>![x](${B})</center>`,
    // Final review.
    `<img,src="${A}">\n\n![d](${B})`,
    `<img alt="x" :src="${A}">\n\n![d](${B})`,
    `<img data-src="${C}"src="${A}">`,
    `[${A}](<${A}>)\n\n![d](${B})`,
    `[${A}](<${A}>)\n\n${B}`,
    `![x](${LONG})\n\n\`c\` ${A}\n\n![d](${B})`,
    `<img alt="a src='${C}'" src="${A}">\n\n![x](${LONG})`,
    `\`c\` ${A}\n\n![x](${LONG}) ![d](${B})`,
    // Third review.
    `<img/src="${A}">\n\n![d](${B})`,
    `<img alt="x"src="${A}">\n\n![d](${B})`,
    `[x](https://x.com/q(${A}))\n${A}`,
    `<center [>\n${A}](https://x.com/q)\n\n![d](${B})`,
    `\`\`\`\ncode\n\n${A}\n\n![d](${B})`,
    `~~~~\n~~~\n${A}\n~~~\n~~~~\n\n![d](${B})`,
    `<center>${A}*</center>\n\n![d](${B})`,
    // Second review: a line that only looks like prose.
    `<center><a href="https://x.com/q">${A}</a></center>\n\n![d](${B})`,
    `\\[x\n${A}\n\n![x](${B})`,
    `[y]:\n${A}\n\n![d](${B})`,
    `[y]:\n[${A}](${A})\n\n![d](${B})`,
    `[x](https://x.com/q "t\n${A}")\n\n![d](${B})`,
    `[y]: https://x.com/q "t\n${A}"\n\n![d](${B})`,
    `t[^1]\n\n[^1]: note\n${A}\n\n![d](${B})`,
    `t[^1]\n\n[^1]: note\n\n    ${A}\n\n![d](${B})`,
    `\`text\n${A}\`\n\n![d](${B})`,
    `\`\`\`\`\n\`\`\`\n${A}\n\`\`\`\n\`\`\`\`\n\n![d](${B})`,
    `<iframe src="https://x.com">\n\n${A}\n\n</iframe>\n\n![d](${B})`,
    `<head>\n${A}\n</head>\n\n![d](${B})`,
    `<head>\n\n${A}\n\n</head>\n\n![d](${B})`,
    `<a href="https://x.com/q">\n${A}\n</a>\n\n![d](${B})`,
    `x]\n${A}\n\n![d](${B})`,
    `[text <span title="]">\n${A}](https://x.com/q)\n\n![d](${B})`,
    `\\![x](<${A}>(${C}))`,
    `\\![x](<${A}>x) ![d](${B})`,
    `[x]( ${A}(${C})`,
    `[x](\n${A}(${C})`,
    `<img data-src="${A}" src=""> ![x](${LONG})`,
    `![x](${LONG}) <img data-src="${B}" src="">`,
    `<img class="lazy" data-src="${A}" src="${B}">`,
    `![x](${LONG}) https://www.youtube.com/watch?v=dQw4w9WgXcQ\n\n![d](${B})`,
    `| a | b |\n|---|---|\n| ![a|b](${LONG}) | x | https://www.youtube.com/watch?v=dQw4w9WgXcQ`,
    // Regression rerun: a `;` after a bare URL, a `-src` after the first image.
    `[${A}&quot;][r]\n\n[r]: ${A}&quot;`,
    `[${A}&amp;][r]\n\n[r]: ${A}&amp;`,
    `[${A}&copy;][r]\n\n[r]: ${A}&copy;`,
    `\`c\` <img\nsrc="${A}&quot;">`,
    `![x](https://e.com/${'a'.repeat(1990)}.png)\n\n<img data-src="${C}">`,
    `![x](${A})\n\n<img data-src="${C}" src="${B}">`,
    `${A}&foo;`,
    `${A}\\&amp;`,
    `x ${A}&quot; y`,
    `~~${A}&quot;~~~~`,
    `${A}&foo;\n\n![d](${B})`
  ])('%j', (body) => {
    const rendered = shown(body)
    expect(['card', lookups.card(body)]).toEqual(['card', rendered])
    for (const name of ['fast', 'raw', 'lcp'] as const) {
      const found = lookups[name](body)
      if (found !== null) expect([name, found]).toEqual([name, rendered])
    }
  })
})
