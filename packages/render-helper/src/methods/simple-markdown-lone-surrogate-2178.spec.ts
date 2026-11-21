import { describe, expect, it } from 'vitest'
import { simpleMarkdownToHTML } from './simple-markdown-to-html.method'
import { markdown2Html as renderPostBody } from '../markdown-2-html'

const href = (html: string) => html.match(/<a [^>]*href="([^"]*)"/)?.[1]

// A lone surrogate reads as U+FFFD, as a browser and renderPostBody read it,
// instead of throwing URIError from the parser's encodeURI (#2178).
describe('simpleMarkdownToHTML on a lone surrogate (#2178)', () => {
  it.each([
    ['high', 'text\n\n[y](<https://example.com/\ud800?q=1>)'],
    ['low', 'text\n\n[y](<https://example.com/\udc00?q=1>)']
  ])('a %s surrogate in a link destination gives the render href', (_, body) => {
    // The simple path percent-encodes non-ASCII (as it does for any), so the
    // two hrefs are the same URL written two ways.
    const simple = decodeURI(href(simpleMarkdownToHTML(body)) ?? '')
    expect(simple).toBe('https://example.com/\ufffd?q=1')
    expect(simple).toBe(decodeURI(href(renderPostBody(body, false)) ?? ''))
  })

  it('a lone surrogate in plain text becomes U+FFFD', () => {
    expect(simpleMarkdownToHTML('a\ud800b').trim()).toBe('<p>a\ufffdb</p>')
  })

  it('keeps a paired surrogate as written', () => {
    expect(simpleMarkdownToHTML('a😀b').trim()).toBe('<p>a😀b</p>')
  })
})
