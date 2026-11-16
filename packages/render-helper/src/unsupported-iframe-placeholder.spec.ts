import { describe, expect, it } from 'vitest'
import { markdown2Html } from './markdown-2-html'

// #2095. The placeholder for a refused iframe, `(Unsupported <src>)`, is text
// the render wrote; the text pass must not linkify it into a link or a video.
let n = 0
const render = (body: string, forApp: boolean) =>
  markdown2Html({ author: 'ph', permlink: `p${n++}`, last_update: '2026-11-16', body } as never, forApp)

describe('refused iframe placeholder (#2095)', () => {
  it.each([false, true])('stays plain text (forApp %s)', (forApp) => {
    const src = 'https://evil.example/?u=https://www.youtube.com/embed/dQw4w9WgXcQ'
    const html = render(`<iframe src="${src}"></iframe>`, forApp)
    const placeholder = /<div class="unsupported-iframe"[^>]*>([\s\S]*?)<\/div>/.exec(html)
    expect(placeholder).not.toBeNull()
    expect(placeholder![1]).toBe(`(Unsupported ${src.replace(/&/g, '&amp;')})`)
    expect(html).not.toContain('markdown-video-link')
    expect(html).not.toContain('<a ')
  })

  it('an author-written URL in a div is still linkified', () => {
    expect(render('<div>https://www.youtube.com/watch?v=dQw4w9WgXcQ</div>', false)).toContain('markdown-video-link')
  })
})
