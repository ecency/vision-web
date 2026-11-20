import { describe, expect, it } from 'vitest'
import { markdown2Html } from './markdown-2-html'

// #2165. The app render's in-site path guard rejects only the placeholder
// delimiter that render chose, never an author's look-alike character.
let n = 0
const render = (body: string, forApp = true) =>
  markdown2Html({ author: 'guard', permlink: `g${n++}`, last_update: '2026-11-21', body } as never, forApp)

describe('app render in-site path guard (#2165)', () => {
  it.each(['⁠', ''])('keeps an authored %j in a local path an internal link', (ch) => {
    const html = render(`[x](/topic${ch}/@alice/some-post)`)
    expect(html).toContain('class="markdown-post-link"')
    expect(html).not.toContain('markdown-external-link')
    // With an entity elsewhere, so a delimiter is chosen.
    expect(render(`a &amp; b\n\n[x](/topic${ch}/@alice/some-post)`)).toContain('class="markdown-post-link"')
  })

  it.each([
    ['zero-width space', ''],
    ['U+2060', 'zero​width\n\n'],
    ['private use', 'a​⁠⁡⁢⁣⁤b\n\n']
  ])('a path entity is never in-site (%s delimiter)', (_name, prefix) => {
    for (const path of ['/&#47;evil.example/@alice/some-post', '/&#92;evil.example/@alice/X_y']) {
      const html = render(`${prefix}[x](${path})`)
      expect(html).toContain('class="markdown-external-link"')
      expect(html).not.toMatch(/markdown-(?:post|profile)-link/)
    }
  })

  it('a path entity is never in-site with the two-character fallback delimiter', () => {
    let taken = '​⁠⁡⁢⁣⁤'
    for (let c = 0xe100; c <= 0xf8ff; c++) taken += String.fromCharCode(c)
    const html = render(`${taken}\n\n[x](/&#47;evil.example/@alice/some-post)`)
    expect(html).toContain('class="markdown-external-link"')
    expect(html).not.toMatch(/markdown-(?:post|profile)-link/)
  })
})

describe('an authored zero-width space in a path (#2165 review)', () => {
  it.each(['', 'a &amp; b\n\n'])('stays external whatever else the body holds (%j)', (prefix) => {
    for (const path of ['/topic​/@alice/some-post', '/​/evil.example/@alice/some-post']) {
      expect(render(`${prefix}[x](${path})`)).toContain('class="markdown-external-link"')
    }
  })
})
