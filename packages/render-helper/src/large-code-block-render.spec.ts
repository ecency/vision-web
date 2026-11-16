import { describe, expect, it } from 'vitest'
import { markdown2Html } from './markdown-2-html'

// #2097. One large fenced code block took about 4.5 s to render: the syntax
// highlighter alone needed 3.5 s for 60 KB. Past a size bound a block is shown
// as plain escaped code, as it is when the highlighter is unavailable.
let n = 0
const render = (body: string) =>
  markdown2Html({ author: 'big', permlink: `b${n++}`, last_update: '2026-11-16', body } as never, false)

describe('large code blocks (#2097)', () => {
  it('a 60 KB block renders in under a second', () => {
    const body = '```\n' + 'x &amp; `` y\n'.repeat(5000) + '```'
    const started = performance.now()
    const html = render(body)
    expect(performance.now() - started).toBeLessThan(1000)
    expect(html).toContain('x &amp;amp; `` y')
  })

  it('a normal block is still highlighted', () => {
    expect(render('```js\nconst a = 1\n```')).toContain('class="ll-')
  })

  // A highlighted token was written into the HTML unescaped, so a string
  // literal holding markup (`"<i>hi</i>"`) rendered as markup inside the code.
  it('code text is shown, not rendered, inside a highlighted block', () => {
    const html = render('```js\nconst s = "<i>hi</i>"\n```')
    expect(html).not.toContain('<i>')
    expect(html).toContain('&lt;i&gt;hi&lt;/i&gt;')
  })
})
