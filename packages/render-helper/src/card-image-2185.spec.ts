import { describe, expect, it } from 'vitest'
import { markdown2Html } from './markdown-2-html'
import { catchPostImage } from './catch-post-image'
import { getEntryImageRawUrl, getEntryLcpImage } from './card-image'
import { getProxyBase, isPictureEligibleRawUrl, proxifyImageSrc } from './proxify-image-src'

let n = 0
const entry = (body: string) => ({ author: 'cs', permlink: `q${n++}`, last_update: '2026-11-21', body, json_metadata: '{}' }) as never
// The first image the body shows: the first <img> with a nonempty src (an
// <img> the render dropped shows nothing), as the request it makes.
const shown = (body: string) =>
  [...markdown2Html(entry(body), false).matchAll(/<img\b[^>]*?\ssrc="([^"]+)"/g)].map((m) => m[1].replace(/&amp;/g, '&'))[0] ?? null
// One request, however it is spelled: the proxy reads `/p/<hash>.png` and
// `/p/<hash>?format=match&mode=fit` as the same image.
const request = (src: string | null) => (src === null ? null : proxifyImageSrc(src, 0, 0, 'match') || src)

const FAST = { fast: true }

// Milliseconds per call, timed over a batch long enough to measure: a sample
// under the timer's resolution would hide how the call grows.
const perCall = (run: () => void) => {
  for (let count = 1; ; count *= 2) {
    const started = performance.now()
    for (let i = 0; i < count; i++) run()
    const spent = performance.now() - started
    if (spent >= 20) return spent / count
  }
}
// How much longer `large` takes than `small`, the least of a few tries.
const growth = (once: (text: string) => void, small: string, large: string) => {
  once(small)
  let ratio = Infinity
  for (let attempt = 0; attempt < 3 && ratio >= 30; attempt++) {
    ratio = Math.min(ratio, perCall(() => once(large)) / perCall(() => once(small)))
  }
  return ratio
}
// The image the entry page requests from a raw URL, built the way it builds it
// and never from the render (entry-lcp-match.ts): a picture-eligible cover
// through the proxy hash of the raw URL, anything else (already proxied, gif, a
// poster) through proxifyImageSrc as it stands. This checks which image, not
// which size: for an already-proxied first image the page preloads another
// rendition than the body requests (#2191).
const preload = (url: string, poster = false) =>
  request(!poster && isPictureEligibleRawUrl(url) ? proxifyImageSrc(url, 0, 0, 'match', { forceProxy: true }) : url)
const lookups = {
  fast: (body: string) => request(catchPostImage(entry(body), 0, 0, 'match', FAST)),
  raw: (body: string) => {
    const url = getEntryImageRawUrl(entry(body))
    return url ? preload(url) : null
  },
  lcp: (body: string) => {
    const found = getEntryLcpImage(entry(body))
    return found ? preload(found.url, found.poster) : null
  }
}

const A = 'https://e.com/a.png'
const B = 'https://e.com/b.png'
const C = 'https://e.com/c.png'
const D = 'https://e.com/d.png'
const S = 'https://e.com/s.png'
const Z = 'https://z.example/z.png'
const LONG = `https://e.com/${'a'.repeat(2100)}.png`
const TAIL = `\n\n<img data-src="${D}" src="${S}">`

