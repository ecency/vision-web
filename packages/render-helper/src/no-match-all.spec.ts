import { afterEach, describe, expect, it } from 'vitest'
import { catchPostImage } from './catch-post-image'
import { sanitizeHtml } from './methods/sanitize-html.method'
import { regexMatches } from './regex-matches'

// Safari 12 has no String.prototype.matchAll (#1701). Every input below is
// rendered with the native method first, then again with it removed: the
// output must be the same, not a TypeError.
const nativeMatchAll = String.prototype.matchAll
const withoutMatchAll = <T>(run: () => T): T => {
  // @ts-expect-error simulating an engine without matchAll
  delete String.prototype.matchAll
  try {
    return run()
  } finally {
    String.prototype.matchAll = nativeMatchAll
  }
}
afterEach(() => {
  String.prototype.matchAll = nativeMatchAll
})

describe('render-helper without String.prototype.matchAll', () => {
  it.each([
    ['a bare image URL', 'Look https://example.com/a/photo.jpg?w=1 here'],
    ['two extensions in one token', 'https://example.com/x.png/y.webp'],
    ['a standalone YouTube link', 'Watch\n\nhttps://www.youtube.com/watch?v=dQw4w9WgXcQ\n\nnow'],
    ['a [url](url) image link', 'see [https://example.com/p.png](https://example.com/p.png) ok'],
    ['an image link after a video', 'https://youtu.be/dQw4w9WgXcQ\n\n[https://e.com/q.gif](https://e.com/q.gif)']
  ])('catchPostImage reads %s', (_name, body) => {
    const native = catchPostImage(body, 0, 0, 'match')
    const fast = catchPostImage(body, 0, 0, 'match', { fast: true })
    expect(native).not.toBeNull()
    expect(withoutMatchAll(() => catchPostImage(body, 0, 0, 'match'))).toBe(native)
    expect(withoutMatchAll(() => catchPostImage(body, 0, 0, 'match', { fast: true }))).toBe(fast)
  })

  it('sanitizeHtml keeps an iframe with a src and drops one without', () => {
    const html =
      '<iframe src="https://www.youtube.com/embed/dQw4w9WgXcQ"></iframe><iframe title="x"></iframe>'
    const native = sanitizeHtml(html)
    expect(native).toContain('youtube.com/embed/dQw4w9WgXcQ')
    expect(withoutMatchAll(() => sanitizeHtml(html))).toBe(native)
  })

  it('regexMatches gives what matchAll gives, empty matches and astral code points included', () => {
    const cases: Array<[string, RegExp]> = [
      ['a.png b.JPG', /\.(?:png|jpe?g)/gi],
      ['abc', /x*/g],
      ['\u{1F600}a\u{1F600}', /(?:)/gu]
    ]
    for (const [text, re] of cases) {
      const expected = [...text.matchAll(re)].map((m) => [m.index, ...m])
      expect(withoutMatchAll(() => regexMatches(text, re).map((m) => [m.index, ...m]))).toEqual(expected)
    }
  })
})
