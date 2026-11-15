import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { markdown2Html } from './markdown-2-html'

// #1920: long hashtag / mention chains used to cost O(n^2). Each adjacent tag
// was linkified in its own pass with the rest of the text pushed into a new
// nested node, and every mention placeholder was restored with its own scan of
// the whole string. A few thousand levels then ran out of stack and the body
// fell back to sanitize-only output after seconds of CPU.
//
// The bounds below are deliberately generous (a fixed render takes a small
// fraction of them); they only catch the quadratic path coming back.
const BUDGET_MS = 2500

const countLinks = (html: string, cls: string) =>
  (html.match(new RegExp(`<a class="${cls}`, 'g')) || []).length

function timed(body: string, forApp = false): { html: string; ms: number } {
  const t0 = performance.now()
  const html = markdown2Html(body, forApp)
  return { html, ms: performance.now() - t0 }
}

describe('long tag and mention chains (#1920)', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>
  beforeEach(() => {
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
  })
  afterEach(() => warnSpy.mockRestore())

  it('links every tag in a 6000-tag adjacent chain without falling back', () => {
    const body = Array.from({ length: 6000 }, (_, i) => `#tag${i}`).join('')
    const { html, ms } = timed(body)
    expect(countLinks(html, 'er-tag er-tag-link')).toBe(6000)
    expect(ms).toBeLessThan(BUDGET_MS)
  })

  it('links every mention in a 6000-mention adjacent chain without falling back', () => {
    const body = Array.from({ length: 6000 }, (_, i) => `@user${i}`).join('')
    const { html, ms } = timed(body)
    expect(countLinks(html, 'er-author er-author-link')).toBe(6000)
    expect(ms).toBeLessThan(BUDGET_MS)
  })

  it('links every mention in a 6000-mention space separated chain', () => {
    const body = Array.from({ length: 6000 }, (_, i) => `@user${i}`).join(' ')
    const { html, ms } = timed(body)
    expect(countLinks(html, 'er-author er-author-link')).toBe(6000)
    expect(ms).toBeLessThan(BUDGET_MS)
  })

  it('links adjacent app-mode tags and mentions the same way', () => {
    const body = Array.from({ length: 3000 }, (_, i) => `#tag${i}`).join('') + ' ' +
      Array.from({ length: 3000 }, (_, i) => `@user${i}`).join('')
    const { html, ms } = timed(body, true)
    expect(countLinks(html, 'markdown-tag-link')).toBe(3000)
    expect(countLinks(html, 'markdown-author-link')).toBe(3000)
    expect(ms).toBeLessThan(BUDGET_MS)
  })

  it('keeps the existing stop rules inside a run', () => {
    // A numbers-only tag is never linked and ends the run, as before.
    expect(markdown2Html('#ab#cd#12#ef', false)).toBe(
      '<p dir="auto"><span><a class="er-tag er-tag-link" href="/trending/ab">#ab</a>' +
        '<a class="er-tag er-tag-link" href="/trending/cd">#cd</a>#12#ef</span></p>'
    )
    // A mention right after a tag run is still linked.
    expect(markdown2Html('#ab#cd@alice', true)).toContain(
      '<a class="markdown-author-link" data-author="alice">@alice</a>'
    )
  })

  it('takes the sanitize-only fallback early once nesting passes the depth cap', () => {
    // Alternating tag/mention pairs still nest one level per pair. Past the
    // explicit depth cap the render must give up quickly instead of walking
    // thousands of levels down to the engine's stack limit.
    const body = Array.from({ length: 6000 }, (_, i) => `#t${i}x@user${i}`).join('')
    const { html, ms } = timed(body)
    expect(html).not.toContain('<a ')
    expect(html).toContain('#t0x@user0')
    expect(ms).toBeLessThan(BUDGET_MS)
  })
})