describe('a lookup names the image the body shows, or defers (#2185)', () => {
  it.each([
    // Over the limit as written, under it decoded: the render shows it.
    `![x](https://e.com/${'a'.repeat(2020)}${'%41'.repeat(10)}.png) ![d](${B})`,
    // Reserved escapes, a legacy host's encoded inner URL: shown although long as written.
    `![x](https://e.com/x%2F%7e${'a'.repeat(2024)}.png) ![d](${B})`,
    `![x](https://e.com/%3Fq%3D%41%41${'a'.repeat(2019)}.png) ![d](${B})`,
    `![x](https://images.hive.blog/0x0/https%3A%2F%2Fe.com%2F${'a'.repeat(1995)}.png)\n\n![d](${B})`,
    `![x](https://images.hive.blog/0x0/https%3A%2F%2Fe.com%2F${'a'.repeat(2022)}.png)\n\n![d](${B})`,
    // A lone surrogate: no lookup throws.
    `![x](https://e.com/%20\ud800${'a'.repeat(2040)}.png) ![d](${B})`,
    // The candidate's whole line decides a closer, not the text before it.
    `\`\`\`\ncode\n\`\`\`js\nmore\n\`\`\`<img src="${B}">`,
    // A closer behind a container the opener was not in, or indented four.
    `\`\`\`\ncode\n\`\`\`js\n> \`\`\`\n![x](${A})`,
    `\`\`\`\ncode\n    \`\`\`\n![x](${A})\n\`\`\`\n\n![d](${B})`,
    `\`\`\`\ncode\n- \`\`\`\n![x](${A})\n\`\`\`\n\n![d](${B})`,
    `\`\`\`\ncode\n\`\`\`![x](${A})\n\`\`\`\n\n![d](${B})`,
    // Multi-byte escapes decode shorter than two per escape.
    `![x](https://e.com/%C3%A9${'a'.repeat(2029)}.png) ![d](${B})`,
    `![x](https://e.com/%E2%82%AC${'a'.repeat(2028)}.png) ![d](${B})`,
    `![x](https://e.com/${'%C3%A9'.repeat(100)}${'a'.repeat(1882)}.png) ![d](${B})`,
    `![x](https://e.com/${'%F0%9F%98%80'.repeat(20)}${'a'.repeat(1820)}.png) ![d](${B})`,
    // A closer indented up to three spaces closes whatever the opener's indent.
    `\`\`\`\na\n   \`\`\`\n\`\`\`\nb\n\`\`\`\n\`\`\`\n<img src="${B}">`,
    `\`\`\`\na\n   \`\`\`\n\`\`\`\nb\n\`\`\`\n\`\`\`\n![x](${A})`,
    `\`\`\`\n\n   \`\`\`\nx\n\`\`\`\n\`\`A\`\`\n\n![d](${B})`,
    // A fence holding a blank line, then inline code before the URL.
    `\`\`\`\ncode\n\n\`\`\`\n\`\`${A}\`\`\n\n![d](${B})`,
    // A list fence closed by its indented closer, then a fence the list
    // marker line does not close.
    `- \`\`\`\n  a\n  \`\`\`\n\n\`\`\`\n- \`\`\`\n![x](${A})`,
    // A marker indented four or by a tab is indented code, not an opener.
    `\t\`\`\`\n</pre>   \`\`\`\n    \t\`\`\`\n    \`\`\`\n![x](${A})\`\`\`\t\n`,
    `\t\`\`\`\n\n\n<code>--- \`\`\`\n\`\`\`\t\nhttps://youtu.be/dQw4w9WgXcQ`,
    `text\n\n    \`\`\`\n    indented code\n\n\`\`\`\n${A}\n\`\`\`\n\n![d](${B})`,
    `    \`\`\`\n\n\`\`\`\n![x](${A})`,
    `    \`\`\`\n\n\`\`\`\nhttps://youtu.be/dQw4w9WgXcQ`,
    // An info string holding a backtick opens nothing.
    `\`\`\` a\`b\n\n\`\`\`\n![x](${A})\n\`\`\`\n\n![d](${B})`,
    `~~~ a\`b\n\n~~~\n![x](${A})\n~~~\n\n![d](${B})`,
    // A list item's fence, then a marker under its indent.
    `1. x\n   \`\`\`\n   a\n\`\`\`\n![x](${A})\n\`\`\`\n\n![d](${B})`,
    // A fence marker with text after it closes nothing.
    `\`\`\`\n\`\`\` not a closer\n![x](${A})\n\`\`\`\n\n![d](${B})`,
    `~~~\n~~~ x\n![x](${A})\n~~~\n\n![d](${B})`,
    `\`\`\`\n\`\`\` x\n\`\`\`\n${A}\n\`\`\`\n\n![d](${B})`,
    `\`\`\`\n\`\`\` x\n\`\`\`\n\`a\`\n\`\`\`\n\n${A}\n\n![d](${B})`,
    // 2. Bare image URLs the scans never read.
    `https://e.com/a(1).png\n\n![d](${B})`,
    `_${A}_ ![x](${B})`,
    `==${A}== ![x](${B})`,
    `[${A}] ![x](${B})`,
    `x${A} ![x](${B})`,
    `=${A} ![x](${B})`,
    `\`x\` ${A}\n\n![d](${B})`,
    `text\n    ${A}\n\n![d](${B})`,
    `- x\n\n    ${A}\n\n![d](${B})`,
    `<a href="https://x.com/q">y\n${A}\n\n![d](${B})`,
    `<div\n${A}\n>x</div>\n\n![d](${B})`,
    // 3. A spaced HTML src.
    `<img src=" ${A} ">\n\n![z](${B})`,
    `<img src=" https://images.hive.blog/600x400/https%3A%2F%2Fe.com%2Fa.png "> ![b](${B})`,
    // 4. A video poster before a markdown image.
    `https://www.youtube.com/watch?v=dQw4w9WgXcQ ![x](${B})`,
    // 5. A URL the render shows as no image, nothing after it.
    `[x](https://x.com/q "${A}")`,
    `[see ${A} here](https://x.com/q)`,
    `[y]: ${A}`,
    `[^1]: ${A}`,
    `*[HTML]: ${A}`,
    `<iframe src="https://x.com">${A}</iframe>`,
    // 6. A legacy sized proxy URL written bare.
    `https://images.hive.blog/1536x0/https://files.example/x.png`,
    `https://images.hive.blog/1536x0/https://files.example/x.png\n\n![d](${B})`,
    // 7. Trailing characters.
    `${A}*`,
    `${A}_`,
    `${A}~`,
    `${A}'`,
    `${A}\\`,
    `${A}*\n\n![d](${B})`,
    `${A}'\n\n![d](${B})`,
    // An existing proxy URL over the proxy's length limit is kept as is.
    `![x](${getProxyBase()}/p/${'Z'.repeat(2100)}) ![d](${B})`,
    `![x](${getProxyBase()}/u/${'z'.repeat(2100)}.png) ![d](${B})`,
    // A bare URL over the limit, then another URL or image.
    `https://e.example/${'a'.repeat(2040)}.png\n\n${Z}`,
    `https://e.example/${'a'.repeat(2040)}.png\n\n[${Z}](${Z})`,
    `https://e.example/${'a'.repeat(2040)}.png\n\nhttps://youtu.be/abcdefghijk`,
    `https://e.example/${'a'.repeat(2040)}.png\n\n![z](${Z})`,
    `<div>\n\n${LONG}\n\n![d](${B})`,
    `<center>\n\n${LONG}\n\n![d](${B})`,
    // Image syntax the render does not show as the first image.
    `<img src=${C}>\n\n![x](${A})${TAIL}`,
    `https://youtu.be/abcdefghijk\n\n![x](${A})${TAIL}`,
    `[^1]: ![x](${A})\n\nt[^1]${TAIL}`,
    `[t](https://l.example/ "![x](${A})")${TAIL}`,
    `[r]: https://r.example/ "![x](${A})"\n\n[t][r]${TAIL}`,
    `<div title="![x](${A})">t</div>${TAIL}`,
    `<iframe src="https://x.com">![x](${A})</iframe>${TAIL}`,
    `<img alt="![x](${A})">${TAIL}`,
    `\`\`\`\ncode\n![x](${A})${TAIL}`,
    `[^1]: ![x](${A})\n\nt[^1]`,
    `[t](https://l.example/ "![x](${A})") ![d](${B})`,
    // A reference image after another image, or after text the scans cannot read.
    `[r]: ${A}\n\n![b](${B})\n\n![][r]`,
    `[r]: ${A}\n\n_${C}_ ![][r]`,
    // Third review: a `]:` that is not a definition, a duplicate label, a spaced reference.
    `Sources\n[1]: ${A}\n\n![d](${B})`,
    `Sources\n[1]: ${A}\n\n${B}`,
    `note]: ${A}\n\n![d](${B})`,
    `[r]: ${A} trailing words\n\n![d](${B})`,
    `[r]: ${A}<img src="${B}">`,
    `text\n*[HTML]: ${A}\n\n![d](${B})`,
    `![x] [r]\n\n[r]: ${A}\n\n![d](${B})`,
    `[r]: https://x.com/q\n[r]: ${A}\n\n![x][r]\n\n![d](${B})`,
    `![x][r]\n\n[r]: https://i.ecency.com/768x0/${A}\n\n![d](${B})`,
    // A video URL the render does not turn into a poster.
    `[video]: https://www.youtube.com/watch?v=dQw4w9WgXcQ\n\n![cover](${B})\n\nWatch the [video].`,
    `[Watch https://www.youtube.com/watch?v=dQw4w9WgXcQ here](https://x.com/q)\n\n![d](${B})`,
    `[x](https://x.com/q "https://www.youtube.com/watch?v=dQw4w9WgXcQ")\n\n![d](${B})`,
    `\`\`https://www.youtube.com/watch?v=dQw4w9WgXcQ\`\`\n\n![d](${B})`,
    // Bare URL contexts.
    `\`\`${A}\`\`\n\n![d](${B})`,
    `Use \`\`${A}\`\` as the URL.\n\n![d](${B})`,
    `'${A}' ![d](${B})`,
    `++${A}++\n\n![d](${B})`,
    `^${A}^\n\n![d](${B})`,
    `|${A}|x|\n|-|-|\n|y|z|\n\n![d](${B})`,
    `${A}\`![x](${B})`,
    `<a\nhref="https://x.com/q">${A}</a>\n\n![d](${B})`,
    `<div title="[${A}](${A})">x</div>\n\n![d](${B})`,
    `\\[${A}](${A})\n\n![d](${B})`,
    `<div><${A}>\n\n![d](${B})`,
    `<hr><${A}>\n\n![d](${B})`,
    `[^1]: ${A}\n\n![d](${B})`,
    `[r]: ${A}\n\n![r](${C})`,
    `<a href="https://x.com/q"><a href="${A}">${A}</a></a>\n\n![d](${B})`,
    `_${A}_ https://www.youtube.com/watch?v=dQw4w9WgXcQ`,
    // Second review round.
    `[r]: https://e.com/r.png\n\n![x](${A})`,
    `[r]: https://e.com/r.png\n\n${A}`,
    `https://i.ecency.com/768x0/${A}`,
    `<center>https://i.ecency.com/768x0/${A}</center>\n\n![d](${B})`,
    `[https://i.ecency.com/768x0/${A}](https://i.ecency.com/768x0/${A})`,
    `![x][é]\n\n[É]: ${A}\n\n![d](${B})`,
    `![x][foo\nbar]\n\n[foo bar]: ${A}\n\n![d](${B})`,
    `text\n[a]: https://x.com/q\n[r]: ${A}\n\n![d](${B})`,
    `[a]: https://x.com/q junk words\n[r]: ${A}\n\n![d](${B})`,
    `[r]: ${A}\n"title" junk\n\n![d](${B})`,
    `<div class="text-justify">\n![x][r]\n</div>\n\n[r]: ${A}\n\n![d](${B})`,
    `\\![x][r]\n\n[r]: ${A}\n\n![d](${B})`,
    `<div title="![x][r]">y</div>\n\n[r]: ${A}\n\n![d](${B})`,
    `[t](https://x.com/q "![x][r]")\n\n[r]: ${A}\n\n![d](${B})`,
    `[r]: ${A}\n[q]: https://x.com/q\n\n![x][q] ![y][r]\n\n![d](${B})`,
    `<a href="https://x.com/q"><a href="https://x.com/q">y</a>${A}</a>\n\n![d](${B})`,
    `<a title="[${A}](${A})" href="https://x.com/q">y</a>\n\n![d](${B})`,
    `<div>https://e.com/c.jpg</span>![x](${A})`,
    `<col>https://www.youtube.com/watch?v=dQw4w9WgXcQ</col>![d](${B})`,
    `[]( https://www.youtube.com/watch?v=dQw4w9WgXcQ ) ![d](${B})`,
    `<a href="https://x.com/q"><a href="https://x.com/q">y</a>https://www.youtube.com/watch?v=dQw4w9WgXcQ</a>\n\n![d](${B})`,
    `<a x="[https://www.youtube.com/watch?v=dQw4w9WgXcQ](https://www.youtube.com/watch?v=dQw4w9WgXcQ)">y</a><img src="${B}">`,
    `<?x <a href="https://www.youtube.com/watch?v=dQw4w9WgXcQ">https://www.youtube.com/watch?v=dQw4w9WgXcQ</a> ?>\n\n![d](${B})`,
    `</style>https://www.youtube.com/watch?v=dQw4w9WgXcQ</span>![y](${B})`,
    // Third review round.
    `${A}[x] ![d](${B})`,
    `${A}[1]: https://x.com/q\n\n![d](${B})`,
    `[]( [${A}](${A}) ) ![d](${B})`,
    `[]( [https://www.youtube.com/watch?v=dQw4w9WgXcQ](https://www.youtube.com/watch?v=dQw4w9WgXcQ) ) ![d](${B})`,
    `<blockquote>${A}</textarea>\n\n\`\`\`\n![x](${A})`,
    `![r]<pre>https://e.com/c.jpg</a>![y](${B})`,
    // Fourth review round: brackets after a bare URL.
    `${A}[ \n\n![d](${B})`,
    `${A}[x\ny]\n\n![d](${B})`,
    `${A}[[x]]\n\n![d](${B})`,
    `${A}[${'x'.repeat(120)}]\n\n![d](${B})`,
    `${A}[x][y]\n\n![d](${B})`,
    `${A}[x][]\n\n![d](${B})`,
    `${A}[x](\n\n![d](${B})`,
    `${A}[x](y z)\n\n![d](${B})`,
    `${A}[^1]\n\n![d](${B})`,
    `${A}[^1]\n\n[^1]: note\n\n![d](${B})`,
    `${A}[r]\n\ntext\n[r]: https://x.com/q\n\n![d](${B})`,
    `${A}[r]\n\n[r]: https://x.com/q junk words\n\n![d](${B})`,
    `${A}[r]\n\n\`\`\`\n[r]: https://x.com/q\n\`\`\`\n\n![d](${B})`,
    `${A}[r]\n\n[r]: https://x.com/q\n\n![d](${B})`,
    `${A}[x](https://x.com/q)\n\n![d](${B})`,
    `${A}[r]\n\n\`\`\`\n\n[r]: https://x.com/q\n\n\`\`\`\n\n![d](${B})`
  ])('%j', (body) => {
    const rendered = shown(body)
    expect(['card', catchPostImage(entry(body), 0, 0, 'match')]).toEqual(['card', rendered])
    for (const name of ['fast', 'raw', 'lcp'] as const) {
      const found = lookups[name](body)
      if (found !== null) expect([name, found]).toEqual([name, request(rendered)])
    }
  })
})

