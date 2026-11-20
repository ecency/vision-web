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
