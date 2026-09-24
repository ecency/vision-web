import { markdown2Html } from './markdown-2-html'
import { catchPostImage } from './catch-post-image'
import { getPostBodySummary } from './post-body-summary'
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