describe('a kept proxy URL over the proxy limit is the card as rendered (#2185)', () => {
  it.each([`![x](${getProxyBase()}/p/${'Z'.repeat(2100)}) ![d](${B})`])('%j, as an entry and as a string', (body) => {
    expect(catchPostImage(entry(body), 0, 0, 'match')).toBe(shown(body))
    expect(catchPostImage(body, 0, 0, 'match')).toBe(shown(body))
    // Sized: the proxy will not take it again, so the src as rendered.
    expect(catchPostImage(entry(body), 600, 500, 'match')).toBe(shown(body))
    expect(catchPostImage(body, 600, 500, 'match')).toBe(shown(body))
  })
})

describe('an image over the proxy limit with percent escapes is skipped (#2182)', () => {
  it.each([
    `![x](https://e.com/${'a'.repeat(2050)}%20b.png) ![d](${B})`,
    `![x](https://e.com/${'a'.repeat(2050)}%C3%A9.png)\n\n![d](${B})`
  ])('%j', (body) => {
    const rendered = shown(body)
    expect(rendered).toBe(proxifyImageSrc(B, 0, 0, 'match'))
    for (const name of ['fast', 'raw', 'lcp'] as const) expect([name, lookups[name](body)]).toEqual([name, request(rendered)])
  })
})

