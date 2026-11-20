import { describe, expect, it } from 'vitest'
import { markdown2Html } from './markdown-2-html'

// #2154. The app render (forApp) swaps entities for placeholders while it
// renders and puts them back afterwards. These are the cases where that
// changed what the author wrote; each expects the app render's exact output.
let n = 0
const render = (body: string, forApp = true) =>
  markdown2Html({ author: 'entities', permlink: `e${n++}`, last_update: '2026-11-20', body } as never, forApp)

describe('app render entity protection (#2154)', () => {
  it('decodes an angle-bracket destination once, as the plain form', () => {
    const plain = '<p dir="auto"><a class="markdown-external-link" data-href="https://example.com/?q=&amp;amp;amp;">x</a></p>'
    expect(render('[x](https://example.com/?q=&amp;amp;amp;)')).toBe(plain)
    expect(render('[x](<https://example.com/?q=&amp;amp;amp;>)')).toBe(plain)
  })

  it('keeps an angle destination holding a `)` whole', () => {
    expect(render('[open](<https://example.test/a)b?x=1&amp;y=2>)')).toBe(
      '<p dir="auto"><a class="markdown-external-link" data-href="https://example.test/a)b?x=1&amp;y=2">open</a></p>'
    )
    // The web render names the same URL.
    expect(render('[open](<https://example.test/a)b?x=1&amp;y=2>)', false)).toContain('href="https://example.test/a)b?x=1&amp;y=2"')
  })

  it('leaves author text that looks like a placeholder as written', () => {
    expect(render('`​0​` and &amp;')).toBe('<p dir="auto"><code>​0​</code> and &amp;</p>')
    expect(render('​0​ and &amp;')).toBe('<p dir="auto">​0​ and &amp;</p>')
  })

  it('renders an indented code block like a fenced one', () => {
    expect(render('para\n\n    a &amp; b\n')).toBe('<p dir="auto">para</p>\n<pre><code>a &amp;amp; b\n</code></pre>')
  })

  it('protects entities after a line that opens no fence', () => {
    expect(render('```bad`info\n\nx &copy;\n')).toBe('<p dir="auto">```bad`info</p>\n<p dir="auto">x &copy;</p>')
  })

  it('pairs backticks only within one block', () => {
    expect(render('one ` tick\n\ntwo &copy;\n\nthree `code`')).toBe(
      '<p dir="auto">one ` tick</p>\n<p dir="auto">two &copy;</p>\n<p dir="auto">three <code>code</code></p>'
    )
  })
})

describe('destinations decode once on every form (#2154)', () => {
  it.each([true, false])('angle and plain reference definitions agree (forApp %s)', (forApp) => {
    const plain = render('[x][r]\n\n[r]: https://example.com/?q=&amp;amp;amp;', forApp)
    expect(plain).toContain('https://example.com/?q=&amp;amp;amp;"')
    expect(render('[x][r]\n\n[r]: <https://example.com/?q=&amp;amp;amp;>', forApp)).toBe(plain)
  })

  it.each([true, false])('angle and plain image destinations agree (forApp %s)', (forApp) => {
    const plain = render('![x](https://example.com/a.png?q=&amp;amp;amp;)', forApp)
    expect(render('![x](<https://example.com/a.png?q=&amp;amp;amp;>)', forApp)).toBe(plain)
  })

  it('still percent-encodes a space in an angle destination', () => {
    expect(render('[x](<https://example.com/a b?q=1&amp;r=2>)', false)).toContain('href="https://example.com/a%20b?q=1&amp;r=2"')
  })
})

