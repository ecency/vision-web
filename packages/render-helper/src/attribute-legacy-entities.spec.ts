import { describe, expect, it } from 'vitest'
import { markdown2Html } from './markdown-2-html'
import { removeDuplicateAttributes } from './helper'
import { proxifyImageSrc } from './proxify-image-src'

// #2085: raw-HTML attribute values lost legacy entity names on the main render
// path. xmldom decodes `&times` (with or without `;`) even before `=`, which a
// browser never does in an attribute, so a Twitch embed's `&times=1` became
// `×=1`. Values are now given to xmldom with only explicit references.
let n = 0
const render = (body: string) =>
  markdown2Html({ author: 'legacy', permlink: `entities-${n++}`, last_update: '2026-11-16T00:00:00', body })

// What a browser reads back from an attribute in the rendered HTML.
const attr = (html: string, name: string): string => {
  const m = new RegExp(`\\s${name}="([^"]*)"`).exec(html)
  expect(m, `${name} in ${html}`).not.toBeNull()
  return m![1].replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
}

describe('legacy entity names in raw-HTML attributes (#2085)', () => {
  it('keeps &times=1 in a Twitch iframe src', () => {
    const html = render('<iframe src="https://player.twitch.tv/?video=1&times=1&parent=ecency.com"></iframe>')
    expect(html).not.toContain('×')
    expect(attr(html, 'src')).toContain('video=1&times=1')
  })

  it.each([
    ['a href', '<a href="https://example.com/?a=1&notin=2&lt=3&nbsp=4&sol">link</a>', 'data-href', 'a=1&notin=2&lt=3&nbsp=4&sol'],
    ['video src', '<video controls src="https://example.com/v.mp4?x=1&copy=2&reg=3"></video>', 'src', 'x=1&copy=2&reg=3']
  ])('keeps bare legacy names in a %s', (_name, body, name, query) => {
    expect(attr(render(body), name)).toContain(query)
  })

  it('still decodes explicit references', () => {
    expect(attr(render('<a href="https://example.com/?a=1&amp;b=2&#38;c=3">x</a>'), 'data-href')).toContain('a=1&b=2&c=3')
  })

  // The image is proxied as the URL the post names, `&times=2` kept as written
  // (#2092: the image path used to decode it a second time into `×=2`).
  it('proxies an <img> as the URL the post names', () => {
    const expected = proxifyImageSrc('https://example.com/i.png?x=1&times=2', 0, 0, 'match', { forceProxy: true })
    expect(render('<img src="https://example.com/i.png?x=1&times=2">')).toContain(expected.replace(/&/g, '&amp;'))
  })

  // xmldom turns a literal tab or newline in an attribute into a space, but keeps
  // one that arrives as a reference, so a reference must stay a reference.
  it('keeps tab, line feed and carriage return references as references', () => {
    expect(removeDuplicateAttributes('<img src="a?b&#10;c&#9;d&#13;&times">')).toBe(
      '<img src="a?b&#10;c&#9;d&#13;×">'
    )
  })

  // A LITERAL tab or newline is attribute whitespace: xmldom reads it as a
  // space, and a hand-written href with a trailing newline must stay the
  // internal link it was, not flip to an external one.
  it('treats literal tab, line feed and carriage return as spaces', () => {
    expect(removeDuplicateAttributes('<a href="/@alice/post\n" title="a\tb&times">x</a>')).toBe(
      '<a href="/@alice/post " title="a b×">x</a>'
    )
    for (const href of ['https://ecency.com/@alice/post\n', '/@alice/post\n', 'https://ecency.com/hive-125125/@alice/post\r\n']) {
      expect(render(`<a href="${href}">x</a>`)).toContain('markdown-post-link')
    }
  })

  it('rewrites a value only as far as its references go', () => {
    expect(removeDuplicateAttributes('<p class="a b" title="x &amp; y">t</p>')).toBe(
      '<p class="a b" title="x &amp; y">t</p>'
    )
    expect(removeDuplicateAttributes('<a href="?a&times=1">t</a>')).toBe('<a href="?a&amp;times=1">t</a>')
  })
})