describe('a bare URL over the proxy limit does not end the render (#2185)', () => {
  it('still renders the image after it', () => {
    expect(shown(`https://e.example/${'a'.repeat(2040)}.png\n\n${Z}`)).toBe(proxifyImageSrc(Z, 0, 0, 'match'))
  })
  it('leaves an IPFS one a link, with no empty image', () => {
    const url = `https://ipfs.io/ipfs/QmTest/${'a'.repeat(2100)}.png`
    for (const body of [url, `[${url}](${url})`]) expect(markdown2Html(entry(`${body}\n\n![x](${B})`), false)).not.toMatch(/<img(?![^>]*\ssrc=)/)
  })
  it.each([true, false])('leaves it an external link like any other (forApp %s)', (forApp) => {
    const url = `https://e.example/${'a'.repeat(2040)}.png`
    const asLink = (html: string, href: string) => html.replace(href, 'URL').replace(href, 'URL')
    expect(asLink(markdown2Html(entry(url), forApp), url)).toBe(asLink(markdown2Html(entry('https://e.example/page'), forApp), 'https://e.example/page'))
  })
})

describe('a bare URL in a plain line is named by every lookup (#2185)', () => {
  it.each([
    `<center>${A}</center>\n\n![x](${B})`,
    `<center>\n\n${A}\n\n</center>\n\n![x](${B})`,
    `| a |\n|---|\n| ${A} |\n\n![x](${B})`,
    `${A}\n\n![x](${B})`,
    `intro\n\n${A}\n\n![x](${B})`,
    `${A}`,
    `<center>${A}</center>`,
    `<div>${A}</div>\n\n![x](${B})`,
    `<img src=" ${A} ">\n\n![x](${B})`,
    // Code before the paragraph, or fenced in it, is not the URL's code.
    `\`x\`\n\n${A}\n\n![x](${B})`,
    `\`\`\`\nx\n\`\`\`\n${A}\n\n![x](${B})`,
    // A fence in a quote, closed behind the same prefix.
    `> \`\`\`\n> code\n> \`\`\`\n\n![x](${A})`,
    // A linked image.
    `<a href="${A}"><img src="${A}"></a>`,
    `<center><a href="https://e.com/full.jpg"><img src="${A}"></a></center>\n\n![x](${B})`
  ])('%j', (body) => {
    const rendered = proxifyImageSrc(A, 0, 0, 'match')
    expect(shown(body)).toBe(rendered)
    for (const name of ['fast', 'raw', 'lcp'] as const) expect([name, lookups[name](body)]).toEqual([name, request(rendered)])
  })
})

