import { describe, expect, it } from 'vitest'
import { decodeHTMLAttribute } from 'entities'
import { sanitizeHtml } from './methods/sanitize-html.method'
import { markdown2Html } from './markdown-2-html'

// #1919 review r21: pins for the sanitizer's re-emission and class rules.

const attrValue = (html: string, attr: string) => {
  const m = html.match(new RegExp(`\\s${attr}="([^"]*)"`))
  return m ? decodeHTMLAttribute(m[1]) : null
}

describe('sanitizer pins (review r21)', () => {
  it('class is never added to a tag whose whitelist lacks it', () => {
    for (const opts of [{ untransformed: true }, { renderNonce: 'N' }]) {
      const out = sanitizeHtml('<b class="a&#32;er-author">b</b><td class="x">t</td><td class="markdown-x y">u</td><p class="a&#32;er-author">p</p><table class="t"></table>', opts)
      expect(out).not.toContain('class=')
    }
  })

  it('a URL attribute is not re-emitted onto a tag whose whitelist lacks it', () => {
    const out = sanitizeHtml('<div data-embed-src="https://www.youtube.com/embed/abcdefghijk">d</div><span poster="https://e.example/p.png">s</span>')
    expect(out).toBe('<div>d</div><span>s</span>')
  })

  it('the pre-transform sanitize leaves values in xss form', () => {
    // The repair path re-parses this; only the final pass re-emits.
    const out = sanitizeHtml('<img src="https://e.example/a.png?a=1&#38;b=2">', { beforeTransform: true })
    expect(out).toBe('<img src="https://e.example/a.png?a=1&b=2">')
  })

  const once = 'a=1&#38;b=2'
  const twice = 'a=1&#38;#38;b=2'
  const cases: Array<[string, string, string]> = [
    ['poster', `<video poster="https://e.example/p.png?${twice}"></video>`, `https://e.example/p.png?${once}`],
    ['data-href', `<a data-href="https://e.example/?${twice}">x</a>`, `https://e.example/?${once}`],
    ['data-embed-src', `<a data-embed-src="https://www.youtube.com/embed/abcdefghijk?${twice}">x</a>`, `https://www.youtube.com/embed/abcdefghijk?${once}`],
    ['data-video-href', `<a data-video-href="https://www.youtube.com/embed/abcdefghijk?${twice}">x</a>`, `https://www.youtube.com/embed/abcdefghijk?${once}`],
    ['srcset', `<img src="https://e.example/a.png" srcset="https://e.example/a.png?${twice} 1x">`, `https://e.example/a.png?${once} 1x`],
  ]
  for (const [attr, html, validated] of cases) {
    it(`${attr} loads exactly the value that was validated`, () => {
      expect(attrValue(sanitizeHtml(html), attr)).toBe(validated)
    })
  }

  it('a single-quoted value holding a double quote is re-escaped', () => {
    const out = sanitizeHtml(`<img src='https://e.example/a.png?q=" onerror="alert(1)'>`)
    expect(out).toBe('<img src="https://e.example/a.png?q=&quot; onerror=&quot;alert(1)">')
  })

  it('a quote in a validated value cannot break out of the attribute', () => {
    const out = sanitizeHtml('<img src="https://e.example/a.png?q=&quot; onerror=&quot;alert(1)">')
    expect(out).toBe('<img src="https://e.example/a.png?q=&quot; onerror=&quot;alert(1)">')
    expect(attrValue(out, 'src')).toBe('https://e.example/a.png?q=" onerror="alert(1)')
  })

  it('an embed source holding a raw TAB/LF/CR is refused outright', () => {
    for (const c of ['\t', '\n', '\r']) {
      const src = `https://www.youtube.com/embed/abc${c}defghijk`
      expect(sanitizeHtml(`<iframe src="${src}"></iframe>`)).not.toContain('<iframe')
      expect(sanitizeHtml(`<a data-embed-src="${src}">x</a>`)).toBe('<a>x</a>')
      expect(sanitizeHtml(`<a data-video-href="${src}">x</a>`)).toBe('<a>x</a>')
    }
  })

  it('a srcset with a malformed candidate is dropped (review r21 z1r)', () => {
    const base = 'https://i.ecency.com/'
    const bad = `${base}p/x&#38#32;1x&#38comma;&#38#32;https://evil.example/t.png 2x`
    const pic = `<picture><source type="image/webp" srcset="${bad}"><img src="${base}p/abc" srcset="${bad}"></picture>`
    // Every URL-looking token a browser could read from a srcset is on the proxy.
    const offProxyTokens = (html: string) =>
      [...html.matchAll(/\ssrcset="([^"]*)"/g)]
        .flatMap((m) => decodeHTMLAttribute(m[1]).split(/[\s,]+/))
        .filter((tok) => /^https?:/i.test(tok) && !tok.startsWith(base))
    for (const out of [
      sanitizeHtml(pic),
      sanitizeHtml(pic, { untransformed: true }),
      // The malformed block sends the body down the htmlparser2 repair path,
      // which decodes the value once more before the final pass.
      markdown2Html(`<div><b>x</div>\n\n${pic}`, false),
      markdown2Html(`<div><b>x</div>\n\n${pic}`, true),
    ]) {
      expect(offProxyTokens(out)).toEqual([])
    }
    // Well-formed ones are untouched.
    const ok = sanitizeHtml(`<img src="${base}p/a" srcset="${base}p/a?w=1 320w, ${base}p/a?w=2 1.5x">`)
    expect(ok).toContain('320w')
  })

  describe('review r24 pins', () => {
    it('a validated URL is emitted as validated even without a reference (TAB in a video src)', () => {
      expect(sanitizeHtml('<video src="https://a.example/a\tb.mp4"></video>')).toBe('<video src="https://a.example/a\tb.mp4"></video>')
    })

    const base = 'https://i.ecency.com/'
    const malformed: Array<[string, string]> = [
      ['second URL in a candidate', `${base}p/a 1x& https://evil.example/b.png 2x`],
      ['descriptor not anchored', `${base}p/a evil1x`],
      ['three parts', `${base}p/a 1x 2x`],
    ]
    for (const [what, srcset] of malformed) {
      it(`srcset grammar on img and source: ${what}`, () => {
        expect(sanitizeHtml(`<img src="${base}p/a" srcset="${srcset}">`)).not.toContain('srcset')
        expect(sanitizeHtml(`<picture><source type="image/webp" srcset="${srcset}"></picture>`)).not.toContain('srcset')
      })
    }

    it('the srcset grammar is left to the final pass, not the pre-transform sanitize', () => {
      const out = sanitizeHtml(`<img src="${base}p/a" srcset="${base}p/a 1x 2x">`, { beforeTransform: true })
      expect(out).toContain('srcset=')
    })

    it('browser-valid descriptors and a trailing comma survive', () => {
      const out = sanitizeHtml(`<img src="${base}p/a" srcset="${base}p/a .5x, ${base}p/b 2x,">`)
      expect(out).toContain('.5x')
      expect(out).toContain('2x')
    })

    it('an overlong numeric reference in an attribute is guarded, not passed through', () => {
      const ref = `&#${'9'.repeat(320)};`
      const out = sanitizeHtml(`<img src="https://e.example/a.png?q=${ref}">`)
      expect(out).not.toContain('999999')
      expect(out).toContain('�')
    })
  })
})
