import { describe, expect, it } from 'vitest'
import { markdown2Html } from './markdown-2-html'

// A browser trims leading and trailing ASCII whitespace from a URL attribute,
// so `<iframe src=" https://www.youtube.com/embed/ID">` plays. The embed check
// must read it the same way instead of showing "(Unsupported ...)".
let n = 0
const render = (body: string) =>
  markdown2Html({ author: 'ws', permlink: `iframe-ws-${n++}`, last_update: '2026-11-16', body } as never)

describe('iframe src with surrounding whitespace', () => {
  it.each([' ', '\n', '\t', ' \n '])('embeds a YouTube iframe whose src is wrapped in %j', (ws) => {
    const html = render(`<iframe src="${ws}https://www.youtube.com/embed/dQw4w9WgXcQ${ws}"></iframe>`)
    expect(html).not.toContain('Unsupported')
    expect(html).toContain('dQw4w9WgXcQ')
  })

  it('still refuses an iframe that is not on the allow list', () => {
    expect(render('<iframe src=" https://evil.example/x"></iframe>')).toContain('(Unsupported https://evil.example/x)')
  })
})
