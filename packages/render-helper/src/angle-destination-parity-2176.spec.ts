import { describe, expect, it } from 'vitest'
import { markdown2Html } from './markdown-2-html'
import { catchPostImage } from './catch-post-image'
import { getEntryImageRawUrl, getEntryLcpImage } from './card-image'
import { proxifyImageSrc } from './proxify-image-src'
import { plainDestination, uriNormalized, withoutLoneSurrogates } from './helper'

let n = 0
const entry = (body: string) => ({ author: 'parity', permlink: `p${n++}`, last_update: '2026-11-21', body }) as never
const shown = (body: string) =>
  markdown2Html(entry(body), false).match(/<img [^>]*src="([^"]*)"/)?.[1]?.replace(/&amp;/g, '&') ?? null

// The card scanner and the render read an angle destination with one shared
// normalisation (#2176), so the card names the image the body shows.
const destinations = [
  'a b',
  'a\\b',
  '50%',
  '50%%20off',
  'a%zz',
  'a%20b',
  'café',
  'caf%C3%A9',
  '\ud800x',
  'x\udc00 y',
  'a"b',
  'a[1]',
  'a{b}|c',
  'a^b`c',
  // Remarkable's input pre-pass: tabs to 1-4 spaces, U+00A0 to a space, and
  // U+2028, U+0085, U+2424 to newlines, which end an angle destination.
  'a\tb',
  '\ta',
  'ab\t\tc',
  'a\u00a0b',
  'a\u2028b',
  'a\u0085b',
  'a\u2424b'
]

// Each lookup the card exposes, proxied the way the render proxies its src.
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

const FAST = { fast: true }

describe('an angle destination: card and render agree (#2176)', () => {
  it.each(destinations)('%j', (d) => {
    const body = `![x](<https://e.com/${d}.png>)`
    // Every lookup names the URL the body shows, which the render proxied.
    const rendered = shown(body)
    for (const [name, lookup] of Object.entries(lookups)) {
      expect([name, lookup(body)]).toEqual([name, rendered])
    }
  })

  // Tab widths count from the previous tab on the same line only.
  it.each([
    'a\tb\n![x](<https://e.com/c\td.png>)',
    'ab\t\n x\t![x](<https://e.com/c\t\td.png>)',
    '\t\t\n![x](<https://e.com/\tc\td.png>)'
  ])('%j', (body) => {
    const rendered = shown(body)
    expect(rendered).not.toBeNull()
    for (const [name, lookup] of Object.entries(lookups)) {
      expect([name, lookup(body)]).toEqual([name, rendered])
    }
  })
})