describe('a legacy host image is preloaded as rendered (#2185)', () => {
  it.each([
    '![](https://images.ecency.com/DQmTest/thumbnail.png)',
    '![](https://images.hive.blog/DQmTest/a.png)',
    '<img src="https://steemitimages.com/DQmTest/a.png">'
  ])('%j', (body) => {
    const rendered = shown(body)
    expect(rendered).not.toBeNull()
    for (const name of ['fast', 'raw', 'lcp'] as const) expect([name, lookups[name](body)]).toEqual([name, request(rendered)])
  })
})

describe('the new scans are linear (#2185)', () => {
  it.each([
    ['](', `![x](${A})`],
    ['](a ', `![x](${A})`],
    ['](a ', `\n${A}`],
    [`<a href="https://x.com/q">https://youtu.be/abcdefghijk</a> `, `![x](${A})`],
    [`<a href="https://x.com/q">${A}</a> `, `![x](${A})`],
    ['[rN]: https://e.com/n.png\n', `\n![x](${A})`],
    ['https://e.com/t.png ', `">\n\n![x](${A})`]
  ])('%j repeated, then %j', (unit, tail) => {
    const lead = unit === 'https://e.com/t.png ' ? '<div title="' : ''
    const make = (n: number) => lead + (unit.includes('rN') ? Array.from({ length: n }, (_, i) => unit.replace('rN', `r${i}`)).join('') : unit.repeat(n)) + tail
    const once = (text: string) => {
      catchPostImage(entry(text), 0, 0, 'match', FAST)
      getEntryLcpImage(entry(text))
    }
    const ratio = growth(once, make(Math.floor(4_000 / unit.length)), make(Math.floor(32_000 / unit.length)))
    // 8x input: about 8-15 linear, 60+ quadratic.
    expect(ratio).toBeLessThan(30)
  }, 120_000)
})

