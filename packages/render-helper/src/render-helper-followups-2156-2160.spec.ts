import { describe, expect, it } from 'vitest'
import { markdown2Html } from './markdown-2-html'
import { getEntryCardImageRawUrl } from './card-image'
import { catchPostImage } from './catch-post-image'
import { proxifyImageSrc } from './proxify-image-src'

let n = 0
const entry = (body: string) => ({ author: 'followup', permlink: `f${n++}`, last_update: '2026-11-21', body }) as never
const render = (body: string, forApp = true) => markdown2Html(entry(body), forApp)
const href = (html: string) => html.match(/(?:data-)?href="([^"]*)"/)?.[1]

describe('card image reads an angle-bracket image destination (#2156)', () => {
  it('as the plain form', () => {
    expect(getEntryCardImageRawUrl(entry('![x](<https://example.com/a.png?q=&amp;amp;>)'))).toBe(
      getEntryCardImageRawUrl(entry('![x](https://example.com/a.png?q=&amp;amp;)'))
    )
    expect(getEntryCardImageRawUrl(entry('![x](https://example.com/a.png?q=&amp;amp;)'))).toBe('https://example.com/a.png?q=&amp;')
  })

  it('with a space, as the render proxies it', () => {
    const body = '![x](<https://example.com/a b.png>)'
    const plain = '![x](https://example.com/a%20b.png)'
    expect(getEntryCardImageRawUrl(entry(body))).toBe(getEntryCardImageRawUrl(entry(plain)))
    expect(catchPostImage(entry(body), 0, 0, 'match')).toBe(catchPostImage(entry(plain), 0, 0, 'match'))
  })
})

describe('card image reads a bare markdown URL as the render does (#2157)', () => {
  it.each([
    ['https://h.example/p.jpg?a=1&#41;', 'https://h.example/p.jpg?a=1'],
    ['https://h.example/p.jpg?a=(1)', 'https://h.example/p.jpg?a=(1)'],
    ['https://h.example/p.jpg?a=1))', 'https://h.example/p.jpg?a=1)'],
    ['(https://h.example/p.jpg?size=1)text', 'https://h.example/p.jpg?size=1)text']
  ])('%s', (body, url) => {
    expect(getEntryCardImageRawUrl(entry(body))).toBe(url)
    expect(render(body, false)).toContain(proxifyImageSrc(url, 0, 0, 'match').split('?')[0])
  })
})

describe('angle destination leftovers (#2158)', () => {
  it.each([true, false])('a lone surrogate in an angle destination keeps the body (forApp %s)', (forApp) => {
    const html = render('text\n\n[y](<https://e.com/\ud800?q=1>)', forApp)
    expect(html).toContain('text')
    expect(html).toContain('y')
  })

  it('U+2029 inside an autolink names the web URL on the app', () => {
    const body = '<https://e.com/a b?q=&copy;&amp;z=1>'
    const app = render(body)
    expect(app).not.toMatch(/%E2%80%8B|​/)
    expect(href(app)).toBe(href(render(body, false)))
  })

  it.each([
    ['[x][k]\n\n[k]: https://e.com/%', '[x][k]\n\n[k]: <https://e.com/%>'],
    ['[x](https://e.com/é)', '[x](<https://e.com/é>)']
  ])('the plain and angle forms name the same URL (%j)', (plain, angle) => {
    for (const forApp of [true, false]) expect(href(render(angle, forApp))).toBe(href(render(plain, forApp)))
  })
})

describe('an uppercase scheme keeps its href on the web render (#2159)', () => {
  it.each(['HTTPS://A.com/p', 'Http://a.com', 'HTTP://a.com/x?y=1'])('%s', (url) => {
    const h = href(render(url, false))
    expect(h).toBeTruthy()
    expect(h!.toLowerCase()).toBe(url.toLowerCase().replace(/&/g, '&amp;'))
  })
})

describe('a bare URL followed by ) and an entity (#2160)', () => {
  it('links the same target with the same trailing text on both renders', () => {
    const body = 'see https://e.com/a)&amp;x end'
    const app = render(body)
    const web = render(body, false)
    expect(href(app)).toBe(href(web))
    const tail = (html: string) => html.replace(/<a [^>]*>[^<]*<\/a>/, '<a/>')
    expect(tail(app)).toBe(tail(web))
  })
})

