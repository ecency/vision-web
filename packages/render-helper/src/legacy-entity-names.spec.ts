import { describe, expect, it } from 'vitest'
import { simpleMarkdownToHTML } from './methods/simple-markdown-to-html.method'
import { sanitizeHtml } from './methods/sanitize-html.method'
describe('r21: bare & before a legacy entity name in a URL attribute', () => {
  const q = 'x=1&timestamp=5&region=us&param=2&copy=3&current=4&section=5&lte=6'
  for (const html of [
    `<img src="https://example.com/a.png?${q}">`,
    `<video controls src="https://example.com/v.mp4?${q}"></video>`,
    `<audio controls src="https://example.com/a.mp3?${q}"></audio>`,
    `<iframe src="https://www.youtube.com/embed/abcdefghijk?${q}"></iframe>`,
  ]) {
    it(`simple keeps ${html.slice(0, 12)}`, () => {
      const out = simpleMarkdownToHTML(html)
      // what a browser reads back from the attribute
      const m = out.match(/src="([^"]*)"/)!
      expect(m[1].replace(/&amp;/g, '&')).toContain(q)
    })
    it(`plain keeps ${html.slice(0, 12)}`, () => {
      const m = sanitizeHtml(html).match(/src="([^"]*)"/)!
      expect(m[1].replace(/&amp;/g, '&')).toContain(q)
    })
  }
})
