import { describe, expect, it } from 'vitest'
import { markdown2Html } from './markdown-2-html'

// #2107: a() accepts tel: and web+ schemes as safe, but its "prepend https when
// there is no scheme" rule only knew mailto/hive/steem/esteem/ecency/http(s),
// so those links rendered as dead `https://tel:...` / `https://web+...` links.
const cases: Array<[string, string]> = [
  ['[call](tel:+15551234567)', 'tel:+15551234567'],
  ['<a href="tel:+15551234567">call</a>', 'tel:+15551234567'],
  ['[call](TEL:+15551234567)', 'TEL:+15551234567'],
  ['[open](web+foo:bar)', 'web+foo:bar'],
  ['<a href="web+coin:abc">open</a>', 'web+coin:abc']
]

describe('accepted non-http schemes are rendered as written (#2107)', () => {
  it.each(cases)('web: %s', (body, href) => {
    const html = markdown2Html(body, false, false)
    expect(html).toContain(`href="${href}"`)
    expect(html).not.toContain('https://tel:')
    expect(html).not.toContain('https://web+')
  })

  it.each(cases)('app: %s', (body, href) => {
    const html = markdown2Html(body, true, false)
    expect(html).toContain(`data-href="${href}"`)
    expect(html).not.toContain('https://tel:')
    expect(html).not.toContain('https://web+')
  })

  it('keeps the external-link policy on a tel: link (web)', () => {
    const html = markdown2Html('[call](tel:+15551234567)', false, false)
    expect(html).toContain('class="markdown-external-link"')
    expect(html).toContain('rel="nofollow ugc noopener"')
  })

  it('still prepends https to a scheme-less host that merely starts with tel or web', () => {
    const html = markdown2Html('<a href="telegram.org/x">t</a> <a href="webplus.example/y">w</a>', false, false)
    expect(html).toContain('href="https://telegram.org/x"')
    expect(html).toContain('href="https://webplus.example/y"')
  })
})
