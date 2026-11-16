import { describe, expect, it } from 'vitest'
import { markdown2Html } from './markdown-2-html'

// The app render (forApp) swaps entities in text for placeholders and puts them
// back afterwards. Both passes ran one split/join per distinct entity over the
// whole body (and, between URLs, per segment): a body of URLs and distinct
// numeric references took seconds. One regex pass each way keeps it linear.
describe('app render entity placeholders stay linear', () => {
  it('many URLs and distinct references', () => {
    let body = ''
    for (let i = 0; body.length < 60_000; i++) body += `http://a &#${i % 100000}; `
    const started = performance.now()
    const html = markdown2Html({ author: 'perf', permlink: 'entities', last_update: '2026-11-16', body } as never, true)
    expect(performance.now() - started).toBeLessThan(2000)
    expect(html).not.toContain('​')
  })

  // A zero-width space the author wrote, followed by digits, sits right before
  // a placeholder: the restore must not let it swallow the placeholder's own
  // opening zero-width space, and placeholder-like text it does not own (an
  // index out of range, a leading zero) stays as written.
  it.each([
    ['In ​2024&nbsp;we', 'In ​2024&nbsp;we'],
    ['x​7&copy; y', 'x​7&copy; y'],
    ['​1&amp;', '​1&amp;'],
    ['&amp; ​00​ and ​01​', '&amp; ​00​ and ​01​'],
    ['&amp; ​5​', '&amp; ​5​']
  ])('keeps author zero-width text as written: %j', (body, expected) => {
    const html = markdown2Html({ author: 'perf', permlink: `zw-${body.length}-${body.charCodeAt(1)}`, last_update: '2026-11-16', body } as never, true)
    expect(html).toContain(expected)
  })

  it('still restores every entity in text as written', () => {
    const html = markdown2Html(
      { author: 'perf', permlink: 'restore', last_update: '2026-11-16', body: 'A &amp; B &copy; C &#169; D &#xA9; E &AMP; F' } as never,
      true
    )
    expect(html).toContain('A &amp; B &copy; C &#169; D &#xA9; E &AMP; F')
  })
})
