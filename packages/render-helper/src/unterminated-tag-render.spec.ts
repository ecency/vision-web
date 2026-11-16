import { describe, expect, it } from 'vitest'
import { markdown2Html } from './markdown-2-html'
import { removeDuplicateAttributes } from './helper'

// A body of tag openers with no `>` after them used to be rescanned to the end
// from every `<`: quadratic, 100 KB took about 15 s on the main render path.
describe('unterminated tags render in linear time', () => {
  it.each([
    ['<a b ', '<div>\n' + '<a b '.repeat(40000)],
    ['<a href="', '<a href="'.repeat(20000)],
    // One `>` inside a quoted value at the end: no tag ever closes.
    ['<a b  then a quoted >', '<div>\n' + '<a b '.repeat(20000) + 'c=">"'],
    ["<a b  then a single-quoted >", '<div>\n' + '<a b '.repeat(20000) + "c='>'"],
    ['<a b="x"  then a quoted >', '<div>\n' + '<a b="x" '.repeat(11111) + 'c=">"']
  ])('%s repeated', (_name, body) => {
    const started = performance.now()
    markdown2Html({ author: 'x', permlink: `unterminated-${body.length}`, last_update: '2026-11-16', body } as never)
    expect(performance.now() - started).toBeLessThan(3000)
  })

  // Past the scan budget the rest of the body is left as written; a tag that
  // closed before the trip point is still normalised.
  it('leaves the rest as written once the scan budget is spent', () => {
    const tail = '<a b '.repeat(20000) + 'c=">"'
    expect(removeDuplicateAttributes(tail)).toBe(tail)
    expect(removeDuplicateAttributes('<p a="1" a="2">x</p>' + tail)).toBe('<p a="1">x</p>' + tail)
  })

  it('copies what follows the last > as written', () => {
    expect(removeDuplicateAttributes('<p a="1" a="2">x</p><a b c="')).toBe('<p a="1">x</p><a b c="')
  })
})