describe('#2156-#2160 review round', () => {
  it('an entity in the second of two adjacent images stays out of its proxied URL (app)', () => {
    const body = '![a](https://e.com/i.png)![b](https://e.com/j.png?x=1&amp;y=2)'
    const srcs = (html: string) => [...html.matchAll(/<img [^>]*src="([^"]*)"/g)].map((m) => m[1])
    expect(srcs(render(body))).toEqual(srcs(render(body, false)))
    expect(render('[a](https://e.com/1)https://e.com/2?x=1&amp;y=2').match(/data-href="(https:\/\/e\.com\/2[^"]*)"/)?.[1]).toBe('https://e.com/2?x=1&amp;y=2')
  })

  it.each([
    '(https://e.com/a)&amp;x', "https://e.com/a'&amp;x", 'https://e.com/a))&amp;x', 'https://e.com/a)(&amp;x', 'x https://e.com/a)&amp;x'
  ])('linkify names the URL the web names (%j)', (body) => {
    const hrefs = (html: string) => [...html.matchAll(/(?:data-)?href="([^"]*)"/g)].map((m) => m[1])
    expect(hrefs(render(body))).toEqual(hrefs(render(body, false)))
  })

  it.each(['**https://h.example/p.jpg**', '*https://h.example/p.jpg*', '~~https://h.example/p.jpg~~', 'text **https://h.example/p.jpg**.'])('the card leaves emphasis markers out (%j)', (body) => {
    expect(getEntryCardImageRawUrl(entry(body))).toBe('https://h.example/p.jpg')
  })

  it.each(['https://h.example/p.jpg[^1]', 'https://h.example/p.jpg[x](https://e.com)', 'https://h.example/p.jpg![x](https://e.com/q.png)'])('the card leaves a following construct out (%j)', (body) => {
    expect(getEntryCardImageRawUrl(entry(body))).toBe('https://h.example/p.jpg')
  })

  it('an underscore host is a host', () => {
    expect(getEntryCardImageRawUrl(entry('https://my_bucket.s3.amazonaws.com/a/p.jpg'))).toBe('https://my_bucket.s3.amazonaws.com/a/p.jpg')
  })

  it.each([
    ['![x](<https://e.com/50% off.png>)', '![x](https://e.com/50%25%20off.png)'],
    ['![x](<https://e.com/a\\_b.png>)', '![x](https://e.com/a_b.png)']
  ])('an angle image destination reads as its plain spelling (%j)', (angle, plain) => {
    expect(getEntryCardImageRawUrl(entry(angle))).toBe(getEntryCardImageRawUrl(entry(plain)))
    for (const forApp of [true, false]) {
      expect(render(angle, forApp).match(/<img [^>]*src="([^"]*)"/)?.[1]).toBe(render(plain, forApp).match(/<img [^>]*src="([^"]*)"/)?.[1])
    }
  })

  it('an angle link with a stray % keeps a well-formed URL', () => {
    expect(href(render('[x](<https://e.com/50% off>)', false))).toBe('https://e.com/50%25%20off')
  })
})

describe('#2156-#2160 second review round', () => {
  const renderedImage = (body: string) => render(body, false).match(/<img [^>]*src="([^"]*)"/)?.[1] ?? null

  it.each([
    ['*italic*https://e.com/a*b.png', 'https://e.com/a*b.png'],
    ['_**https://e.com/a_b.png**_', 'https://e.com/a_b.png'],
    ['https://e.com/a.png[a[b]](c)', 'https://e.com/a.png'],
    ['https://e.com/a.png[x]\n\n[x]: /u', 'https://e.com/a.png']
  ])('the card reads %j as the render does', (body, url) => {
    expect(getEntryCardImageRawUrl(entry(body))).toBe(url)
    expect(renderedImage(body)).toBe(proxifyImageSrc(url, 0, 0, 'match').replace(/&/g, '&amp;').replace(/\?format=match&amp;mode=fit$/, '') + '?format=match&amp;mode=fit')
  })


  it('stays linear on long emphasis runs', () => {
    // Growth, not wall time: four times the body must take well under
    // sixteen times as long (quadratic).
    const body = (n: number) => '*'.repeat(n) + 'https://e.com/x.png' + ('*'.repeat(n - 1) + 'a').repeat(2)
    const time = (n: number) => {
      const t = performance.now()
      getEntryCardImageRawUrl(entry(body(n)))
      return performance.now() - t
    }
    time(5_000)
    const small = Math.min(time(20_000), time(20_000))
    const large = Math.min(time(80_000), time(80_000))
    expect(large / Math.max(small, 0.5)).toBeLessThan(10)
  })

  it('an invalid numeric reference reads as the web reads it, for linkify', () => {
    const body = 'see www.e.com/it&#146;s now'
    expect(href(render(body))).toBe(href(render(body, false)))
  })
})

