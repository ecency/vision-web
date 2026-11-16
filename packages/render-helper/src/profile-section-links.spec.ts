import { describe, expect, it } from 'vitest'
import { markdown2Html } from './markdown-2-html'
import { SECTION_LIST } from './consts'

// Profile sections are reserved names: `/@alice/notifications` and
// `/@alice/insights` are pages, not posts, so a link to one is not rendered as
// a post link (and the composer never mints a post with that permlink).
describe('profile section links', () => {
  it.each(['notifications', 'insights'])('%s is a reserved section', (section) => {
    expect(SECTION_LIST).toContain(section)
  })

  it.each(['notifications', 'insights'])('/@alice/%s is not a post link', (section) => {
    const html = markdown2Html({ author: 's', permlink: `s-${section}`, last_update: '2026', body: `see /@alice/${section} now` } as never, true)
    expect(html).not.toContain(`data-permlink="${section}"`)
  })
})