// The card reads the body as Remarkable does: after its input pass (tabs,
// U+00A0, line separators) and with its link rule's separators, so every form
// of image names what the body shows. Fast mode may give up (null) on a body
// it cannot decide, but never names another image.
describe('every image form: card and render agree on parser-rewritten input', () => {
  it.each([
    // Separators: Remarkable skips only spaces and newlines around a destination.
    '![](\u3000<https://e.com/a b.png>)',
    '![](<https://e.com/a b.png>\ufeff)',
    '![](<https://e.com/a.png>\u3000"t")',
    '![](\r<https://e.com/a b.png>)',
    '![](https://e.com/a.png\u3000)',
    '![](\u000b<https://e.com/a b.png>)',
    '![]( \n <https://e.com/a b.png> \n )',
    // A blank line ends the paragraph, so no image spans one.
    '![](<https://e.com/a b.png>\n\n)',
    '![x\n\ny](<https://e.com/a b.png>)',
    '![](<https://e.com/a b.png>\n \t\n)',
    '![](<https://e.com/a b.png>\u2028\u2028)',
    // Plain destinations end at a space or a control, after the input pass.
    '![](https://e.com/a.png\u0085)',
    '![](https://e.com/a\u0085b.png)',
    '![](https://e.com/a\u007fb.png)',
    '![](https://e.com/a\u0001b.png)',
    '![](https://e.com/a\u2424b.png)',
    // Raw HTML reaches the parser after the same pass.
    '<img src="https://e.com/a\u00a0b.png">',
    '<img src="https://e.com/a\tb.png">',
    'x\t<img src="https://e.com/a\tb\tc.png">',
    // Bare URLs.
    'https://e.com/a.png\u0085text',
    'text\u0085https://e.com/a.png',
    'text\u00a0https://e.com/a.png',
    // An escaped `)` is part of a plain destination.
    '![x](https://e.com/a\\).png)',
    '![x](https://e.com/a\\_b.png)',
    '![x](https://e.com/a\\\\b.png)',
    '![x](https://e.com/a\\(b.png)',
    '![x](https://e.com/a\\&amp;b.png)',
    '![x](https://e.com/a\\"b.png)',
    // A title closes with the quote that opened it.
    '![x](<https://e.com/a b.png> "t\')',
    "![x](<https://e.com/a b.png> 't\")",
    // A block start on the next line ends the paragraph: no image spans it.
    '![a\n# b](<https://e.com/a b.png>)',
    '![a\n> b](<https://e.com/a b.png>)',
    '![a\n- b](<https://e.com/a b.png>)',
    '> ![a\n>\n> b](<https://e.com/a b.png>)',
    // The render's own input pass: leofinance/inleo links internalised first,
    // which also moves later tab stops on the line.
    '![x](https://inleo.io/posts/a/b.png)',
    '![x](https://leofinance.io/threads/view/a/b.png)',
    'https://inleo.io/posts/a/b ![x](<https://e.com/c\td.png>)',
    // Lone surrogates outside an angle destination.
    '![x](https://e.com/\ud800x.png)',
    '<img src="https://e.com/\udc00x.png">',
    // A backslash before whitespace does not escape it in a plain destination.
    '![x](https://e.com/a\\ b.png)',
    '![x](https://e.com/a\\\nb.png)',
    // A thematic break of underscores ends the paragraph too.
    '![a\n___\nb](<https://e.com/a b.png>)',
    '![a\n<div>b</div>](<https://e.com/a b.png>)',
    // A setext underline of any hyphen count, a table separator without a
    // leading pipe, and a definition marker each split the paragraph too.
    '![a\n--\nb](<https://e.com/a b.png>)',
    '![a|b\n-|- \nc](<https://e.com/a b.png>)',
    '![a|b\n:-|-:\nc](<https://e.com/a b.png>)',
    '![a\n: b](<https://e.com/a b.png>)',
    '![a\n~ b](<https://e.com/a b.png>)',
    // A one-column separator needs no pipe of its own.
    '![a|\n:-:\nb](<https://e.com/a b.png>)',
    '![a|\n-:\nb](<https://e.com/a b.png>)',
    '|![a\n:-\nb](<https://e.com/a b.png>)',
    // Inside a list item a block starts at the item's indent, which can be 4+.
    '10. ![a\n    --\n    b](<https://e.com/a b.png>)',
    '10. ![a\n    : b](<https://e.com/a b.png>)',
    '10. ![a|b\n    -|-\n    c](<https://e.com/a b.png>)',
    '10. ![a\n    # h\n    b](<https://e.com/a b.png>)',
    // #2179: a stray `%` beside a backslash escape in a plain destination is
    // normalised then decoded once by the render, so it reads as written.
    '![x](https://e.com/50%\\x.png)',
    '![x](https://e.com/50%\\x%41.png)',
    '![x](https://e.com/50%\\_x.png)',
    '![x](https://e.com/50%\\\\_x.png)',
    // #2179: a label holding balanced brackets is still an image.
    '![a [b] c](https://e.com/a.png)\n\n![y](https://e.com/b.png)',
    '![a [b [c]] d](https://e.com/a.png) <img src="https://e.com/b.png">',
    '![a [b [c [d]]] e](https://e.com/a.png)\n\n![y](https://e.com/b.png)',
    '![a [b [c [d]]] e](https://e.com/a.png) <img src="https://e.com/b.png">',
    // An escaped `!` makes a link, not an image (#2179).
    '\\![a](https://e.com/a.png) ![c](https://e.com/b.png)',
    '\\![a [b] c](https://e.com/a.png) ![d](https://e.com/b.png)',
    '\\![a \\[b](https://e.com/a.png) ![d](https://e.com/b.png)',
    'x \\![a [b] c](https://e.com/a.png)\n\n![d](https://e.com/b.png)',
    '\\\\![a [b] c](https://e.com/a.png) ![d](https://e.com/b.png)',
    // An escaped bracket is not a bracket: the label ends elsewhere.
    '![\\[1] my photo](https://e.com/page)\n\n![d](https://e.com/b.png)',
    '![a \\[b] c](https://e.com/page) ![d](https://e.com/b.png)',
    '![a [b\\] c](https://e.com/a.png) x](https://e.com/b.png)',
    '![a\\](https://e.com/page) b](https://e.com/b.png)',
    '![a \\] b](https://e.com/a.png)\n\n<img src="https://e.com/b.png">',
    '![a [b] c](<https://e.com/a b.png>)',
    // #2179: a footnote definition opens a block inside a title too, and an
    // ordered list marker has no digit cap.
    '![a](<https://e.com/a b.png> "t\n[^1]: x")',
    '![a\n1234567890. b](<https://e.com/a b.png>)',
    '![a\n1234567890) b](<https://e.com/a b.png>)',
    // #2179: a bare URL holding a lone surrogate.
    'https://e.com/\ud800x.png',
    '- item\n  - ![a\n    ===\n    b](<https://e.com/a b.png>)',
    '1. - ![a|b\n     -|-\n     c](<https://e.com/a b.png>)',
    // cleanReply drops a platform byline line before the render.
    '![x](https://e.com/a.png) Posted using [LeoFinance](https://leofinance.io)\n\n![y](https://e.com/b.png)'
  ])('%j', (body) => {
    const rendered = shown(body)
    expect(catchPostImage(entry(body), 0, 0, 'match')).toBe(rendered)
    const fast = catchPostImage(entry(body), 0, 0, 'match', FAST)
    if (fast !== null) expect(fast).toBe(rendered)
  })
})