// Review round: each of these broke on the first version of the fix.
describe('#2154 review edges', () => {
  it.each(['/&#47;evil.example/@alice/X_y', '/&#47;evil.example/@alice/some-post', '/&#92;evil.example/@alice/posts'])(
    'a path entity is never in-site, whatever the delimiter (%s)',
    (path) => {
      for (const prefix of ['', 'zero​width\n\n', 'a​⁠⁡⁢⁣⁤b\n\n']) {
        const html = render(`${prefix}[x](${path})`)
        expect(html).toContain('class="markdown-external-link"')
        expect(html).not.toMatch(/markdown-(?:post|profile)-link/)
      }
    }
  )

  it('rewrites only the definition that won', () => {
    const want = 'data-href="https://e.com/?q=&amp;"'
    expect(render('[a]: https://e.com/?q=&amp;\n[a]: <https://e.com/?q=&amp;amp;>\n\n[x][a]')).toContain(want)
    const failedFirst = render('[a]: <https://e.com/?q=&amp;amp;> junk\n\n[a]: https://e.com/?q=&amp;\n\n[x][a]')
    expect(failedFirst).toContain(want)
    expect(failedFirst).not.toContain('&amp;amp;"')
  })

  it.each(['```\nx&lt;\ty\n```', '    x&lt;\ty &amp;\tz\n', 'a\tb\n\n```\n&copy;\t|\n```'])('keeps tab stops in code as on the web (%j)', (body) => {
    const code = (html: string) => html.replace(/<span class="ll-[a-z]+">|<\/span>/g, '').match(/<code>([\s\S]*?)<\/code>/)?.[1]
    expect(code(render(body))).toBe(code(render(body, false)))
  })

  it('protects entities in angle text that is no link', () => {
    expect(render('see <https://e.com/my page &copy; more> end')).toContain('page &copy; more')
    expect(render('x &copy; <https://e.com/a\\> y &copy; z > w &copy;')).not.toContain('©')
  })

  it('does not read an encoded delimiter as a placeholder', () => {
    expect(render('https://e.com/&#8203;0&#8203; and &copy;')).toContain('and &copy;')
    expect(render('https://e.com/&#8203;0&#8203; and &copy;')).not.toMatch(/<\/a>&#8203; and/)
  })
})

describe('#2154 second review edges', () => {
  it.each([
    ['[https://a.com](<https://e.com/a b?x=1&amp;y=2>)', 'data-href="https://e.com/a%20b?x=1&amp;y=2"'],
    ['[see https://a.com](<https://e.com/a b?x=1&amp;y=2>)', 'data-href="https://e.com/a%20b?x=1&amp;y=2"'],
    ['[https://a.com]: <https://e.com/a b?x=1&amp;y=2>\n\n[x][https://a.com]', 'data-href="https://e.com/a%20b?x=1&amp;y=2"']
  ])('keeps an angle destination whole after a bare URL in the label (%j)', (body, want) => {
    expect(render(body)).toContain(want)
  })

  it.each(['a\r\r\n\r\r\nb &amp;', '&amp;\r\r\nx', 'a \tb &amp;\r\n\tc'])('keeps line breaks as the web reads them (%j)', (body) => {
    expect(render(body).replace(/&amp;/g, '&')).toBe(render(body, false).replace(/&amp;/g, '&'))
  })

  it('reads a heading with a definition text as no failed definition', () => {
    for (const forApp of [true, false]) {
      const html = render('[a]: <https://e.com/?q=&amp;amp;amp;>\n\n# [a]: <https://e.com/?q=&amp;amp;amp;>\n\n[x][a]', forApp)
      expect(html).toMatch(/href="https:\/\/e\.com\/\?q=&amp;amp;amp;"[^>]*>x</)
    }
  })
})

describe('#2154 third review edges', () => {
  it.each([' ', '\u0085', '␤'])('an angle span does not cross a parser line break (%j)', (br) => {
    expect(render(`x (<https://e.com/a${br}b &copy; c>) y`)).toContain('&copy; c')
    expect(render(`[r]: <https://e.com/a${br}b &copy; c>`)).toContain('&copy; c')
  })
})

describe('#2154 fourth review edges', () => {
  it.each([' ', '\n'])('an escaped line break stays inside an angle destination (%j)', (br) => {
    expect(render(`[x](<https://e.com/a\\${br}b?q=&copy;&amp;z=1>)`)).not.toContain('%E2%80%8B')
  })
})

describe('#2154 fifth review edges', () => {
  it.each(['\r\n', '\r\u0085'])('an escaped CR line break stays inside an angle destination (%j)', (br) => {
    expect(render(`[x](<https://e.com/a\\${br}b?q=&copy;&amp;z=1>)`)).not.toContain('%E2%80%8B')
  })
})
