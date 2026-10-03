import { vi } from 'vitest'
import { markdown2Html } from '../markdown-2-html'
import { DOMParser } from '../consts/dom-parser.const'
import { authorPixelSize, parsePixelDimension } from './image-dimensions'
import { img } from './img.method'
import { markdownToHTML } from './markdown-to-html.method'
import { sanitizeHtml } from './sanitize-html.method'
import { simpleMarkdownToHTML } from './simple-markdown-to-html.method'

const htmlparser2Calls = vi.hoisted(() => ({ n: 0 }))

vi.mock('htmlparser2', async () => {
  const actual = await vi.importActual<typeof import('htmlparser2')>('htmlparser2')
  return {
    ...actual,
    parseDocument: (...args: Parameters<typeof actual.parseDocument>) => {
      htmlparser2Calls.n++
      return actual.parseDocument(...args)
    },
  }
})

describe('authorPixelSize', () => {
  it('accepts a unitless pair and canonicalizes leading zeros', () => {
    expect(authorPixelSize(' 0800 ', '600')).toEqual({ width: '800', height: '600' })
  })

  it('accepts the largest square and a 40:1 pair, including a tall 200×8000', () => {
    expect(parsePixelDimension('8192')).toBe(8192)
    expect(authorPixelSize('8192', '8192')).toEqual({ width: '8192', height: '8192' })
    expect(authorPixelSize('800', '20')).toEqual({ width: '800', height: '20' })
    expect(authorPixelSize('200', '8000')).toEqual({ width: '200', height: '8000' })
  })

  it('rejects a missing side, a unit, zero, over the cap, and an extreme ratio', () => {
    expect(authorPixelSize('640', null)).toBeNull()
    expect(authorPixelSize('100%', '100%')).toBeNull()
    expect(authorPixelSize('500px', '300px')).toBeNull()
    expect(authorPixelSize('0', '480')).toBeNull()
    expect(authorPixelSize('8193', '480')).toBeNull()
    expect(authorPixelSize('800', '19')).toBeNull()
    expect(authorPixelSize('1', '8192')).toBeNull()
  })
})

