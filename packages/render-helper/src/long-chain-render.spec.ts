import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { markdown2Html } from './markdown-2-html'
import { MAX_TRAVERSE_DEPTH } from './methods/traverse.method'

// #1920: long hashtag / mention chains used to cost O(n^2). Each adjacent tag
// was linkified in its own pass with the rest of the text pushed into a new
// nested node, and every mention placeholder was restored with its own scan of
// the whole string. A few thousand levels then ran out of stack and the body
// fell back to sanitize-only output after seconds of CPU.
//
// The checks measure growth, not wall-clock time: CI runners differ by 5x or
// more in speed, so a fixed budget fails a slow runner with nothing wrong.
// Rendering an eighth of a body and then the whole of it costs about 8x on
// the linear path and 64x on the quadratic one; GROWTH_LIMIT sits between.
const GROWTH_LIMIT = 20

const countLinks = (html: string, cls: string) =>
  (html.match(new RegExp(`<a class="${cls}`, 'g')) || []).length

function timed(body: string, forApp = false): { html: string; ms: number } {
  const t0 = performance.now()
  const html = markdown2Html(body, forApp)
  return { html, ms: performance.now() - t0 }
}

/**
 * Render `make(n / 8)` and `make(n)` (the faster of two runs each, after a
 * warm-up) and return the larger render's HTML with the time ratio. Each run
 * gets its own trailing word, as markdown2Html caches a body it has seen.
 */
let run = 0
function growth(make: (n: number) => string, n: number, forApp = false): { html: string; ratio: number } {
  const fresh = (size: number) => `${make(size)}\n\nrun${++run}`
  markdown2Html(fresh(Math.max(1, Math.floor(n / 16))), forApp) // warm-up
  const best = (size: number) => {
    const a = timed(fresh(size), forApp)
    const b = timed(fresh(size), forApp)
    return { html: b.html, ms: Math.max(Math.min(a.ms, b.ms), 1) }
  }
  const small = best(Math.floor(n / 8))
  const big = best(n)
  return { html: big.html, ratio: big.ms / small.ms }
}

describe('long tag and mention chains (#1920)', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>
  beforeEach(() => {
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
  })
  afterEach(() => warnSpy.mockRestore())

  it('links every tag in a 6000-tag adjacent chain without falling back', () => {
    const { html, ratio } = growth((n) => Array.from({ length: n }, (_, i) => `#tag${i}`).join(''), 6000)
    expect(countLinks(html, 'er-tag er-tag-link')).toBe(6000)
    expect(ratio).toBeLessThan(GROWTH_LIMIT)
  })

  it('links every mention in a 6000-mention adjacent chain without falling back', () => {
    const { html, ratio } = growth((n) => Array.from({ length: n }, (_, i) => `@user${i}`).join(''), 6000)
    expect(countLinks(html, 'er-author er-author-link')).toBe(6000)
    expect(ratio).toBeLessThan(GROWTH_LIMIT)
  })

  it('links every mention in a 6000-mention space separated chain', () => {
    const { html, ratio } = growth((n) => Array.from({ length: n }, (_, i) => `@user${i}`).join(' '), 6000)
    expect(countLinks(html, 'er-author er-author-link')).toBe(6000)
    expect(ratio).toBeLessThan(GROWTH_LIMIT)
  })

  it('links adjacent app-mode tags and mentions the same way', () => {
    const make = (n: number) =>
      Array.from({ length: n }, (_, i) => `#tag${i}`).join('') + ' ' +
      Array.from({ length: n }, (_, i) => `@user${i}`).join('')
    const { html, ratio } = growth(make, 3000, true)
    expect(countLinks(html, 'markdown-tag-link')).toBe(3000)
    expect(countLinks(html, 'markdown-author-link')).toBe(3000)
    expect(ratio).toBeLessThan(GROWTH_LIMIT)
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

  it('links every item of a 3000-pair alternating tag/mention chain', () => {
    const { html, ratio } = growth((n) => Array.from({ length: n }, (_, i) => `#t${i}x@user${i}`).join(''), 3000)
    expect(countLinks(html, 'er-tag er-tag-link')).toBe(3000)
    expect(countLinks(html, 'er-author er-author-link')).toBe(3000)
    expect(ratio).toBeLessThan(GROWTH_LIMIT)
  })

  it('keeps transforming the rest of a body nested past the depth cap', () => {
    // Past the cap the deep subtree is reduced to its text. Nothing in it may
    // ship untransformed, and everything above it is still rendered normally.
    const n = MAX_TRAVERSE_DEPTH + 20
    const deep = '<div>'.repeat(n) + 'deep text <img src="https://evil.example/t.png">' +
      '<a href="https://evil.example/x" target="_blank" rel="opener">l</a>' + '</div>'.repeat(n)
    const { html } = timed(`@alice https://i.imgur.com/a.png\n\n${deep}`)
    expect(html).not.toContain('evil.example')
    expect(html).not.toContain('rel="opener"')
    expect(html).toContain('deep text')
    expect(countLinks(html, 'er-author er-author-link')).toBe(1)
    expect(html).toMatch(/<img [^>]*src="https:\/\/i\.ecency\.com\/p\//)
  })

  it('reaches the cap on a text node or an element at any offset without falling back', () => {
    // traverse() also visits text nodes; the cap must not throw on one.
    for (let n = MAX_TRAVERSE_DEPTH - 3; n <= MAX_TRAVERSE_DEPTH + 3; n++) {
      const html = markdown2Html('@alice ' + '<div>'.repeat(n) + 'leaf @bob' + '</div>'.repeat(n), false)
      expect(html).toMatch(/^<p dir="auto">/) // transformed, not the sanitize-only fallback
      expect(html).toContain('href="/@alice"')
      expect(html).toContain('leaf')
    }
  })

  for (const open of ['<center>', '<div class="text-justify">', '<span>', '<b>']) {
    it(`keeps every link in 600 lines of unclosed ${open}`, () => {
      // Hundreds of unclosed tags nest one or two levels per line. Develop
      // rendered these fully; they must stay well inside the cap.
      const make = (n: number) =>
        Array.from({ length: n }, (_, i) => `${open}line ${i} @user${i}`).join('\n\n') +
        '\n\n<img src="https://evil.example/t.png">'
      const { html, ratio } = growth(make, 600)
      expect(countLinks(html, 'er-author er-author-link')).toBe(600)
      expect(html).not.toContain('src="https://evil.example')
      expect(ratio).toBeLessThan(GROWTH_LIMIT)
    })
  }

  it('restores a mention placed right after a typed placeholder look-alike (review r5)', () => {
    const out = markdown2Html('x ‌5‌@alice y', false)
    expect(out).toContain('href="/@alice"')
  })

  for (const c of ['$', '!', '#', '%', '&', '*', '@']) {
    it(`does not double a "${c}" before a mention (review r5)`, () => {
      const esc = c === '&' ? '&amp;' : c
      const out = markdown2Html(`x ${c}@alice y`, false)
      expect(out).toContain(`x ${esc}<a class="er-author er-author-link"`)
    })
  }
})
