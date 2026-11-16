import { describe, expect, it } from 'vitest'
import { markdown2Html } from './markdown-2-html'
import { removeDuplicateAttributes } from './helper'

// A body of tag openers with no `>` after them used to be rescanned to the end
// from every `<`: quadratic, 100 KB took about 15 s on the main render path.
describe('unterminated tags render in linear time', () => {
  it.each([
    ['<a b ', '<div>\n' + '<a b '.repeat(40000)],
    ['<a href="', '<a href="'.repeat(20000)]
  ])('%s repeated', (_name, body) => {
    const started = performance.now()
    markdown2Html({ author: 'x', permlink: `unterminated-${body.length}`, last_update: '2026-11-16', body } as never)
    expect(performance.now() - started).toBeLessThan(3000)
  })

  it('copies what follows the last > as written', () => {
    expect(removeDuplicateAttributes('<p a="1" a="2">x</p><a b c="')).toBe('<p a="1">x</p><a b c="')
  })
})