describe('preserveImageDimensions', () => {
  const opts = { preserveImageDimensions: true as const }

  function makeImg(attrs: Record<string, string>): HTMLElement {
    const doc = DOMParser.parseFromString('<html><body><p></p></body></html>', 'text/html')
    const image = doc.createElement('img')
    for (const [name, value] of Object.entries(attrs)) image.setAttribute(name, value)
    doc.getElementsByTagName('p')[0].appendChild(image)
    return image as unknown as HTMLElement
  }

  it('still strips width and height when the option is absent', () => {
    const image = makeImg({
      src: 'https://example.com/image.jpg',
      width: '640',
      height: '480',
    })
    img(image)
    expect(image.getAttribute('width')).toBeNull()
    expect(image.getAttribute('height')).toBeNull()
  })

  it('puts a validated pair back on the img, including inside <picture>', () => {
    const image = makeImg({
      src: 'https://files.peakd.com/x/dims.png',
      width: '0640',
      height: '480',
    })
    img(image, { firstImageFound: false }, false, opts)
    expect(image.getAttribute('width')).toBe('640')
    expect(image.getAttribute('height')).toBe('480')
    expect((image.parentNode as HTMLElement).nodeName.toLowerCase()).toBe('picture')
  })

  it('does not reserve a box for an image whose src was rejected', () => {
    const image = makeImg({
      src: 'javascript:alert(1)',
      width: '640',
      height: '480',
    })
    img(image, undefined, true, opts)
    expect(image.getAttribute('src')).toBeNull()
    expect(image.getAttribute('width')).toBeNull()
    expect(image.getAttribute('height')).toBeNull()
  })

  it('sanitize keeps a usable pair and drops a ratio that cannot reserve a box', () => {
    const kept = sanitizeHtml(
      '<img src="https://example.com/a.jpg?width=100" width="640" height="480" style="background:url(javascript:alert(1))" onerror="alert(1)">',
      opts
    )
    expect(kept).toContain('width="640"')
    expect(kept).toContain('height="480"')
    expect(kept).toContain('?width=100')
    expect(kept).not.toContain('style')
    expect(kept).not.toContain('onerror')
    expect(kept).not.toContain('javascript:')

    const extreme = sanitizeHtml('<img src="https://example.com/a.jpg" width="1" height="8192">', opts)
    expect(extreme).not.toContain('width=')
    expect(extreme).not.toContain('height=')

    const lone = sanitizeHtml('<img src="https://example.com/a.jpg" width="640">', opts)
    expect(lone).not.toContain('width=')
  })

  it('sanitize still strips dimensions when the option is absent', () => {
    const out = sanitizeHtml('<img src="https://example.com/a.jpg" width="640" height="480">')
    expect(out).not.toContain('width=')
    expect(out).not.toContain('height=')
  })

  it('keeps the pair through markdown2Html and leaves the default render unchanged', () => {
    const body = '<img src="https://files.peakd.com/x/dims.jpg" width=" 640 " height="480" onerror="alert(1)">'
    const plain = markdown2Html(body, true)
    const kept = markdown2Html(body, true, false, 'ecency.com', undefined, opts)

    expect(plain).not.toMatch(/\bwidth="/)
    expect(plain).not.toMatch(/\bheight="/)
    expect(kept).toContain('width="640"')
    expect(kept).toContain('height="480"')
    expect(kept).toContain('width=320')
    expect(kept).not.toContain('onerror')
    expect(kept).not.toContain('<picture>')
  })

  it('keeps the pair on the web path, where the img is wrapped in <picture>', () => {
    const body = '<img src="https://files.peakd.com/x/dims-web.jpg" width="640" height="480">'
    const out = markdown2Html(body, false, false, 'ecency.com', undefined, opts)
    expect(out).toContain('<picture>')
    expect(out).toContain('format=avif')
    expect(out).toContain('width="640"')
    expect(out).toContain('height="480"')
    expect(out).toContain('width=320')
  })

  it('drops percentages, a single side, and an extreme ratio through the renderer', () => {
    const optsRender = (body: string) =>
      markdown2Html(body, true, false, 'ecency.com', undefined, opts)

    expect(optsRender('<img src="https://example.com/a.jpg" width="100%" height="100%">')).not.toMatch(/\bwidth="/)
    expect(optsRender('<img src="https://example.com/a.jpg" width="640">')).not.toMatch(/\bwidth="/)
    expect(optsRender('<img src="https://example.com/a.jpg" width="1" height="8192">')).not.toMatch(/\bwidth="/)
  })

  it('does not serve a cached render made without the option', () => {
    const entry = {
      author: 'dim',
      permlink: 'cache-key-fixture',
      last_update: '2026-08-06T00:00:00',
      updated: '2026-08-06T00:00:00',
      body: '<img src="https://example.com/cached.jpg" width="640" height="480">',
    } as never

    const plain = markdown2Html(entry, true)
    const kept = markdown2Html(entry, true, false, 'ecency.com', undefined, opts)

    expect(plain).not.toMatch(/\bwidth="/)
    expect(kept).toContain('width="640"')
    expect(kept).toContain('height="480"')
  })

  it('does not serve the option render to a caller that passed none', () => {
    const entry = {
      author: 'dim',
      permlink: 'cache-key-fixture-reverse',
      last_update: '2026-08-06T00:00:00',
      updated: '2026-08-06T00:00:00',
      body: '<img src="https://example.com/cached-reverse.jpg" width="320" height="200">',
    } as never

    const kept = markdown2Html(entry, true, false, 'ecency.com', undefined, opts)
    const plain = markdown2Html(entry, true)

    expect(kept).toContain('width="320"')
    expect(plain).not.toMatch(/\bwidth="/)
  })

  it('does not treat width= inside another attribute value as the width attribute', () => {
    const body = '<img alt="Set width=" src="https://example.com/a.jpg" width="640" height="480">'
    const out = markdown2Html(body, true, false, 'ecency.com', undefined, opts)
    expect(out).toContain('alt="Set width="')
    expect(out).toContain('width="640"')
    expect(out).toContain('height="480"')
    expect(out).toContain('src="https://')
    expect(out).not.toContain('Sethttps')
  })

  it('drops the pair when sanitize removed the src', () => {
    const cases = [
      '<img src="data:image/png;base64,AAAA" width="640" height="480">',
      '<img src="photo.jpg" width="640" height="480">',
      '<img width="640" height="480">',
    ]
    for (const input of cases) {
      const out = sanitizeHtml(input, opts)
      expect(out).not.toMatch(/\swidth="/)
      expect(out).not.toMatch(/\sheight="/)
    }
  })

  it('keeps a real pair and drops a sourceless one when xmldom falls back to htmlparser2', () => {
    htmlparser2Calls.n = 0
    const body = [
      '<div><p>text</div>',
      '<img alt="Set width=" src="https://example.com/a.jpg" width="640" height="480">',
      '<img src="data:image/png;base64,AAAA" width="640" height="480">',
    ].join('\n')
    const out = markdownToHTML(body, true, 'ecency.com', undefined, opts)
    expect(htmlparser2Calls.n).toBeGreaterThan(0)

    const imgs = out.match(/<img\b[^>]*>/gi) ?? []
    const kept = imgs.find((tag) => tag.includes('Set width='))
    expect(kept).toBeTruthy()
    expect(kept).toContain('width="640"')
    expect(kept).toContain('height="480"')
    expect(kept).toMatch(/\ssrc="https?:/)
    expect(kept).not.toContain('Sethttps')
    expect(imgs.some((tag) => /\swidth="/.test(tag) && !/\ssrc="/.test(tag))).toBe(false)
  })

  it('leaves the lightweight editor renderer stripping dimensions', () => {
    const out = simpleMarkdownToHTML('<img src="https://example.com/a.jpg" width="640" height="480">')
    expect(out).not.toContain('width=')
    expect(out).not.toContain('height=')
  })
})
