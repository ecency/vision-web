import { vi } from 'vitest'

// Counted stand-in for the markdown tier. Returning an image-free document
// makes every lookup land on the null branch, which is the case the memo used
// to miss: `if (item)` treated a cached null as a miss and re-rendered.
const render = vi.fn(() => '<p>nothing to see</p>')
vi.mock('./markdown-2-html', () => ({ markdown2Html: (...args: unknown[]) => render(...args) }))

import { catchPostImage } from './catch-post-image'

let n = 0
const entry = (body: string) => ({
  author: 'memo',
  permlink: `p-${n++}`,
  last_update: '2019-05-10T09:15:21',
  body,
  json_metadata: {}
}) as any

describe('catchPostImage memoizes null results', () => {
  beforeEach(() => render.mockClear())

  it('renders markdown once for a body with no image, not once per call', () => {
    const e = entry('a long body with no image in it')
    expect(catchPostImage(e, 0, 0, 'match')).toBeNull()
    expect(catchPostImage(e, 0, 0, 'match')).toBeNull()
    expect(catchPostImage(e, 0, 0, 'match')).toBeNull()
    expect(render).toHaveBeenCalledTimes(1)
  })

  it('keys the memo on size and format, as before', () => {
    const e = entry('another body with no image')
    catchPostImage(e, 0, 0, 'match')
    catchPostImage(e, 600, 500, 'match')
    catchPostImage(e, 600, 500, 'match')
    expect(render).toHaveBeenCalledTimes(2)
  })

  it('never renders markdown in fast mode', () => {
    const e = entry('a body with no image, looked up in fast mode')
    expect(catchPostImage(e, 0, 0, 'match', { fast: true })).toBeNull()
    expect(catchPostImage(e, 600, 500, 'match', { fast: true })).toBeNull()
    expect(catchPostImage(e.body, 0, 0, 'match', { fast: true })).toBeNull()
    expect(render).not.toHaveBeenCalled()
  })
})
