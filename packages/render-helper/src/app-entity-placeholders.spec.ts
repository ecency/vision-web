import { describe, expect, it } from 'vitest'
import { markdown2Html } from './markdown-2-html'

// The app render (forApp) swaps entities in text for placeholders and puts them
// back afterwards. Both passes ran one split/join per distinct entity over the
// whole body (and, between URLs, per segment): a body of URLs and distinct
// numeric references took seconds. One regex pass each way keeps it linear.
describe('app render entity placeholders stay linear', () => {
  // Measured as growth, not a wall-clock limit: a shared CI runner can take
  // several times as long as a laptop, and a fixed 2 s limit failed there on a
  // render that takes about 0.6 s locally. A body four times longer must take
  // well under six times as long: the linear passes take ~4x, the old per-entity
  // passes ~9x. Timed in CPU time, not wall clock, so other load on the machine
  // does not skew the ratio (process-wide: it relies on vitest's default forks
  // pool, one process per file). One warm-up render per size, then the samples
  // interleave so both minima come from the same load window. The 10 s cap is
  // only a backstop; the ratio is what catches a regression.
  it('many URLs and distinct references', () => {
    const bodyOf = (size: number) => {
      let body = ''
      for (let i = 0; body.length < size; i++) body += `http://a &#${i % 100000}; `
      return body
    }
    const cpuMs = () => {
      const { user, system } = process.cpuUsage()
      return (user + system) / 1000
    }
    const render = (body: string, permlink: string) => {
      const started = cpuMs()
      const html = markdown2Html({ author: 'perf', permlink, last_update: '2026-11-16', body } as never, true)
      const spent = cpuMs() - started
      expect(html).not.toContain('\u200b')
      return spent
    }
    const quarterBody = bodyOf(15_000)
    const fullBody = bodyOf(60_000)
    render(quarterBody, 'entities-quarter-warm')
    render(fullBody, 'entities-full-warm')
    let quarter = Infinity
    let full = Infinity
    for (let run = 0; run < 3; run++) {
      quarter = Math.min(quarter, render(quarterBody, `entities-quarter-${run}`))
      full = Math.min(full, render(fullBody, `entities-full-${run}`))
    }
    expect(full).toBeLessThan(quarter * 6)
    expect(full).toBeLessThan(10_000)
  }, 120_000)

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
