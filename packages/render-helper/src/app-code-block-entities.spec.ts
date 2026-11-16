import { describe, expect, it } from 'vitest'
import { markdown2Html } from './markdown-2-html'

// #2093. The app render swaps entities for placeholders while it renders; the
// syntax highlighter split a placeholder across spans in a fenced code block,
// so the restore missed it and the app showed `0 1b2` for `&amp; &lt;b&gt;`.
// Code is left out of the swap, so it renders exactly as on the web.
let n = 0
const render = (body: string, forApp: boolean) =>
  markdown2Html({ author: 'code', permlink: `c${n++}`, last_update: '2026-11-16', body } as never, forApp)
const strip = (html: string) => html.replace(/ data-[a-z-]+="[^"]*"/g, '')

describe('entities in code, app render (#2093)', () => {
  it.each([
    '```\n&amp; &lt;b&gt;\n```',
    '```js\nconst a = 1 &amp;&amp; 2 &lt; 3\n```',
    '~~~\n&copy; &#169;\n~~~',
    'Inline `&amp; &lt;b&gt;` code',
    'Before\n\n```\n&amp;\n```\n\nafter &amp; text'
  ])('renders %j as the web does', (body) => {
    const app = render(body, true)
    expect(app).not.toContain('​')
    expect(strip(app)).toBe(strip(render(body, false)))
  })

  it.each([
    ['unclosed fences', '```\n&amp;\n'.repeat(6000)],
    ['backtick runs of mixed length', '`a&amp;``b```c&lt;'.repeat(4000)],
    ['one opener, no close', '``` &amp;\n' + 'x &amp; `` y\n'.repeat(5000)]
  ])('adds no real cost over the web render on %s', (_name, body) => {
    // Compared with the web render, which has no entity swap: a large code
    // block is slow to highlight on both, and that is not this code's cost.
    const time = (forApp: boolean) => {
      const started = performance.now()
      render(body, forApp)
      return performance.now() - started
    }
    const web = time(false)
    expect(time(true)).toBeLessThan(web * 1.5 + 300)
  }, 60000)

  it('still keeps entities in text outside code', () => {
    expect(render('Fish &amp; chips `x` &copy;', true)).toContain('Fish &amp; chips')
  })
})
