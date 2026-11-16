import { describe, expect, it, vi } from 'vitest'

// Both DOM passes fail -> markdownToHTML sanitizes the Remarkable output with
// no DOM transform at all. Force that path and check what it EMITS (#1919,
// #1920 review): nothing an img()/a()/iframe() transform would have fixed may
// ship raw.
vi.mock('./methods/traverse.method', () => ({
  traverse: () => {
    throw new Error('forced fallback')
  },
  MAX_TRAVERSE_DEPTH: 500,
}))

import { markdown2Html } from './markdown-2-html'
import { getProxyBase } from './proxify-image-src'

const render = (body: string, forApp = false) => markdown2Html(body, forApp)

describe('untransformed sanitize-only fallback output', () => {
  it('serves images through the proxy only', () => {
    const out = render('<img src="https://evil.example/t.png" srcset="https://evil.example/a.png 1x, https://evil.example/b.png 2x">')
    expect(out).not.toContain('evil.example')
    const src = out.match(/<img [^>]*src="([^"]*)"/)
    expect(src).not.toBeNull()
    expect(src![1].startsWith(`${getProxyBase()}/`)).toBe(true)
  })

  it('drops author target and rel', () => {
    const out = render('<a href="https://evil.example/x" target="_blank" rel="opener">l</a>')
    expect(out).not.toContain('rel="opener"')
    expect(out).not.toContain('target=')
    // ...and applies the external-link policy a() would have.
    expect(out).toContain('href="https://evil.example/x" rel="nofollow ugc noopener"')
  })

  it('enforces the iframe allow list paths and sandbox grants', () => {
    const out = render(
      '<iframe src="https://archive.org/download/x/evil.html"></iframe>' +
        '<iframe src="https://cdn.dapplr.in/anything"></iframe>' +
        '<iframe src="https://evil.example/embed/x" sandbox="allow-scripts allow-top-navigation"></iframe>' +
        '<iframe src="https://www.youtube.com/embed/dQw4w9WgXcQ" sandbox="allow-scripts allow-top-navigation"></iframe>'
    )
    expect(out).not.toContain('archive.org')
    expect(out).not.toContain('dapplr')
    expect(out).not.toContain('evil.example')
    expect(out).not.toContain('allow-top-navigation')
    expect(out).toContain('src="https://www.youtube.com/embed/dQw4w9WgXcQ"')
  })

  it('strips author markers', () => {
    const out = render(
      '<a class="markdown-post-link x" data-author="victim" data-permlink="fake" href="https://ecency.com/">c</a>',
      true
    )
    expect(out).not.toContain('markdown-post-link')
    expect(out).not.toContain('data-author')
    expect(out).toContain('class="x"')
  })

  it('serves a video poster through the proxy', () => {
    const out = render('<video src="https://example.com/v.mp4" poster="https://tracker.example/p.jpg" controls></video>')
    expect(out).not.toContain('tracker.example')
    const poster = out.match(/poster="([^"]*)"/)
    expect(poster).not.toBeNull()
    expect(poster![1].startsWith(`${getProxyBase()}/`)).toBe(true)
  })
})
