import { decodeEntities, decodeImageSrc } from './helper'
import { catchPostImage } from './catch-post-image'
import { getPostBodySummary } from './post-body-summary'
import { Entry } from './types'

// entities.decodeHTML throws RangeError on a numeric reference with 309+ decimal
// or 256+ hex digits (0 * Infinity = NaN -> String.fromCodePoint(NaN)). Bodies
// and json_metadata are user-authored, so a crafted reference must decode to
// U+FFFD (what he produced) and never throw out of a feed render.
const LONG_DEC = '&#' + '0'.repeat(400) + ';'
const LONG_HEX = '&#x' + '0'.repeat(300) + ';'
const LONG_DEC_NO_SEMI = '&#' + '9'.repeat(320)

describe('decodeEntities', () => {
  it('decodes ordinary references like the previous decoder', () => {
    expect(decodeEntities('a &amp; b &lt;c&gt; &#39;d&#x27; &copy 2020 &notit;')).toBe(
      "a & b <c> 'd' © 2020 ¬it;"
    )
    expect(decodeEntities('https://x.y/?a=1&b=2&amp;c=3')).toBe('https://x.y/?a=1&b=2&c=3')
  })

  it.each([
    ['decimal', LONG_DEC],
    ['hex', LONG_HEX],
    ['decimal without semicolon', LONG_DEC_NO_SEMI]
  ])('replaces an overlong %s reference with U+FFFD instead of throwing', (_label, ref) => {
    expect(() => decodeEntities(ref)).not.toThrow()
    expect(decodeEntities(`x${ref}y`)).toBe('x�y')
  })

  it('still decodes the rest of a string that carries an overlong reference', () => {
    expect(decodeEntities(`&amp;${LONG_DEC}&lt;`)).toBe('&�<')
  })

  it('keeps references padded with leading zeros, however many', () => {
    expect(decodeEntities('&#0065;')).toBe('A')
    expect(decodeEntities('&#' + '0'.repeat(400) + '65;')).toBe('A')
    expect(decodeEntities('&#x' + '0'.repeat(300) + '41;')).toBe('A')
    expect(decodeEntities('&#' + '0'.repeat(400) + ';')).toBe(decodeEntities('&#0;'))
  })
})

describe('overlong numeric references on the real call paths', () => {
  const payload = 'https://x.com/a.png?q=' + LONG_DEC
  const entry = (over: Partial<Entry>, permlink: string): Entry =>
    ({
      author: 'crafted',
      permlink,
      last_update: '2026-08-21T00:00:00',
      body: '',
      json_metadata: '{}',
      ...over
    }) as Entry

  it('decodeImageSrc', () => {
    expect(() => decodeImageSrc(payload)).not.toThrow()
  })

  it('catchPostImage with a metadata image string', () => {
    const e = entry({ json_metadata: { image: payload } }, 'meta-string')
    expect(() => catchPostImage(e, 320, 180, 'match')).not.toThrow()
  })

  it('catchPostImage with a metadata image array', () => {
    const e = entry({ json_metadata: { image: [payload] } }, 'meta-array')
    expect(() => catchPostImage(e, 320, 180, 'match')).not.toThrow()
  })

  it('catchPostImage with the image in the body', () => {
    const e = entry({ body: `<img src="${payload}"> and ![](${payload})` }, 'body-img')
    expect(() => catchPostImage(e, 320, 180, 'match')).not.toThrow()
  })

  it('postBodySummary at the description length and unbounded', () => {
    const e = entry({ body: `<p>${payload}</p>` }, 'summary')
    expect(() => getPostBodySummary(e, 350, 'web')).not.toThrow()
    expect(() => getPostBodySummary(e, 0, 'web')).not.toThrow()
  })
})