// A stray `%` beside an escape: every lookup names what the body shows (#2179).
describe('a plain destination with a stray % and an escape: all lookups agree', () => {
  it.each([
    '![x](https://e.com/50%\\x.png)',
    '![x](https://e.com/50%\\_x.png)',
    '![x](https://e.com/50%\\\\_x.png)',
    '![x](https://e.com/50%\\.png)'
  ])('%j', (body) => {
    // Lookups without a parser (fast, raw, lcp) may give up (null), never
    // name another image; the card falls back to the render.
    const rendered = shown(body)
    for (const [name, lookup] of Object.entries(lookups)) {
      const found = lookup(body)
      if (name !== 'card' && found === null) continue
      expect([name, found]).toEqual([name, rendered])
    }
  })
})

// Fast mode keeps source order around a bare URL it cannot read: an earlier
// video poster still wins, a later one does not (#2181 review).
describe('a lone surrogate in a bare URL beside a video poster', () => {
  const YT = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'
  it('an earlier poster is still named in fast mode', () => {
    const body = `${YT}\n\nhttps://e.com/\ud800x.png`
    const rendered = shown(body)
    expect(rendered).not.toBeNull()
    expect(catchPostImage(entry(body), 0, 0, 'match', FAST)).toBe(rendered)
    expect(catchPostImage(entry(body), 0, 0, 'match')).toBe(rendered)
  })

  it('a later poster is not promoted over the unread URL', () => {
    const body = `https://e.com/\ud800x.png\n\n${YT}`
    const fast = catchPostImage(entry(body), 0, 0, 'match', FAST)
    if (fast !== null) expect(fast).toBe(shown(body))
    expect(catchPostImage(entry(body), 0, 0, 'match')).toBe(shown(body))
  })
})

// A fragment that cannot be an image (an escaped `!`, or a label a blank line
// ends) does not hide a later image from the parserless lookups (#2181 review).
describe('a later image after a fragment that is not an image', () => {
  it.each([
    '\\![a [b\n\n![c](https://e.com/b.png)',
    '\\![a [b] c](x) ![d](https://e.com/b.png)'
  ])('%j', (body) => {
    const rendered = shown(body)
    expect(rendered).not.toBeNull()
    for (const [name, lookup] of Object.entries(lookups)) {
      if (name === 'card') {
        expect([name, lookup(body)]).toEqual([name, rendered])
        continue
      }
      const found = lookup(body)
      expect([name, found]).toEqual([name, rendered])
    }
  })
})

describe('the shared destination helpers (#2176)', () => {
  it('replaces lone surrogates only', () => {
    expect(withoutLoneSurrogates('a\ud800b\udc00c😀')).toBe('a�b�c😀')
  })

  it('normalises as Remarkable does, keeping a malformed URI', () => {
    expect(uriNormalized('a b%20c')).toBe('a%20b%20c')
    expect(uriNormalized('a%zz b')).toBe('a%25zz%20b')
  })

  it('encodes only the unsafe ASCII, keeping % and non-ASCII as written', () => {
    expect(plainDestination('https://e.com/café a%20b.png')).toBe('https://e.com/café%20a%20b.png')
    expect(plainDestination('a\\b"c<d>[e]^f`g{h|i}')).toBe('a%5Cb%22c%3Cd%3E%5Be%5D%5Ef%60g%7Bh%7Ci%7D')
    expect(plainDestination('https://e.com/ok.png')).toBe('https://e.com/ok.png')
  })

  it('reads a % that starts no escape as Remarkable does', () => {
    expect(plainDestination('50%%20off a')).toBe(uriNormalized('50%%20off a'))
  })
})

// A line inside an image that opens no block keeps the image readable in fast
// mode: only the parser's own block starts defer it to the render.
describe('a multi-line image the card still reads in fast mode', () => {
  it.each([
    '![Sunset over the bay\n2023 trip](https://e.com/a.png)',
    '![a\n-b](https://e.com/a.png)',
    '![a\n#b](https://e.com/a.png)',
    '![a\n1999-01 photo](https://e.com/a.png)',
    '![x](\n<https://e.com/a b.png>)',
    '![x](\nhttps://e.com/a.png)',
    '![a\n<3 you](https://e.com/a.png)',
    '![a\n--b](https://e.com/a.png)',
    '![a\n:b](https://e.com/a.png)',
    '![a\n~b](https://e.com/a.png)',
    '![a\n-:b](https://e.com/a.png)',
    // Balanced brackets in a label, two levels deep (#2179).
    '![a [b] c](https://e.com/a.png)\n\n![y](https://e.com/b.png)',
    '![a [b [c]] d](https://e.com/a.png)'
  ])('%j', (body) => {
    const rendered = shown(body)
    expect(rendered).not.toBeNull()
    expect(catchPostImage(entry(body), 0, 0, 'match', FAST)).toBe(rendered)
    expect(catchPostImage(entry(body), 0, 0, 'match')).toBe(rendered)
  })
})
