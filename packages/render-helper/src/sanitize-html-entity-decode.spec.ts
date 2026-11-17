import { sanitizeHtml } from './methods/sanitize-html.method'
import { catchPostImage, renderPostBody } from './index'
import { Entry } from './types'

/**
 * `sanitizeHtml` decodes every attribute value before it validates it, and for
 * a long time it did so with a private decoder that called
 * `String.fromCodePoint` on the raw numeric reference. Any code point above
 * U+10FFFF therefore threw a RangeError out of the sanitizer, which is
 * - the LAST-RESORT pass inside `renderPostBody` (so the recovery path that
 *   exists for malformed HTML threw instead of recovering), and
 * - reached by `catchPostImage`, which every feed card calls per row.
 *
 * The sibling decoder in helper.ts was already hardened (overlong references
 * become U+FFFD, `decodeHTML` is wrapped); the sanitizer's copy was missed.
 * These are the three inputs whose behaviour differs, verified against the
 * published build before the fix:
 *
 *   `<div title="&#x110000;">x</div>`   catchPostImage threw, renderPostBody did not
 *   `<div title="&#1114112;">x</span>`  BOTH threw
 *   `<div title="&#1114112;">x</div>`   neither threw (the entity-placeholder
 *                                       step in markdown-to-html protects the
 *                                       well-formed decimal path)
 *
 * so the specs below use the first two. A spec written on the third would pass
 * without the fix.
 */
const HEX_OVER_MAX = '<div title="&#x110000;">x</div>'
const DEC_OVER_MAX_MALFORMED = '<div title="&#1114112;">x</span>'

// catchPostImage memoises per author/permlink/last_update/size/format, so every
// case needs its own permlink or a cached result hides the throw.
const entry = (body: string, permlink: string): Entry =>
  ({
    author: 'crafted',
    permlink,
    last_update: '2026-09-09T00:00:00',
    body,
    json_metadata: '{}'
  }) as Entry

describe('sanitizeHtml: out-of-range numeric character references', () => {
  it.each([
    ['hex', HEX_OVER_MAX],
    ['malformed decimal', DEC_OVER_MAX_MALFORMED]
  ])('does not throw on a %s reference above U+10FFFF', (_label, html) => {
    expect(() => sanitizeHtml(html)).not.toThrow()
  })

  it('keeps validating the value instead of dying on it', () => {
    // The reference decodes to U+FFFD, so the value no longer starts with
    // https:// and the src is rejected. Before the fix this input did not get
    // as far as a verdict: the decode itself threw.
    expect(sanitizeHtml('<img src="&#x110000;https://x.y/a.png">')).toBe('<img>')
    expect(sanitizeHtml('<img src="&#1114112;https://x.y/a.png">')).toBe('<img>')
    // A reference in the middle of an otherwise fine value leaves the
    // attribute in place (xss drops the reference itself from the output).
    expect(sanitizeHtml('<a title="A&#x110000;B">x</a>')).toBe('<a title="A B">x</a>')
  })

  it('renderPostBody survives the body that breaks its own last-resort pass', () => {
    expect(() =>
      renderPostBody(DEC_OVER_MAX_MALFORMED, false, false, 'ecency.com')
    ).not.toThrow()
  })

  it.each([
    ['hex', HEX_OVER_MAX, 'hex-over-max'],
    ['malformed decimal', DEC_OVER_MAX_MALFORMED, 'dec-over-max-malformed']
  ])('catchPostImage survives a %s reference in the body', (_label, body, permlink) => {
    expect(() => catchPostImage(entry(body, permlink), 600, 500, 'match')).not.toThrow()
    // The blur/LQIP call the feed thumbnail makes alongside it.
    expect(() => catchPostImage(entry(body, `${permlink}-blur`), 0, 0)).not.toThrow()
  })

  it('catchPostImage survives a raw string body (the search-row call shape)', () => {
    expect(() => catchPostImage(HEX_OVER_MAX, 600, 500)).not.toThrow()
    expect(() => catchPostImage(DEC_OVER_MAX_MALFORMED, 600, 500)).not.toThrow()
  })
})

describe('sanitizeHtml: ordinary entities still decode', () => {
  // The decode exists so scheme checks see what a browser would see. These pin
  // that behaviour: a hardened decoder that stopped decoding would let an
  // entity-obfuscated javascript: URL through, and would reject a legitimate
  // entity-encoded https one.
  it('accepts an entity-encoded https URL', () => {
    expect(sanitizeHtml('<img src="&#104;&#116;&#116;&#112;&#115;://x.y/a.png">')).toBe(
      '<img src="https://x.y/a.png">'
    )
    expect(sanitizeHtml('<img src="&#x68;ttps://x.y/a.png">')).toBe(
      '<img src="https://x.y/a.png">'
    )
  })

  // Note these three stay green even with the decode removed entirely: the
  // scheme checks are positive whitelists, so an undecoded value fails them
  // too. They pin the outcome, not the decoder. The two cases above are the
  // ones that actually go red if decoding stops.
  it('still blanks an entity-obfuscated javascript: URL', () => {
    expect(sanitizeHtml('<img src="&#106;avascript:alert(1)">')).toBe('<img>')
    expect(sanitizeHtml('<img src="javascript&#58;alert(1)">')).toBe('<img>')
    expect(sanitizeHtml('<a data-href="&#106;avascript:alert(1)">t</a>')).toBe('<a>t</a>')
  })

  it('keeps zero-padded and named references decoding as before', () => {
    expect(sanitizeHtml('<div id="&#65;bc">x</div>')).toBe('<div id="user-content-Abc">x</div>')
    expect(sanitizeHtml('<div id="&#0065;bc">x</div>')).toBe('<div id="user-content-Abc">x</div>')
    expect(sanitizeHtml('<img src="https://x.y/a.png?a=1&amp;b=2">')).toBe(
      '<img src="https://x.y/a.png?a=1&amp;b=2">'
    )
  })
})