describe('#2156-#2160 third review round', () => {
  const renderedImage = (body: string, forApp = false) => {
    const src = render(body, forApp).match(/<img [^>]*src="([^"]*)"/)?.[1]
    return src ? src.replace(/&amp;/g, '&') : null
  }
  const cardImage = (body: string) => {
    const url = getEntryCardImageRawUrl(entry(body))
    return url ? proxifyImageSrc(url, 0, 0, 'match') : null
  }

  it.each([
    '**https://e.com/p.png.**', '**https://e.com/p.png)**', '*https://e.com/p.png&#42;', '*Source: https://e.com/p.png*',
    '_Source: https://e.com/p.png_', '**Source: https://e.com/p.png**', '~~old https://e.com/p.png~~', '*Source: https://e.com/p.png.*',
    '(https://x.y_z.com/p.jpg)', '(https://a.b_c.com/p.jpg).', 'https://my_bucket.s3.amazonaws.com/a/p.jpg'
  ])('the card names the image the render shows for %j', (body) => {
    expect(cardImage(body)).toBe(renderedImage(body))
  })

  it.each(['https://e.com/p.png)&amp;x', "https://e.com/p.png'&amp;", 'https://e.com/p.png&copy;'])('the app shows the image the web shows for %j', (body) => {
    expect(renderedImage(body, true)).toBe(renderedImage(body, false))
  })
})

describe('#2156-#2160 fourth review round', () => {
  const renderedImage = (body: string) => {
    const src = render(body, false).match(/<img [^>]*src="([^"]*)"/)?.[1]
    return src ? src.replace(/&amp;/g, '&') : null
  }
  const cardImage = (body: string) => {
    const url = getEntryCardImageRawUrl(entry(body))
    return url ? proxifyImageSrc(url, 0, 0, 'match') : null
  }

  it.each([
    'https://e.com/p.gif&#91;_', 'https://e.com/p.png&lt;~', 
    'https://e.com/p.png?_', 'Is it https://e.com/p.png?*', 'https://e.com/p.png?v=2_',
    '**https://e.com/p.png**', '*Source: https://e.com/p.png*'
  ])('the card names the image the render shows for %j', (body) => {
    expect(cardImage(body)).toBe(renderedImage(body))
  })

  it.each([
    ['Visit www.example.com/q?x=1&y; now', '; now'],
    ['see https://e.com/a)&foo; there', '; there']
  ])('app link text loses nothing at an entity boundary (%j)', (body, tail) => {
    const app = render(body)
    expect(app).toContain(tail)
    expect(app.replace(/<[^>]+>/g, '')).toBe(render(body, false).replace(/<[^>]+>/g, '').replace(/&amp;/g, '&amp;'))
  })

  it('app link text repeats nothing at an entity boundary', () => {
    const text = render('joe@exam&bne;ple.com').replace(/<[^>]+>/g, '')
    expect(text.split('⃥').length - 1).toBe(1)
  })
})

// Fifth review: every class the review rounds found right on develop stays right.
describe('#2157 card keeps develop\'s reading outside the parenthesis cases', () => {
  const renderedImage = (body: string) => {
    const src = render(body, false).match(/<img [^>]*src="([^"]*)"/)?.[1]
    return src ? src.replace(/&amp;/g, '&') : null
  }
  const cardImage = (body: string) => {
    const url = getEntryCardImageRawUrl(entry(body))
    return url ? proxifyImageSrc(url, 0, 0, 'match') : null
  }
  it.each([
    'https://a_b.c_d.com/p.jpg', 'https://e.com?i=p.png..', 'a*https://e.com/p.gif*', 'x~https://e.com/p.gif~',
    '**https://e.com/p.png**;', '*https://e.com/p.png*_', '**https://e.com/p.png**_', '(**https://e.com/p.jpeg**)',
    '"**https://e.com/p.jpeg**"', '**https://e.com/p.jpeg**)', '*https://e.com/p.png*)', 'https://e.com/p.gif&#91;_', 'https://e.com/p.png&lt;~'
  ])('%j', (body) => {
    expect(cardImage(body)).toBe(renderedImage(body))
  })
})