describe('the <img scan is linear (#2185)', () => {
  it.each(['<img ', '<img a', '(<img src =)'])('%j repeated', (unit) => {
    const once = (text: string) => {
      getEntryImageRawUrl(entry(text))
      catchPostImage(entry(text), 0, 0, 'match', FAST)
    }
    // A src at the end: a scan that looks past each tag for one reaches it every time.
    const tail = `<img src="${A}">`
    const ratio = growth(once, unit.repeat(1_500) + tail, unit.repeat(12_000) + tail)
    // 8x input: about 8-15 linear, 60+ for a rescan of the rest per tag.
    expect(ratio).toBeLessThan(30)
  }, 120_000)
})

describe('a gallery of closed <img> tags without a src is read once (#2185)', () => {
  it.each(['<img>', '<img alt="x">'])('%j repeated, then an image', (unit) => {
    const once = (text: string) => {
      getEntryImageRawUrl(entry(text))
      catchPostImage(entry(text), 0, 0, 'match', FAST)
    }
    // A src at the end: a scan that looks past each tag for one reaches it every time.
    const tail = `<img src="${A}">`
    const ratio = growth(once, unit.repeat(12_000) + tail, unit.repeat(192_000) + tail)
    // 16x input: about 5-20 linear, 50+ for a rescan of the rest per tag.
    expect(ratio).toBeLessThan(32)
  }, 120_000)
})
