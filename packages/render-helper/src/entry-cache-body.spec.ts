import { markdown2Html } from './markdown-2-html'
import { catchPostImage } from './catch-post-image'
import { getPostBodySummary } from './post-body-summary'
import { makeEntryCacheKey } from './helper'
import type { Entry } from './types'

// A takedown (filterDmcaEntry in @ecency/sdk) replaces the body and blanks
// json_metadata but leaves author, permlink and last_update alone. The memo is
// process global, so whatever rendered the entry first, before the lists were
// in force or from a surface that does not filter, must not answer for the
// filtered entry that arrives later with the same metadata (#1872).
const TAKEDOWN = 'This post is not available due to a copyright/fraudulent claim.'

let n = 0
const pair = (): [Entry, Entry] => {
  const meta = { author: 'memo-body', permlink: `p-${n++}`, last_update: '2024-01-15T12:00:00' }
  return [
    {
      ...meta,
      body: 'Original words here.\n\n![cover](https://images.ecency.com/original-cover.jpg)',
      json_metadata: {}
    },
    { ...meta, body: TAKEDOWN, json_metadata: {} }
  ]
}

describe('entry memo keys on the body', () => {
  it('markdown2Html does not serve the pre-takedown HTML', () => {
    const [original, filtered] = pair()
    expect(markdown2Html(original, false)).toContain('Original words')

    const html = markdown2Html(filtered, false)
    expect(html).toContain('not available')
    expect(html).not.toContain('Original words')
  })

  it('catchPostImage does not serve the pre-takedown cover', () => {
    const [original, filtered] = pair()
    expect(catchPostImage(original, 600, 500)).toBeTruthy()

    expect(catchPostImage(filtered, 600, 500)).toBeNull()
  })

  it('getPostBodySummary does not serve the pre-takedown summary', () => {
    const [original, filtered] = pair()
    expect(getPostBodySummary(original)).toContain('Original words')

    const summary = getPostBodySummary(filtered)
    expect(summary).toContain('not available')
    expect(summary).not.toContain('Original words')
  })
})

// The key carries a 32-bit FNV-1a digest of the body, which an author can
// collide on purpose. Builds a body of the notice's length that starts with an
// image and forces the digest onto the notice's with the last two characters
// (FNV steps are invertible, so the second character is solved, not searched).
const FNV_PRIME = 0x01000193
let inv = FNV_PRIME
for (let i = 0; i < 5; i++) inv = Math.imul(inv, 2 - Math.imul(FNV_PRIME, inv))
const fnvState = (s: string): number => {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, FNV_PRIME)
  }
  return h >>> 0
}
const isSurrogate = (c: number) => c >= 0xd800 && c <= 0xdfff
const collideWith = (target: string, prefix: string): string => {
  const need = Math.imul(fnvState(target), inv) >>> 0
  for (let fill = 0x61; fill < 0x7b; fill++) {
    const head = prefix.padEnd(target.length - 2, String.fromCharCode(fill))
    const h0 = fnvState(head)
    for (let c1 = 0; c1 < 0x10000; c1++) {
      const c2 = (need ^ (Math.imul(h0 ^ c1, FNV_PRIME) >>> 0)) >>> 0
      if (c2 < 0x10000 && !isSurrogate(c1) && !isSurrogate(c2)) {
        return head + String.fromCharCode(c1, c2)
      }
    }
  }
  throw new Error('no collision found')
}

describe('entry memo verifies its inputs on a hit', () => {
  it('a body crafted to collide with the notice does not answer for the notice', () => {
    const crafted = collideWith(TAKEDOWN, '![c](https://images.ecency.com/crafted.jpg) Crafted ')
    const meta = { author: 'memo-body', permlink: `p-${n++}`, last_update: '2024-01-15T12:00:00' }
    const original: Entry = { ...meta, body: crafted, json_metadata: {} }
    const filtered: Entry = { ...meta, body: TAKEDOWN, json_metadata: {} }
    // A real collision, or this spec proves nothing.
    expect(makeEntryCacheKey(original)).toBe(makeEntryCacheKey(filtered))

    expect(markdown2Html(original, false)).toContain('Crafted')
    expect(catchPostImage(original, 600, 500)).toBeTruthy()
    expect(getPostBodySummary(original)).toContain('Crafted')

    expect(markdown2Html(filtered, false)).not.toContain('Crafted')
    expect(catchPostImage(filtered, 600, 500)).toBeNull()
    expect(getPostBodySummary(filtered)).not.toContain('Crafted')
  })

  it.each([
    ['image', { image: ['https://images.ecency.com/meta-cover.jpg'] }],
    ['thumbnails', { thumbnails: ['https://images.ecency.com/meta-thumb.jpg'] }]
  ])('a body already equal to the notice does not keep its metadata %s', (_field, jsonMetadata) => {
    const meta = { author: 'memo-body', permlink: `p-${n++}`, last_update: '2024-01-15T12:00:00' }
    const original: Entry = { ...meta, body: TAKEDOWN, json_metadata: jsonMetadata }
    const filtered: Entry = { ...meta, body: TAKEDOWN, json_metadata: {} }

    expect(catchPostImage(original, 600, 500)).toBeTruthy()
    expect(catchPostImage(filtered, 600, 500)).toBeNull()
  })
})