// Realistic classes from the review rounds: those right on develop stay right,
// and the stray-# ones read as the render reads them.
describe('#2157 card matches the render on realistic classes', () => {
  const renderedImage = (body: string) => {
    const src = render(body, false).match(/<img [^>]*src="([^"]*)"/)?.[1]
    return src ? src.replace(/&amp;/g, '&') : null
  }
  const cardImage = (body: string) => {
    const url = getEntryCardImageRawUrl(entry(body))
    return url ? proxifyImageSrc(url, 0, 0, 'match') : null
  }
  it.each([
    '_(https://e.com/p.png)_', '_(Source: https://e.com/p.png)_', '(https://e.com/p.png)_a_', '- _(https://e.com/p.png)_',
    '==(https://e.com/p.png)==', '++(https://e.com/p.png)++', '| a | b |\n|---|---|\n|(https://e.com/p.png)|x|',
    'https://e.com/p.png&#41;*', 'a@https://e.com/p.png))', '@HTTPS://e.com/p.jpg))',
    'x # https://e.com/p.png.)', '^https://e.com/p.png))^', 'https://e.com/p.png\ud83d', 'https://e.com/\ud83dp.png',
    'x # y https://e.com/p.png))', 'Step # 2 (see image https://e.com/p.png))', 'x # y https://e.com/p.png?a=1))',
    'x &num; y https://e.com/p.png))', 'x &#35; y https://e.com/p.png))', 'x \\# y https://e.com/p.png))', 'x (#) y https://e.com/p.png))',
    '- x #, y https://e.com/p.png))', 'C# y https://e.com/p.png))', 'C# https://e.com/p.png))', 'x # y\nhttps://e.com/p.png?a=(1)',
    '## Title https://e.com/p.png?a=(1)', '#tag https://e.com/p.png?a=(1)', 'x #1 https://e.com/p.png?a=(1)',
    '_x_# https://e.com/p.png))', 'a_# https://e.com/p.png))', '\u00b2# https://e.com/p.png))', '#\u00b2 https://e.com/p.png))',
    '(#hive) https://e.com/p.png))', '"#hive" https://e.com/p.png))', '#\ud83d\ude00 https://e.com/p.png))', '#_x https://e.com/p.png))', '> x #! y https://e.com/p.png))'
  ])('%j', (body) => {
    expect(cardImage(body)).toBe(renderedImage(body))
  })
})

describe('the LCP preload and card proxy the image the body shows (#2169)', () => {
  const shown = (body: string) => render(body, false).match(/<img [^>]*src="([^"]*)"/)?.[1]?.replace(/&amp;/g, '&')
  it.each(['![x](https://example.com/a%20b.png)', '![x](https://example.com/caf%C3%A9.png)', '<img src="https://example.com/a%20b.png">'])('%j', (body) => {
    expect(catchPostImage(entry(body), 0, 0, 'match')).toBe(shown(body))
  })

  it('a legacy 0x0 card URL carries no live #', () => {
    const body = '![x](https://images.ecency.com/0x0/https://e.com/a%23b.png)'
    const card = catchPostImage(entry(body), 0, 0, 'match') ?? ''
    expect(card).not.toContain('#')
  })

  it.each([
    '![x](https://images.ecency.com/0x0/https://example.com/p/a%23b.png)',
    '![x](https://steemitimages.com/0x0/https://www.instagram.com/p/Bx%23y/media.jpg)',
    '![x](https://images.hive.blog/0x0/https://example.com/p/a%0Ab.png)'
  ])('a legacy passthrough with /p/ in its own path keeps its escapes: %j', (body) => {
    const card = catchPostImage(entry(body), 0, 0, 'match') ?? ''
    expect(card).not.toMatch(/[#\s]/)
    expect(card).toContain('%')
  })
})
