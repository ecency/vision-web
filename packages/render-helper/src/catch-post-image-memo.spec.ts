import { catchPostImage } from './catch-post-image'
import { cacheGet } from './cache'
import { makeEntryCacheKey } from './helper'
import type { Entry } from './types'

// The memo used to miss null: `if (item)` read a cached null as absent and
// re-rendered the markdown on every request. These specs read the cache the
// way catchPostImage does and pin that a null answer is stored, per mode, per
// size, so the expensive tier runs once.
let n = 0
const entry = (body: string): Entry => ({
  author: 'memo',
  permlink: `p-${n++}`,
  last_update: '2019-05-10T09:15:21',
  body,
  json_metadata: {}
})

const key = (e: Entry, w: number, h: number, fast = false): string =>
  `${makeEntryCacheKey(e)}-${w}x${h}-match${fast ? '-fast' : ''}`

describe('catchPostImage memoizes null results', () => {
  it('stores a null answer, distinguishable from no answer at all', () => {
    const e = entry('a long body with no image in it')
    expect(cacheGet<string | null | undefined>(key(e, 0, 0))).toBeUndefined()
    expect(catchPostImage(e, 0, 0, 'match')).toBeNull()
    expect(cacheGet<string | null | undefined>(key(e, 0, 0))).toBeNull()
    expect(catchPostImage(e, 0, 0, 'match')).toBeNull()
  })

  it('keys the memo on size and format, as before', () => {
    const e = entry('another body with no image')
    catchPostImage(e, 0, 0, 'match')
    expect(cacheGet<string | null | undefined>(key(e, 0, 0))).toBeNull()
    expect(cacheGet<string | null | undefined>(key(e, 600, 500))).toBeUndefined()
    catchPostImage(e, 600, 500, 'match')
    expect(cacheGet<string | null | undefined>(key(e, 600, 500))).toBeNull()
  })

  it('keeps fast and full answers in separate slots', () => {
    const e = entry('a body with no image, looked up in fast mode')
    expect(catchPostImage(e, 0, 0, 'match', { fast: true })).toBeNull()
    expect(cacheGet<string | null | undefined>(key(e, 0, 0, true))).toBeNull()
    // The full tier never ran: its slot is still empty.
    expect(cacheGet<string | null | undefined>(key(e, 0, 0))).toBeUndefined()
  })
})
