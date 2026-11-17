import { describe, expect, it } from 'vitest'
import { markdown2Html } from './markdown-2-html'
import { simpleMarkdownToHTML } from './methods'

// Author-written class and id attributes. A post body is shown inside the
// app's own page, so an author's class may only name the formatting classes
// posts are written with, and an author's id may never equal one the page
// itself uses.
let n = 0
const render = (body: string, forApp = false) =>
  markdown2Html({ author: 'attrs', permlink: `a${n++}`, last_update: '2026-11-17', body } as never, forApp)
const classesOf = (html: string) => [...html.matchAll(/class="([^"]*)"/g)].flatMap((m) => m[1].split(/\s+/))

describe('author class attributes', () => {
  it.each([false, true])('keeps no app utility class (forApp %s)', (forApp) => {
    const html = render(
      'hello\n\n<div class="fixed inset-0 z-[1100] flex bg-white">x <a href="https://e.com/">y</a></div>\n\n<span class="hidden">z</span>',
      forApp
    )
    for (const cls of ['fixed', 'inset-0', 'z-[1100]', 'flex', 'bg-white', 'hidden']) {
      expect(classesOf(html)).not.toContain(cls)
    }
    expect(html).toContain('x ')
  })

  it.each([
    'text-justify',
    'text-center',
    'text-right',
    'text-rtl',
    'pull-left',
    'pull-right',
    'phishy',
    'videoWrapper',
    'ecency-text-color-dc2626',
    'twitter-tweet'
  ])('keeps the post formatting class %s', (cls) => {
    expect(classesOf(render(`<div class="${cls} fixed">text</div>`))).toEqual(expect.arrayContaining([cls]))
    expect(classesOf(render(`<div class="${cls} fixed">text</div>`))).not.toContain('fixed')
  })

  it('keeps what the markdown stage writes: code language, highlighting, footnotes', () => {
    const html = render('```js\nconst a = 1\n```\n\nText[^1]\n\n[^1]: note')
    expect(classesOf(html)).toEqual(expect.arrayContaining(['ll-key']))
  })

  it('applies to the sanitize-only path and to simple markdown (chat, paste) too', () => {
    expect(classesOf(simpleMarkdownToHTML('<div class="fixed inset-0 text-center">x</div>'))).toEqual(['text-center'])
  })

  it('still drops a class written with a character reference', () => {
    expect(classesOf(render('<div class="text-center&#32;fixed">x</div>'))).not.toContain('fixed')
  })
})

describe('author id attributes', () => {
  it.each([false, true])('never equals an id the page uses (forApp %s)', (forApp) => {
    const html = render(
      '<div id="modal-dialog-container"></div>\n\n<div id="popper-container">x</div>\n\n<span id="nws">q</span>',
      forApp
    )
    expect(html).not.toMatch(/id="(modal-dialog-container|popper-container|nws)"/)
    expect(html).toContain('id="user-content-modal-dialog-container"')
  })

  it('keeps in-post links working: a #fragment link follows its namespaced id', () => {
    const html = render('<div id="sec">x</div>\n\n[go](#sec)')
    expect(html).toContain('id="user-content-sec"')
    expect(html).toContain('href="#user-content-sec"')
  })

  it('namespaces a footnote reference and the link back to it', () => {
    const html = render('Text[^1]\n\n[^1]: note')
    expect(html).toContain('id="user-content-fnref1"')
    expect(html).toContain('href="#user-content-fnref1"')
    expect(html).not.toMatch(/id="fn/)
  })

  it('leaves a link to a data-id anchor as written (the web scrolls to it by script)', () => {
    const html = render('[What is HIVE](#WhatHive)\n\n<a data-id="WhatHive"></a>What is HIVE?')
    expect(html).toContain('href="#WhatHive"')
  })

  it('rewrites the app render\'s data-href fragment the same way', () => {
    const html = render('<div id="sec">x</div>\n\n[go](#sec)', true)
    expect(html).toContain('id="user-content-sec"')
    expect(html).toContain('data-href="#user-content-sec"')
  })

  it('does not namespace twice', () => {
    const html = render('<div id="user-content-x">x</div>\n\n[go](#user-content-x)')
    expect(html).toContain('id="user-content-x"')
    expect(html).toContain('href="#user-content-x"')
  })

  it('applies to simple markdown too', () => {
    expect(simpleMarkdownToHTML('<div id="nws">x</div>')).toContain('id="user-content-nws"')
  })
})

describe('a protocol-relative link with an invalid permlink', () => {
  it.each([
    '[x](//evil.example/@alice/Some_Page)',
    '<a href="/\\evil.example/@alice/X_y" target="_blank">x</a>',
    '[x](//evil.example/@alice/wallet/A_B)'
  ])('%s is an external link with the link policy', (body) => {
    const html = render(body)
    expect(html).toContain('rel="nofollow ugc noopener"')
    expect(html).not.toMatch(/markdown-(post|profile)-link/)
  })

  it.each([
    '[x](/&#47;evil.example/@alice/X_y)',
    '<a href="/&sol;evil.example/@alice/X_y">x</a>',
    '[x](/&#92;evil.example/@alice/X_y)'
  ])('%s is not an internal link in the app render either', (body) => {
    expect(render(body, true)).not.toMatch(/markdown-(post|profile)-link/)
    expect(render(body, false)).not.toMatch(/markdown-(post|profile)-link/)
  })

  it.each([
    '[x](/hive-125125/@alice/my-post?a=1&amp;b=2)',
    '[x](/ecency/@alice/my-post?ref=bob&amp;x=1)',
    '<a href="/hive-1/@alice/my-post#c&amp;z">x</a>'
  ])('%s stays an in-app post link in the app render (an entity only in the query or fragment)', (body) => {
    expect(render(body, true)).toContain('markdown-post-link')
  })

  it('a valid in-site post link is still internal', () => {
    expect(render('[x](/@alice/valid-permlink)')).toContain('markdown-post-link')
  })
})
