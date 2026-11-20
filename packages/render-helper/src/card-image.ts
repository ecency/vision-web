import { proxifyImageSrc } from './proxify-image-src'
import { hasAmpSentinel, imageUrlEnd, unescapeDestination, makeEntryCacheKey, decodeImageSrc, decodeRawBodyImageSrc, decodeDomImageSrc, decodeAttributeEntities, decodeEntities, decodeCompleteReferences, stripHtmlTags } from './helper'
import { entryMemoGet, entryMemoSet, MEMO_MISS } from './cache'
import { Entry } from './types'
import { regexMatches } from './regex-matches'
import { decodeHTMLStrict } from 'entities'

// No gif branch below, deliberately. Every proxify here used to ask for the
// ORIGINAL dimensions when the source was a .gif, because the image host handed
// animated sources back untransformed at any size, so a sized URL only minted a
// second cache key holding the same bytes. ecency/imagehoster#47 re-renders them
// at the requested box, keeping every frame or passing through untouched, so a
// size is now worth asking for: on the source behind #1802 the feed's 600x500 box
// is 195,318 bytes of animated WebP against 1,572,008 of GIF, 40 frames and the
// same 5000ms running time. Re-adding the branch would put a full-size animation
// back into a 150px slot.

// Strip code regions so that ![alt](url) inside a code block is not mistaken
// for a real image. The full markdown renderer turns these into <pre><code>
// with no <img>, so we mirror that behavior here.
//   - backtick fences ``` … ``` (with optional language hint)
//   - tilde fences ~~~ … ~~~ (CommonMark also accepts these)
//   - inline code `…`
//   - indented code blocks (4 spaces or a tab at line start) — over-strips
//     a little (e.g., deeply nested list continuation lines), which is fine:
//     a missed match just falls back to the full parser.
const BACKTICK_FENCE_RE = /```[\s\S]*?```/g
const TILDE_FENCE_RE = /~~~[\s\S]*?~~~/g
const INLINE_CODE_RE = /`[^`\n]*`/g
// HTML regions whose text never reaches the page as an image: <style> and
// <script> (dropped with their content), <pre> in block context (the renderer
// leaves its text alone), plus HTML comments. Verified against the renderer: a
// URL inside <code> text IS linkified into an image, so that is not listed.
//
// Plain index scans rather than regex replaces: the text is only ever searched
// for image URLs, never emitted, so this is candidate extraction and not
// sanitization, but the scans are also linear and leave nothing behind (an
// unterminated region runs to the end, as in HTML).

// What may follow a tag name, as the renderer reads it (probed, not the HTML
// spec): on an opening tag, space, tab, form feed or carriage return, `/` or
// `>`. A line feed anywhere inside the tag breaks the tag for the renderer and
// the content renders as prose (see findOpenTagEnd). `<prefix>` is not `<pre`.
const OPEN_TAG_NAME_END = /[\t\f\r />]/
// A closing tag tolerates any whitespace before its `>`; `</prelude>` does not
// close `<pre>`.
const CLOSE_TAG_NAME_END = /[\s>]/

function isWholeTagName(lower: string, idx: number, end: RegExp): boolean {
  const next = lower[idx]
  return next === undefined || end.test(next)
}

// Index of the next `<tag` / `</tag` occurrence at or after `from` whose tag
// name is whole, or -1.
function findTag(lower: string, tag: string, from: number, end: RegExp): number {
  let at = lower.indexOf(tag, from)
  while (at !== -1 && !isWholeTagName(lower, at + tag.length, end)) {
    at = lower.indexOf(tag, at + tag.length)
  }
  return at
}

// Where an opening tag that starts at `openAt` ends, read the way the renderer
// reads it: the first `>` outside quotes closes it; a line feed before that
// breaks the tag (it is then prose, not a tag); a `/` right before the `>`
// makes it self-closing, which opens nothing. Returns the index of the `>`
// for a real opening tag, -1 for an unterminated one (taken as open to the
// end), and NaN for a broken or self-closing one, which is skipped.
function findOpenTagEnd(lower: string, openAt: number, budget?: { left: number }): number {
  let quote = ''
  for (let i = openAt + 1; i < lower.length; i++) {
    if (budget && --budget.left < 0) return -1
    const c = lower[i]
    if (c === '\n') return NaN
    if (quote) {
      if (c === quote) quote = ''
    } else if (c === '"' || c === "'") {
      quote = c
    } else if (c === '>') {
      return lower[i - 1] === '/' ? NaN : i
    }
  }
  return -1
}

// The markdown parser's HTML block tags (remarkable `html_blocks`). A line
// indented at most three spaces that starts with `<` plus one of these (or a
// closing tag of one, or `<!`/`<?`) is an HTML block, kept raw; any other line
// is a paragraph and an element in it is inline content whose text is
// linkified like prose. That is why `<pre>` hides its content only in block
// context: `<code><pre>URL</pre></code>` renders the image, `<div><pre>` does
// not. Verified against the renderer for both.
const HTML_BLOCK_TAGS = new Set([
  'article', 'aside', 'button', 'blockquote', 'body', 'canvas', 'caption', 'col', 'colgroup', 'dd', 'div',
  'dl', 'dt', 'embed', 'fieldset', 'figcaption', 'figure', 'footer', 'form', 'h1', 'h2', 'h3', 'h4', 'h5',
  'h6', 'header', 'hgroup', 'hr', 'iframe', 'li', 'map', 'object', 'ol', 'output', 'p', 'pre', 'progress',
  'script', 'section', 'style', 'table', 'tbody', 'td', 'textarea', 'tfoot', 'th', 'tr', 'thead', 'ul', 'video'
])
// The parser's own tag patterns: letters only, so `<h1>` never opens a block
// (and a heading's content is linkified like prose); an opening tag needs
// whitespace, `/` or `>` after the name on the same line, a closing tag
// whitespace or `>`.
const HTML_BLOCK_LINE_RE = /^ {0,3}<(?:[!?]|([a-z]{1,15})[\s/>]|\/([a-z]{1,15})[\s>])/

// Markdown container prefixes the parser strips before it looks at a line:
// blockquote markers (`>` with an optional space, nestable, up to three spaces
// of indent) and, at column 0 only, a list marker with its following spaces.
// An indented list marker is not a container for the renderer (`  - <pre>`
// renders the content inline), hence column 0.
const BLOCKQUOTE_PREFIX_RE = /^ {0,3}> ?/
const LIST_PREFIX_RE = /^(?:[-*+]|\d{1,9}[.)]) +/

interface LineMasks {
  /** Offsets inside a markdown HTML block (raw HTML, <pre>/<code> honoured). */
  block: Uint8Array
  /** Offsets on an indented code line inside a container (nothing renders). */
  code: Uint8Array
}

// Per-offset masks over the ORIGINAL body, computed once before any region is
// blanked, because the parser decides on the original lines: removing a
// leading comment or <style> would otherwise reclassify what follows as
// inline content. Per line: strip the container prefixes, then a line that
// opens a block (see HTML_BLOCK_LINE_RE) and every following line up to the
// next blank one is a block; a remainder indented four spaces inside a
// container is an indented code block. Linear.
function markLines(lower: string): LineMasks {
  const block = new Uint8Array(lower.length)
  const code = new Uint8Array(lower.length)
  let inBlock = false
  // Width of the current list item's content indent, for its continuation
  // lines, and whether that item is a nested one (inline continuation).
  let listIndent = 0
  let nestedItem = false
  let lineStart = 0
  while (lineStart <= lower.length) {
    let lineEnd = lower.indexOf('\n', lineStart)
    if (lineEnd === -1) lineEnd = lower.length
    let line = lower.slice(lineStart, lineEnd)
    // An open HTML block is raw until its blank-line terminator: container
    // markers inside it are text, not markers, so nothing below applies.
    if (inBlock) {
      if (line.trim() === '') {
        inBlock = false
        listIndent = 0
        nestedItem = false
      } else {
        block.fill(1, lineStart, lineEnd)
      }
      lineStart = lineEnd + 1
      continue
    }
    let inContainer = false
    // Container prefixes, in any alternation (`- > <pre>`, `> - <pre>`,
    // `> > - > <pre>`, `- - > <pre>`), all probed: blockquote and list
    // markers strip in any order and any depth, and the remainder is block
    // context, EXCEPT that content directly after a nested list marker (a
    // list marker following a list marker, `- - <pre>`, `> - - <pre>`) is
    // inline, as are the continuation lines of that nested item; a blockquote
    // marker after the nested marker restores block context (`- - > <pre>`).
    let stripped = 0
    let sawList = false
    let lastWasList = false
    let inlineRemainder = false
    for (;;) {
      const bq = BLOCKQUOTE_PREFIX_RE.exec(line)
      if (bq) {
        line = line.slice(bq[0].length)
        stripped += bq[0].length
        lastWasList = false
        inlineRemainder = false
        inContainer = true
        continue
      }
      const lm = LIST_PREFIX_RE.exec(line)
      if (lm) {
        line = line.slice(lm[0].length)
        stripped += lm[0].length
        if (lastWasList) inlineRemainder = true
        sawList = true
        lastWasList = true
        inContainer = true
        continue
      }
      break
    }
    if (sawList) {
      listIndent = stripped
      nestedItem = inlineRemainder
    } else if (listIndent > 0 && line.trim() !== '') {
      let indent = 0
      while (indent < listIndent && line[indent] === ' ') indent++
      if (indent >= Math.min(listIndent, 2)) {
        line = line.slice(indent)
        inContainer = true
        // A nested item's continuation line is inline content too.
        inlineRemainder = nestedItem
      } else {
        listIndent = 0
        nestedItem = false
      }
    }
    const blank = line.trim() === ''
    if (blank) {
      inBlock = false
      listIndent = 0
      nestedItem = false
    } else if (inlineRemainder) {
      // Inline content: neither opens nor continues a block.
      inBlock = false
    } else if (!inBlock && /^(?: {4}|\t)/.test(line)) {
      // An indented code block, judged after the container prefixes and the
      // list item's content indent are gone: four spaces at top level or
      // inside a blockquote are code, while a list item's continuation line
      // indented to its content is not.
      code.fill(1, lineStart, lineEnd)
    } else if (!inBlock) {
      const m = HTML_BLOCK_LINE_RE.exec(line)
      if (m) {
        const tag = m[1] ?? m[2]
        inBlock = tag === undefined || HTML_BLOCK_TAGS.has(tag)
      }
    }
    if (inBlock && !blank) block.fill(1, lineStart, lineEnd)
    lineStart = lineEnd + 1
  }
  return { block, code }
}

// Every strip below is offset-preserving (a blanked character becomes a space,
// newlines stay), so the block mask and every later position stay valid.
const blankChars = (s: string): string => s.replace(/[^\n]/g, ' ')

function blankMatches(text: string, re: RegExp): string {
  return text.replace(re, blankChars)
}

/** One text in two spellings, kept in step: blanking one blanks the other. */
interface Spellings {
  text: string
  lower: string
}

function blankSpans(input: Spellings, open: string, close: string, tagNames: boolean, blockMask: Uint8Array | null): Spellings {
  const { text, lower } = input
  const findOpen = (from: number): number => {
    if (!tagNames) return lower.indexOf(open, from)
    let at = findTag(lower, open, from, OPEN_TAG_NAME_END)
    while (at !== -1 && (Number.isNaN(findOpenTagEnd(lower, at)) || (blockMask !== null && !blockMask[at]))) {
      at = findTag(lower, open, at + open.length, OPEN_TAG_NAME_END)
    }
    return at
  }
  const findClose = (from: number): number =>
    tagNames ? findTag(lower, close, from, CLOSE_TAG_NAME_END) : lower.indexOf(close, from)
  let start = findOpen(0)
  if (start === -1) return input
  // Collect the spans, then rebuild both spellings in one pass.
  const textParts: string[] = []
  const lowerParts: string[] = []
  let from = 0
  while (start !== -1) {
    const end = findClose(start + open.length)
    let to: number
    if (end === -1) {
      to = text.length
    } else if (tagNames) {
      // Through the closing tag's `>` (`</pre>`, `</pre >`).
      const gt = lower.indexOf('>', end + close.length)
      to = gt === -1 ? text.length : gt + 1
    } else {
      to = end + close.length
    }
    const blanked = blankChars(lower.slice(start, to))
    textParts.push(text.slice(from, start), blanked)
    lowerParts.push(lower.slice(from, start), blanked)
    from = to
    start = to >= text.length ? -1 : findOpen(to)
  }
  textParts.push(text.slice(from))
  lowerParts.push(lower.slice(from))
  return { text: textParts.join(''), lower: lowerParts.join('') }
}

function blankMasked(input: Spellings, mask: Uint8Array): Spellings {
  let text = ''
  let lower = ''
  let from = 0
  for (let i = 0; i < mask.length; i++) {
    if (!mask[i]) continue
    let j = i
    while (j < mask.length && mask[j]) j++
    text += input.text.slice(from, i) + blankChars(input.text.slice(i, j))
    lower += input.lower.slice(from, i) + blankChars(input.lower.slice(i, j))
    from = j
    i = j
  }
  if (from === 0) return input
  return { text: text + input.text.slice(from), lower: lower + input.lower.slice(from) }
}

function stripHiddenRegions(text: string): string {
  // ASCII only: offsets in `lower` must match `text` (see asciiLower).
  let spellings: Spellings = { text, lower: asciiLower(text) }
  const { block: blockMask, code: codeMask } = markLines(spellings.lower)
  spellings = blankMasked(spellings, codeMask)
  spellings = blankSpans(spellings, '<!--', '-->', false, null)
  // <style> is dropped by the sanitizer wherever it sits. <pre> and <code> keep
  // their text from being linkified only inside a markdown HTML block; in a
  // paragraph both are inline content and their text renders as prose.
  spellings = blankSpans(spellings, '<style', '</style', true, null)
  // <script> is dropped with its content by the renderer (#1919).
  spellings = blankSpans(spellings, '<script', '</script', true, null)
  spellings = blankSpans(spellings, '<pre', '</pre', true, blockMask)
  spellings = blankSpans(spellings, '<code', '</code', true, blockMask)
  return spellings.text
}
// Requires a closing `)` so broken syntax like `![](url` (no close) doesn't
// match. Also tolerates the optional title form `![](url "title")`. The alt-text
// class excludes `[` (so a `![a](`/`![[[…` run can't be re-scanned at every start),
// while the href quantifier is LENGTH-BOUNDED rather than `[`-excluding so it still
// matches image URLs that legitimately contain a literal `[` (e.g. array query params
// like `?w[]=600`) — the per-position scan stays capped, so it's sub-quadratic on
// untrusted input.
// An angle-bracket destination (`![](<url with spaces>)`, group 1) is read to
// its first unescaped `>` on the line, as the parser reads it (#2156); the
// plain form is group 2.
const MD_IMAGE_RE = /!\[[^[\]]*\]\(\s*(?:<((?:[^<>\n\\]|\\[^\n]){1,2048})>|([^)\s]{1,2048}))(?:\s+["'][^"']*["'])?\s*\)/

// An angle destination in the spelling its plain form has, as the render's
// plainForm writes it: escapes resolved first, then whitespace, controls and
// the ASCII encodeURI encodes percent-encoded (`%` and non-ASCII as written,
// unless a `%` starts no escape: then encodeURI's reading). A `\\` left after
// the unescape is encoded, so the destination decode unescapes nothing again.
const ANGLE_UNSAFE = /[\s\u0000-\u001f\u007f"<>[\\\]^`{|}]/
function angleAsPlain(raw: string, ampEscapes: boolean): string {
  const url = unescapeDestination(raw, ampEscapes)
  if (!ANGLE_UNSAFE.test(url)) return url
  if (/%(?![\da-f]{2})/i.test(url)) {
    let normalized = url
    try {
      normalized = decodeURI(normalized)
    } catch {
      // kept as written, as Remarkable does
    }
    return encodeURI(normalized)
  }
  return url.replace(new RegExp(ANGLE_UNSAFE.source, 'g'), (c) => encodeURIComponent(c))
}
// A markdown image whose URL exceeds MD_IMAGE_RE's length bound (or whose syntax is broken)
// isn't captured by it — leaving `mdMatch` null, or (MD_IMAGE_RE is unanchored) matching a
// *later* image instead. This linear detector (label excludes `[`; no closing `)` required)
// still spots the uncaptured image so findFirstImageUrl can bail to the full parser rather
// than promoting a later HTML/bare/markdown candidate over it.
const MD_IMAGE_PRESENT_RE = /!\[[^[\]]*\]\(\s*[^\s)]/
const HTML_IMAGE_RE = /<img\b[^>]*?\bsrc\s*=\s*["']([^"']+)["']/i
// A standalone (auto-linkified) image URL the renderer turns into an <img> via
// text.method / linkify (IMG_REGEX). Required to sit at a line start or after
// whitespace, or the `>` that closes a wrapping tag such as <center> (group 1),
// so it is NOT a URL already inside ![](), <img src="">, or a [label](href)
// link — avoiding false positives on image-extension URLs that the renderer
// does NOT surface as a standalone image. Same extension set as the renderer's
// IMG_REGEX. Linear-time: one bounded char class + a single greedy `+`, no
// nested quantifier.
// Every http(s) URL token is a candidate; isStandalone() then rejects the
// ones that sit inside another construct, and a classifier decides whether a
// token is an image (by extension) or a YouTube link (by host), in code rather
// than in the pattern: a class followed by a literal it also matches, or a
// repeated group before a literal, is polynomial on crafted input. The token
// pattern itself is one class run, linear on any input. Global, so regexMatches
// can walk the tokens in source order.
// `&lt;`/`&gt;` end a token as `<`/`>` do: the render reads the decoded text.
const URL_TOKEN_RE = /https?:\/\/(?:[^\s<>"'()[\]&]|&(?!lt;|gt;))+/gi
// A YouTube video id as the renderer's YOUTUBE_REGEX captures it.
const YOUTUBE_ID_RE = /^[^"&?/\s]{11}$/

/**
 * The image URL a bare token denotes, or null, read exactly as the render's
 * linkify reads it (imageUrlEnd): an image when the path ends in an image
 * extension, kept whole with its query and fragment, with prose punctuation
 * after a query-less URL left out.
 */
function imageToken(token: string): string | null {
  const end = imageUrlEnd(token)
  if (end === -1) return null
  const url = token.slice(0, end)
  return SAFE_URL_RE.test(url) ? url : null
}

/**
 * The video id of a YouTube URL, read the way the renderer's YOUTUBE_REGEX
 * reads it (`v=` query, `/v/`, `/e/`, `/embed/`, `/shorts/`, `youtu.be/`, or the
 * last segment of a deeper path), with plain string operations so the check is
 * linear on any input. Any subdomain (music., m., www.) counts. Null when the
 * URL is not a YouTube video link.
 */
function youtubeIdOf(url: string): string | null {
  const m = /^https?:\/\/([^/?#]+)/i.exec(url)
  if (!m) return null
  const host = m[1].toLowerCase()
  const isShort = host === 'youtu.be'
  const isFull = host === 'youtube.com' || host.endsWith('.youtube.com')
  if (!isShort && !isFull) return null
  const rest = url.slice(m[0].length)
  const hashAt = rest.indexOf('#')
  const beforeHash = hashAt === -1 ? rest : rest.slice(0, hashAt)
  const qAt = beforeHash.indexOf('?')
  const path = qAt === -1 ? beforeHash : beforeHash.slice(0, qAt)
  const query = qAt === -1 ? '' : beforeHash.slice(qAt + 1)
  const candidate = (value: string | undefined): string | null => {
    const id = value === undefined ? '' : value.slice(0, 11)
    return YOUTUBE_ID_RE.test(id) ? id : null
  }
  if (isFull && query) {
    for (const part of query.split('&')) {
      if (part.startsWith('v=')) {
        const id = candidate(part.slice(2))
        if (id) return id
      }
    }
  }
  const segments = path.split('/').filter((seg) => seg.length > 0)
  if (isShort) return candidate(segments[0])
  if (segments.length >= 2 && ['v', 'e', 'embed', 'shorts'].includes(segments[0].toLowerCase())) {
    return candidate(segments[1])
  }
  if (segments.length >= 3) return candidate(segments[segments.length - 1])
  return null
}

// One linear pass marking every offset that sits inside an HTML tag (between
// a `<` that opens a tag and its closing `>`, quotes respected so a `>` inside
// an attribute value does not end the tag early). A URL in there is an
// attribute value of some shape (`src="..."`, `style="url(...)"`, JSON in a
// `data-*` attribute, `poster=`) and never prose the renderer would linkify.
function isAutolinkAt(text: string, idx: number): boolean {
  // Schemes are case-insensitive: <HTTPS://...> autolinks like <https://...>.
  return /^https?:\/\//i.test(text.slice(idx, idx + 8))
}

function markInsideTags(text: string): Uint8Array {
  const marks = new Uint8Array(text.length)
  let inTag = false
  let quote = ''
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (!inTag) {
      // A markdown autolink `<https://...>` is not a tag: the renderer turns
      // it into a link, and an image or video URL in it into an image.
      if (c === '<' && i + 1 < text.length && /[A-Za-z/!?]/.test(text[i + 1]) && !isAutolinkAt(text, i + 1)) {
        inTag = true
        marks[i] = 1
      }
      continue
    }
    marks[i] = 1
    if (quote) {
      if (c === quote) quote = ''
    } else if (c === '"' || c === "'") {
      quote = c
    } else if (c === '>') {
      inTag = false
    }
  }
  return marks
}

// Whether a URL found at `idx` stands on its own in prose, which is what the
// renderer linkifies into an image or a video poster. Verified against the
// renderer: it does so after whitespace, a closing `>`, and inside
// parentheses, emphasis or quotes alike. It does NOT when the URL is:
//   - anywhere inside a tag (an attribute value of any shape), or
//   - glued to another token (a longer URL, a word, `=`), or
//   - the href of a markdown link `[label](href)`, or the label's start `[`
//     (the `[url](url)` image-link form is found by the link scan instead), or
//   - a markdown image `![alt](href)` (its href follows `](`, handled above;
//     a bare `!` before a URL is prose and the renderer linkifies the URL).
function isStandalone(scan: ScanText, idx: number): boolean {
  if (scan.inTag[idx]) return false
  if (idx === 0) return true
  const text = scan.text
  const prev = text[idx - 1]
  if (/[\w/.:%?&=#[-]/.test(prev)) return false
  const prev2 = idx > 1 ? text[idx - 2] : ''
  if (prev === '(' && prev2 === ']') return false
  return true
}

// Standalone URL tokens in source order, each reduced by `classify` (image
// URL, video id); tokens the classifier rejects are skipped.
function* standaloneMatches(
  scan: ScanText,
  classify: (token: string) => string | null
): Generator<{ url: string; pos: number }> {
  for (const m of regexMatches(scan.text, URL_TOKEN_RE)) {
    const idx = m.index ?? 0
    if (!isStandalone(scan, idx)) continue
    const value = classify(m[0])
    if (value !== null) yield { url: value, pos: idx }
  }
}

function firstStandalone(scan: ScanText, classify: (token: string) => string | null): { url: string; pos: number } | null {
  for (const hit of standaloneMatches(scan, classify)) return hit
  return null
}
// The href of an anchor's opening tag, quoted either way or bare. Preceded by
// whitespace, never by `-`: `data-href` is not the href.
const HREF_ATTR_RE = /\shref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/i
// Whether a quoted attribute value runs straight into the next attribute
// name (`title="x"href=`). The renderer does not read such a tag as an anchor
// at all: it escapes the tag as text and linkifies the URL inside, so the
// scans must leave it alone rather than blank it. A quote-state walk: only a
// CLOSING quote followed by a letter counts.
function hasGluedAttribute(tag: string): boolean {
  let quote = ''
  for (let i = 0; i < tag.length; i++) {
    const c = tag[i]
    if (quote) {
      if (c === quote) {
        quote = ''
        const next = tag[i + 1]
        if (next !== undefined && /[A-Za-z]/.test(next)) return true
      }
    } else if (c === '"' || c === "'") {
      quote = c
    }
  }
  return false
}
// Markdown link `[label](href)` (NOT an image — the `!` is excluded by the
// caller). The renderer (a.method) promotes such a link to an image only when
// the href is an image URL AND the label text equals the href. Used to find the
// `[url](url)` image-link cover form. Global, capture label + href.
// Both the label and href classes exclude `[` so a run of `[`, `[a](`, or `![a](` can't be
// re-scanned to the end of the body at every start position — linear on untrusted content.
// Unlike the image href above, a `[`-containing URL is irrelevant here: this cover form
// requires the label to equal the href, and an unescaped `[`/`]` in a URL breaks the label
// match regardless — so excluding `[` loses nothing and keeps this O(1) per failed start.
const MD_LINK_RE = /\[([^[\]]*)\]\(\s*([^)\s[]+)(?:\s+["'][^"']*["'])?\s*\)/g

// The fast-path bypasses sanitize-html (which the full markdown pipeline
// applies). The sanitizer only preserves http/https <img> sources — ftp,
// data, javascript, relative, etc. are all dropped. Mirror that policy here
// so the fast-path can never surface an image the full path would have
// dropped. Anything else returns null and falls back to the sanitized parse.
const SAFE_URL_RE = /^https?:\/\//i

// Mirrors a.method's `href.match(IMG_REGEX)` — an http(s) URL with an image
// extension anywhere after a dot, matching the renderer. Two anchored tests
// rather than one `.*\.` pattern, so the check is linear on any input.
// Eligibility for an avif <source> is then decided separately by
// isPictureEligibleRawUrl.
const IMG_EXT_RE = /\.(?:tiff?|jpe?g|gif|png|svg|ico|heic|webp|arw)/i
const isImageHref = (href: string): boolean =>
  SAFE_URL_RE.test(href) && IMG_EXT_RE.test(href) && imageUrlEnd(href) !== -1

/**
 * Fast-path: extract the first image URL from raw markdown without rendering
 * the whole post. Returns null if nothing matches *unambiguously* — when in
 * doubt, the caller falls back to the full markdown2Html → DOM parse path.
 *
 * @param includeBareUrls when true (only getEntryImageRawUrl, for the LCP
 *   preload), also consider standalone bare image URLs the renderer
 *   auto-linkifies into images — so a post whose first body image is a bare URL
 *   (and which has no json_metadata.image thumbnail) is still discovered. The
 *   default (false) keeps catchPostImage / getImage / og-image behavior
 *   byte-identical.
 */
function findFirstImageUrl(body: string, includeBareUrls = false): string | null {
  return findFirstImageCandidate(prepareBody(body), includeBareUrls).candidate?.url ?? null
}

/**
 * Whether the render turns `[label](href)` into an image: a.method compares
 * the href as the DOM reads it with the label's serialized HTML, `&amp;` read
 * as `&` on both sides. Both were written as markdown, so both hold the text
 * with complete references decoded; the label is then serialized again, which
 * escapes `&`, `<` and `>` (#2098: `&amp;amp;` and `&lt;` labels stay links).
 */
function promotesToImage(label: string, href: string): boolean {
  const deAmp = (value: string) => value.replace(/&amp;/g, '&')
  const serialized = decodeCompleteReferences(label.trim())
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
  return deAmp(decodeCompleteReferences(href.trim())) === deAmp(serialized)
}

// A control character the destination decodes to (`&Tab;`): the render reads
// it its own way, and a guessed preload is a wasted download.
const CONTROL_CHAR_RE = /[\u0000-\u001f\u007f]/

// Characters Autolinker 3 (Remarkable's linkify) takes in a URL
// (regex-lib.js): letters, marks and decimal digits (as Unicode properties),
// its emoji list (copied as written, read one UTF-16 unit at a time as it
// reads it, so without the u flag), and the punctuation url-matcher.js allows
// in a path, query or fragment; a URL ends on one of AUTOLINK_END.
const AUTOLINK_ALNUM = /[\p{L}\p{Nd}\p{M}]/u
const AUTOLINK_EMOJI = /[\u2700-\u27bf\udde6-\uddff\ud800-\udbff\udc00-\udfff\ufe0e\ufe0f\u0300-\u036f\ufe20-\ufe23\u20d0-\u20f0\ud83c\udffb-\udfff\u200d\u3299\u3297\u303d\u3030\u24c2\ud83c\udd70-\udd71\udd7e-\udd7f\udd8e\udd91-\udd9a\udde6-\uddff\ude01-\ude02\ude1a\ude2f\ude32-\ude3a\ude50-\ude51\u203c\u2049\u25aa-\u25ab\u25b6\u25c0\u25fb-\u25fe\u00a9\u00ae\u2122\u2139\udc04\u2600-\u26FF\u2b05\u2b06\u2b07\u2b1b\u2b1c\u2b50\u2b55\u231a\u231b\u2328\u23cf\u23e9-\u23f3\u23f8-\u23fa\udccf\u2935\u2934\u2190-\u21ff]/
const AUTOLINK_PUNCT = "-+&@#/%=~_()|'$*[]{}?!:,.;^\u2713"
const AUTOLINK_END = "-+&@#/%=~_()|'$*[]{}\u2713"
const autolinkWordChar = (c: string): boolean => AUTOLINK_ALNUM.test(c) || AUTOLINK_EMOJI.test(c)
const AUTOLINK_CLOSE: Record<string, string> = { ')': '(', ']': '[', '}': '{' }

/**
 * Where Autolinker 3.16 ends a scheme URL at the start of `text` (decoded
 * markdown text, as the render's linkify reads it, #2157), ported from
 * url-matcher.js: the host's labels (getDomainNameStr: a word character, then
 * word characters, `-` and `_`, ending on a word character, joined by dots),
 * a port, then a path, query or fragment to its last allowed end character;
 * then a trailing `?` dropped, and either one closing bracket the match does
 * not open dropped, or the match cut where matchHasInvalidCharAfterTld cuts it.
 */
function autolinkUrlEnd(text: string): number {
  const scheme = /^https?:\/\//i.exec(text)
  if (!scheme) return 0
  const hostStart = scheme[0].length
  let end = hostStart
  let pos = hostStart
  while (pos < text.length && autolinkWordChar(text[pos])) {
    let k = pos
    let lastWord = pos
    while (k < text.length && (autolinkWordChar(text[k]) || text[k] === '-' || text[k] === '_')) {
      if (autolinkWordChar(text[k])) lastWord = k
      k++
    }
    end = lastWord + 1
    if (text[end] !== '.' || !autolinkWordChar(text[end + 1] ?? '')) break
    pos = end + 1
  }
  if (end === hostStart) return 0
  // UrlMatchValidator.containsMultipleDots: `..` before the first `/` after
  // the `//` (a query or fragment with no path included) refuses the match.
  const slash = text.indexOf('/', hostStart)
  const head = slash === -1 ? text.slice(hostStart) : text.slice(hostStart, slash)
  if (head.includes('..')) return 0
  const port = /^:[0-9]+/.exec(text.slice(end))
  if (port) end += port[0].length
  if (end < text.length && '/?#'.includes(text[end])) {
    let last = end + 1
    for (let i = end + 1; i < text.length; i++) {
      const c = text[i]
      const word = autolinkWordChar(c)
      if (!word && !AUTOLINK_PUNCT.includes(c)) break
      if (word || AUTOLINK_END.includes(c)) last = i + 1
    }
    end = last
  }
  if (text[end - 1] === '?') end--
  const open = AUTOLINK_CLOSE[text[end - 1]]
  if (open) {
    let depth = 0
    for (let i = 0; i < end - 1; i++) {
      if (text[i] === open) depth++
      else if (text[i] === text[end - 1]) depth = Math.max(depth - 1, 0)
    }
    if (depth === 0) return end - 1
  }
  // matchHasInvalidCharAfterTld: the longest `[-.w]*[-w]\.[-w]+` after the
  // `//` (w a word character), and a cut there when what follows is not one
  // of `[-.A-Za-z0-9:/?#]`. One pass: the match may end after any [-w] whose
  // segment since the last dot is non-empty, that dot having a [-w] before it.
  let tld = -1
  let dotOk = false
  for (let i = hostStart; i < end; i++) {
    const c = text[i]
    if (c === '.') {
      dotOk = i > hostStart && text[i - 1] !== '.'
    } else if (c === '-' || autolinkWordChar(c)) {
      if (dotOk) tld = i + 1
    } else {
      break
    }
  }
  if (tld !== -1 && tld < end && !/[-.A-Za-z0-9:/?#]/.test(text[tld])) return tld
  return end
}

/**
 * A URL in markdown text without the trailing sentence punctuation the
 * autolinker leaves out, after a query or fragment too (verified against the
 * render). A `;` that closes a reference (`&copy;`) belongs to the URL: the
 * parser reads the reference before the autolinker sees the text, and a URL
 * in a reference definition or a raw anchor's text is not autolinked at all.
 */
function withoutTrailingPunctuation(url: string, after: string): string {
  // `URL.)`: the autolinker drops the unmatched `)` and keeps the `.`. A raw
  // anchor's text is not autolinked at all.
  if (after.startsWith(')') || /^<\/a[\s>]/i.test(after)) return url
  let end = url.length
  while (end > 0) {
    const c = url[end - 1]
    if (c === ';' && /&#?[a-z\d]+$/i.test(url.slice(Math.max(0, end - 34), end - 1))) break
    if (!'.,;:!?'.includes(c)) break
    end--
  }
  return url.slice(0, end)
}

// The render's own linkify token (linkify.method), for text in an HTML block,
// which the markdown parser leaves raw and the DOM then decodes.
const HTML_TEXT_URL_RE = /^https?:\/\/(?:[^\s<>"'&]|&(?!lt;|gt;))+/i

/**
 * HTML text as the render's DOM decodes it: a reference only when its whole
 * name is one (`&times=2` is `×=2`, `&reg` is `®`), never a name that merely
 * starts with one (`&region=eu`, `&notify=1` stay as written).
 */
function decodeHtmlText(text: string): string {
  return text.replace(/&(?:#\d{1,7};?|#[xX][\da-fA-F]{1,6};?|([A-Za-z][A-Za-z\d]{0,31});?)/g, (ref, name?: string) => {
    if (name === undefined) return decodeEntities(ref)
    const whole = decodeHTMLStrict(`&${name};`)
    return whole === `&${name};` ? ref : whole
  })
}

// Lower-case ASCII only: the line model needs tag names, and every offset must
// stay where it is (`İ`.toLowerCase() is two characters).
const asciiLower = (text: string): string => text.replace(/[A-Z]+/g, (run) => run.toLowerCase())

/**
 * The image URL a bare URL at `pos` inside an HTML block renders as: the DOM
 * decodes the text with HTML text rules (`&times=2` is `×=2`, `\&copy;` is
 * `\©`), then linkify reads its token from the decoded text (parentheses
 * included). Null when that token is not an image.
 */
function htmlTextImageUrl(body: string, pos: number): string | null {
  let end = pos
  while (end < body.length && !/[\s<]/.test(body[end])) end++
  const token = HTML_TEXT_URL_RE.exec(decodeHtmlText(body.slice(pos, end)))?.[0]
  if (!token) return null
  const urlEnd = imageUrlEnd(token)
  return urlEnd === -1 ? null : decodeDomImageSrc(token.slice(0, urlEnd))
}

// The first body image as the render will proxy it: decoded by where it came
// from, an HTML attribute, a markdown destination, HTML block text or markdown
// text (#2092, #2098). Null rather than a guess where the render differs.
function firstBodyImageRawUrl(body: string): string | null {
  return bodyImageRawUrl(body, prepareBody(body))
}

// The emphasis marker characters that open a run before `pos` on its line:
// a `*`, `_` or `~` with no whitespace after it and whitespace, punctuation or
// the line start before it.
function emphasisOpeners(body: string, pos: number): string {
  let found = ''
  for (let i = pos - 1; i >= 0 && body[i] !== '\n'; i--) {
    const c = body[i]
    if (!'*_~'.includes(c) || found.includes(c)) continue
    const next = body[i + 1] ?? ''
    const prev = i > 0 ? body[i - 1] : '\n'
    if (next && !/\s/.test(next) && (/[\s\p{P}\p{S}]/u.test(prev))) found += c
  }
  return found
}

// The text a bare URL at `pos` sits in, as the inline parser leaves it for
// linkify: to whitespace or `<`, and before a `[`, which may open a link,
// image or footnote (develop's reading; the render keeps the `[` only when no
// such construct parses, which is rare in a URL).
function markdownTextSpan(body: string, pos: number): string {
  let end = pos
  while (end < body.length && !/[\s<[]/.test(body[end])) end++
  // A trailing run of emphasis markers is the parser's closer (`**url**`,
  // `*Source: url*`), read on the raw text so one written as a reference
  // (`&#42;`) stays.
  // Only a marker an opener before the URL on its line can close (`**url**`,
  // `*Source: url*`); an unpaired one is the URL's, as the render reads it.
  // A sentence mark around the closer (`**url**.`, `*url.*`) goes with it; a
  // `;` never does, as it may end a reference (`&lt;`).
  const openers = emphasisOpeners(body, pos)
  let run = end
  let marker = false
  while (run > pos && '*_~.,:!?'.includes(body[run - 1])) {
    const c = body[run - 1]
    if ('*_~'.includes(c)) {
      if (!openers.includes(c)) break
      marker = true
    }
    run--
  }
  return body.slice(pos, marker ? run : end)
}

// Whether `pos` starts a reference definition's destination: `]:`, then
// spaces and at most one line break.
function definitionDestinationAt(body: string, pos: number): boolean {
  let k = pos - 1
  const skipBlanks = () => {
    while (k >= 0 && (body[k] === ' ' || body[k] === '\t')) k--
  }
  skipBlanks()
  if (body[k] === '\n') {
    k--
    skipBlanks()
  }
  return k >= 1 && body[k] === ':' && body[k - 1] === ']'
}

function bodyImageRawUrl(body: string, prepared: PreparedBody): string | null {
  const candidate = findFirstImageCandidate(prepared, true).candidate
  if (!candidate) return null
  if (candidate.html) return decodeDomImageSrc(decodeAttributeEntities(candidate.url))
  const ampEscapes = !hasAmpSentinel(body)
  if (candidate.destination) {
    const url = decodeRawBodyImageSrc(candidate.url, true, ampEscapes)
    return CONTROL_CHAR_RE.test(url) ? null : url
  }
  // A bare URL: raw text of an HTML block, or markdown text. Lines are read
  // with code already blanked (a `<div>` inside a fence opens no block); the
  // blanking keeps every offset.
  if (markLines(asciiLower(codeBlanked(body))).block[candidate.pos]) return htmlTextImageUrl(body, candidate.pos)
  // A raw anchor's text and a reference definition's destination are not
  // autolinked: the token is read as before.
  const after = body.slice(candidate.pos + candidate.url.length, candidate.pos + candidate.url.length + 4)
  if (/^<\/a[\s>]/i.test(after) || definitionDestinationAt(body, candidate.pos)) {
    const url = withoutTrailingPunctuation(candidate.url, after)
    return imageUrlEnd(url) === -1 ? null : decodeRawBodyImageSrc(url, false, ampEscapes)
  }
  // Markdown text: decoded as the parser decodes it, then read to where the
  // render's linkify (Autolinker) ends the URL (#2157).
  const text = decodeCompleteReferences(markdownTextSpan(body, candidate.pos).replace(/\\&/g, '&amp;'))
    .replace(/[\ud800-\udbff][\udc00-\udfff]|[\ud800-\udfff]/g, (c) => (c.length === 2 ? c : '\ufffd'))
  const url = text.slice(0, autolinkUrlEnd(text))
  return imageUrlEnd(url) === -1 ? null : decodeDomImageSrc(url)
}

// Fenced blocks and inline code blanked, offsets kept, nothing else touched:
// a comment, <style> or <script> line still opens an HTML block for the line
// model, while a tag inside code does not.
function codeBlanked(body: string): string {
  return blankMatches(blankMatches(blankMatches(body, BACKTICK_FENCE_RE), TILDE_FENCE_RE), INLINE_CODE_RE)
}

function stripCodeRegions(body: string): string {
  let text = blankMatches(body, BACKTICK_FENCE_RE)
  text = blankMatches(text, TILDE_FENCE_RE)
  text = blankMatches(text, INLINE_CODE_RE)
  // Indented code blocks are blanked by the line model (markLines), which
  // knows the container context a four-space indent has to be read in.
  return stripHiddenRegions(text)
}

// Blank (offset-preserving, so positions stay comparable) every anchor the
// renderer would not promote. Verified against the renderer, the two
// promotions use different tests: a video link is promoted when the anchor's
// textContent equals its href (nested <span> and the like allowed), an image
// link when the anchor's FIRST text child equals its href (`URL<span>x</span>`
// is promoted, `URL caption` and `<span>x</span>URL` are not). Entities are
// decoded on both sides, as the DOM exposes them. See HTML_ANCHOR_RE.
// An HTML anchor's text sits right after a `>`, so the standalone-position rule
// would read an image or video URL used as link TEXT as a bare URL. The
// renderer only promotes such an anchor when the text equals the href
// (a.method), so anchors whose text differs are blanked before the bare scans.
// A scan rather than a regex: the opening tag's end is found quote-aware (a
// `>` inside a title must not end it), and the href may be quoted or bare.
function blankUnequalAnchors(cleaned: string, textContent: boolean): string {
  const lower = asciiLower(cleaned)
  // An unterminated opener is read to the end of its line; thousands of them
  // on one line would make every read go to that end. A shared budget of a
  // few passes over the body bounds the total: past it, an opener counts as
  // unterminated, which a real post never reaches.
  const budget = { left: cleaned.length * 4 + 1024 }
  // Output chunks, joined once: rebuilding the string per anchor is quadratic
  // on a body with thousands of anchors.
  const parts: string[] = []
  let from = 0
  let at = findTag(lower, '<a', 0, OPEN_TAG_NAME_END)
  while (at !== -1) {
    const gt = findOpenTagEnd(lower, at, budget)
    if (Number.isNaN(gt) || gt === -1 || hasGluedAttribute(cleaned.slice(at, gt))) {
      // Broken, self-closing or malformed: not an anchor around any text.
      at = findTag(lower, '<a', at + 2, OPEN_TAG_NAME_END)
      continue
    }
    const closeAt = findTag(lower, '</a', gt + 1, CLOSE_TAG_NAME_END)
    const innerEnd = closeAt === -1 ? cleaned.length : closeAt
    let spanEnd = cleaned.length
    if (closeAt !== -1) {
      const closeGt = lower.indexOf('>', closeAt + 3)
      spanEnd = closeGt === -1 ? cleaned.length : closeGt + 1
    }
    const hrefMatch = HREF_ATTR_RE.exec(cleaned.slice(at, gt))
    const href = hrefMatch ? (hrefMatch[1] ?? hrefMatch[2] ?? hrefMatch[3] ?? '') : ''
    const inner = cleaned.slice(gt + 1, innerEnd)
    let text: string
    if (textContent) {
      text = stripHtmlTags(inner)
    } else {
      // The first text child ends at the first real tag start; a literal `<`
      // in prose (`URL < caption`) is part of that text and breaks equality.
      const firstTag = inner.search(/<[A-Za-z/!]/)
      text = firstTag === -1 ? inner : inner.slice(0, firstTag)
    }
    if (!href || decodeEntities(text.trim()) !== decodeEntities(href.trim())) {
      parts.push(cleaned.slice(from, at), blankChars(cleaned.slice(at, spanEnd)))
      from = spanEnd
    }
    at = spanEnd >= cleaned.length ? -1 : findTag(lower, '<a', spanEnd, OPEN_TAG_NAME_END)
  }
  if (parts.length === 0) return cleaned
  parts.push(cleaned.slice(from))
  return parts.join('')
}

/** One scan text plus its inside-a-tag marks. */
interface ScanText {
  text: string
  inTag: Uint8Array
}

/**
 * The body with every region the page never shows removed, plus the two
 * anchor-blanked variants the bare scans need (image rule and video rule, see
 * blankUnequalAnchors), each with its inside-a-tag marks. Computed once per
 * lookup; every scan below works on these.
 */
interface PreparedBody {
  cleaned: string
  image: ScanText
  video: ScanText
}

const EMPTY_SCAN: ScanText = { text: '', inTag: new Uint8Array(0) }

function prepareBody(body: string): PreparedBody {
  const cleaned = body ? stripCodeRegions(body) : ''
  if (!cleaned) return { cleaned, image: EMPTY_SCAN, video: EMPTY_SCAN }
  const imageText = blankUnequalAnchors(cleaned, false)
  const videoText = blankUnequalAnchors(cleaned, true)
  return {
    cleaned,
    image: { text: imageText, inTag: markInsideTags(imageText) },
    video: { text: videoText, inTag: markInsideTags(videoText) }
  }
}

interface ImageCandidate {
  url: string
  /** Offset in the code-stripped body, for source-order comparisons. */
  pos: number
  /**
   * Taken from a raw HTML attribute (`<img src>`): its references decode the
   * way the render reads an attribute, not as a markdown destination (#2092).
   */
  html?: boolean
  /** A markdown destination (`![](url)`, `[url](url)`): unescaped as Remarkable does. */
  destination?: boolean
}

/**
 * The poster image the renderer would produce for the first standalone YouTube
 * URL in the body, with its position, or null. Fast-mode only: the full render
 * discovers these itself through text.method / a.method.
 */
function findFirstVideoPoster(prepared: PreparedBody): ImageCandidate | null {
  const { cleaned } = prepared
  if (!cleaned) return null
  let best: ImageCandidate | null = null
  // The first YouTube URL that actually carries a video id: a channel or
  // playlist link earlier in the body must not hide a later watch link.
  for (const hit of standaloneMatches(prepared.video, youtubeIdOf)) {
    best = { url: hit.url, pos: hit.pos }
    break
  }
  // `[url](url)` form: a.method turns a link whose text equals its href into
  // the same poster. Take it only when it comes before the bare form.
  for (const m of regexMatches(cleaned, MD_LINK_RE)) {
    const idx = m.index ?? 0
    if (idx > 0 && cleaned[idx - 1] === '!') continue
    if (best && idx >= best.pos) break
    const href = m[2]
    if (href && m[1].trim() === href) {
      const id = youtubeIdOf(href)
      if (id) {
        best = { url: id, pos: idx }
        break
      }
    }
  }
  if (!best) return null
  // Byte-identical to text.method / a.method: id without a trailing query.
  return { url: `https://img.youtube.com/vi/${best.url.split('?')[0]}/hqdefault.jpg`, pos: best.pos }
}

interface CandidateResult {
  candidate: ImageCandidate | null
  /**
   * A markdown image is present but the regex refused to decide (a URL with a
   * parenthesis, one over the length bound, broken syntax before the capture).
   * The full render resolves it; a regex-only caller must not pick anything
   * else in its place.
   */
  ambiguous: boolean
}

const NONE: CandidateResult = { candidate: null, ambiguous: false }
const AMBIGUOUS: CandidateResult = { candidate: null, ambiguous: true }

function findFirstImageCandidate(prepared: PreparedBody, includeBareUrls = false): CandidateResult {
  const { cleaned } = prepared
  if (!cleaned) return NONE

  const mdMatch = cleaned.match(MD_IMAGE_RE)
  const htmlMatch = cleaned.match(HTML_IMAGE_RE)

  // If markdown image syntax is present at all, it must be unambiguous. The
  // capture class `[^)\s]+` excludes `)`, so a captured URL containing `(`
  // means the URL was truncated mid-paren (e.g., a real
  // `https://x.com/path_(a)_full.jpg`). When ambiguous, bail and let the full
  // markdown parser handle it — returning a truncated URL would be wrong.
  // An angle destination is whole whatever it holds; a plain one with `(` may
  // have been cut short by the capture class.
  const mdUrl = mdMatch ? (mdMatch[1] !== undefined ? angleAsPlain(mdMatch[1], !hasAmpSentinel(cleaned)) : mdMatch[2]) : undefined
  if (mdMatch) {
    const url = mdUrl
    if (!url || !SAFE_URL_RE.test(url) || (mdMatch[1] === undefined && url.includes('('))) {
      return AMBIGUOUS
    }
  }
  // MD_IMAGE_RE is unanchored, so a markdown image can go uncaptured (URL over the length
  // bound, or broken syntax) while `mdMatch` is null OR is a *later* image. If any such
  // uncaptured image sits before what we captured (or nothing was captured), bail to the full
  // parser so it resolves the true first image rather than promoting a later HTML/bare/markdown
  // candidate.
  const priorRegion = mdMatch ? cleaned.slice(0, mdMatch.index ?? 0) : cleaned
  if (MD_IMAGE_PRESENT_RE.test(priorRegion)) {
    return AMBIGUOUS
  }

  // Collect valid candidates with their source position; the rendered document
  // surfaces whichever image appears first in source order.
  const candidates: ImageCandidate[] = []
  if (mdMatch && mdUrl) candidates.push({ url: mdUrl, pos: mdMatch.index ?? 0, destination: true })
  if (htmlMatch && htmlMatch[1] && SAFE_URL_RE.test(htmlMatch[1])) {
    candidates.push({ url: htmlMatch[1], pos: htmlMatch.index ?? 0, html: true })
  }
  if (includeBareUrls) {
    const bareMatch = firstStandalone(prepared.image, imageToken)
    if (bareMatch && SAFE_URL_RE.test(bareMatch.url)) {
      candidates.push(bareMatch)
    }
    // `[url](url)` image-link form: a markdown link the renderer promotes to an
    // image (a.method) — href is an image URL and the label text equals it.
    // Skip `![...]()` images (preceding `!`). Take the earliest such link.
    for (const m of regexMatches(cleaned, MD_LINK_RE)) {
      const idx = m.index ?? 0
      if (idx > 0 && cleaned[idx - 1] === '!') continue // it's an image ![](), handled above
      const href = m[2]
      if (href && isImageHref(href) && promotesToImage(m[1], href)) {
        candidates.push({ url: href, pos: idx, destination: true })
        break
      }
    }
  }

  if (candidates.length === 0) return NONE
  candidates.sort((a, b) => a.pos - b.pos)
  return { candidate: candidates[0], ambiguous: false }
}

/**
 * Everything fast mode can find without rendering markdown: the regex tiers
 * including standalone bare image URLs, plus the YouTube poster the full render
 * would have produced, whichever comes first in the source. Returns the same
 * proxied URL the full render's first <img> would have carried, or null.
 */
function fastBodyImage(body: string, width: number, height: number, format: string): string | null {
  const prepared = prepareBody(body)
  // Same precedence as the full lookup: a markdown or HTML image found by the
  // regex wins outright, because the full lookup returns it before it would
  // ever render the markdown and notice an earlier poster or bare URL.
  const strict = findFirstImageCandidate(prepared, false)
  if (strict.candidate) {
    return proxifyFound(strict.candidate.url, width, height, format)
  }
  // A markdown image the regex could not decide on: the full render would
  // resolve it, and it may well come first. Nothing else may stand in for it.
  if (strict.ambiguous) {
    return null
  }
  // Otherwise the full lookup would render and take the first <img> in source
  // order, which is a bare image URL or a video poster.
  const bare = findFirstImageCandidate(prepared, true).candidate
  const poster = findFirstVideoPoster(prepared)
  if (poster && (!bare || poster.pos < bare.pos)) {
    // The rendered poster <img> carries the 0x0 proxied URL; re-proxying it at
    // the requested size is exactly what the full render path does with it.
    return proxifyFound(proxifyImageSrc(poster.url, 0, 0, 'match'), width, height, format)
  }
  return bare ? proxifyFound(bare.url, width, height, format) : null
}

// json_metadata is whatever the publishing client wrote: `thumbnails` has been
// seen as a string, an array of strings, an array with junk in it, and a
// non-array. Return the first usable URL or undefined, never throw.
function firstMetaUrl(value: unknown): string | undefined {
  if (typeof value === 'string' && value.trim().length > 0) {
    return value
  }
  if (Array.isArray(value)) {
    return value.find((url): url is string => typeof url === 'string' && url.trim().length > 0)
  }
  return undefined
}

// The memo key does not cover json_metadata, and a takedown can change only the
// metadata (a body that already reads as the notice), so a hit also has to
// match the two fields getImage reads. Parsed the way getImage parses it, so
// the string and object forms of one metadata fingerprint alike. Fields that do
// not serialise get a fresh object, which never matches, so that entry is
// simply not served from memo.
function metaFingerprint(jsonMetadata: unknown): unknown {
  let meta: any
  if (typeof jsonMetadata === 'object') {
    meta = jsonMetadata
  } else {
    try {
      meta = JSON.parse(jsonMetadata as string)
    } catch {
      meta = null
    }
  }
  try {
    return JSON.stringify([meta?.thumbnails, meta?.image])
  } catch {
    return {}
  }
}

function proxifyFound(src: string, width: number, height: number, format: string): string {
  return proxifyImageSrc(decodeEntities(src), width, height, format)
}

function getImage(entry: Entry, width: number, height: number, format: string, renderFirstImage: RenderFirstImage | null): string | null {
  /*
  * Return from json metadata if exists
  * */
  let meta: Entry['json_metadata'] | null

  if (typeof entry.json_metadata === 'object') {
    meta = entry.json_metadata
  } else {
    try {
      meta = JSON.parse(entry.json_metadata as string)
    } catch (e) {
      meta = null
    }
  }

  // An explicit thumbnail wins over the cover image: `thumbnails` exists for
  // exactly this purpose (3Speak, Liketu, the editor's thumbnail picker) and
  // publishers do set it to something other than the first body image.
  // A thumbnail that does not proxify (malformed, over the length bound) must
  // not suppress a valid cover below, so only a non-empty result is returned.
  const thumbnail = firstMetaUrl(meta?.thumbnails)
  if (thumbnail) {
    const proxied = proxifyImageSrc(decodeEntities(thumbnail), width, height, format)
    if (proxied) {
      return proxied
    }
  }

  if (meta && typeof meta.image === 'string' && meta.image.length > 0) {
    // Decode HTML entities (e.g., &amp; -> &) before proxifying
    return proxifyImageSrc(decodeEntities(meta.image), width, height, format)
  }

  if (meta && meta.image && !!meta.image.length && meta.image[0]) {
    // Only decode if it's a string, otherwise pass through to proxifyImageSrc which will return ''
    if (typeof meta.image[0] === 'string') {
      // Decode HTML entities (e.g., &amp; -> &) before proxifying
      return proxifyImageSrc(decodeEntities(meta.image[0]), width, height, format)
    }
    // For non-string types, let proxifyImageSrc handle it (returns '')
    return proxifyImageSrc(meta.image[0], width, height, format)
  }

  // Fast mode never renders markdown: regex tiers (bare URLs included) and the
  // YouTube poster, or null. The caller would rather show no thumbnail than pay
  // for a full markdown render on a body none of that found an image in.
  if (!renderFirstImage) {
    return fastBodyImage(entry.body, width, height, format)
  }

  // Fast-path: try to find the first image with a regex over the raw body.
  // Avoids the cost of full markdown2Html + DOM parsing for the common case.
  const fast = findFirstImageUrl(entry.body)
  if (fast) {
    return proxifyFound(fast, width, height, format)
  }

  // Fall back to the full markdown render (handles edge cases the regex missed)
  const src = renderFirstImage(entry)
  return src ? proxifyFound(src, width, height, format) : null
}

/**
 * The RAW (pre-proxify) URL of the image an entry's BODY renders first:
 * json_metadata.image, then the first body image. Deliberately NOT the same
 * order as catchPostImage, which reads json_metadata.thumbnails ahead of
 * image: a thumbnail is a card concern and the post body never renders it, so
 * a preload built from it would be wasted. Unlike catchPostImage it does NOT
 * proxify — callers need the original URL (e.g. to test picture-eligibility
 * for an LCP preload, since catchPostImage returns an already-proxified /p/
 * URL). Returns null when the fast path finds no unambiguous image (the caller
 * can fall back to catchPostImage).
 */
/**
 * The RAW (pre-proxify) URL of the image a CARD renders.
 *
 * Mirrors catchPostImage's precedence — `json_metadata.thumbnails` first, then
 * `json_metadata.image`, then the first body image — which is NOT the order
 * getEntryImageRawUrl uses: that one answers a body/LCP-preload question and
 * deliberately skips thumbnails. Use this when a caller has to reason about the
 * file the card will actually request (its extension, say), or it can end up
 * inspecting one asset while the card renders another.
 */
export function getEntryCardImageRawUrl(obj: Entry | string): string | null {
  if (typeof obj === 'string') {
    return getEntryImageRawUrl(obj)
  }

  let meta: Entry['json_metadata'] | null
  if (typeof obj.json_metadata === 'object') {
    meta = obj.json_metadata
  } else {
    try {
      meta = JSON.parse(obj.json_metadata as string)
    } catch (e) {
      meta = null
    }
  }

  const thumbnail = firstMetaUrl(meta?.thumbnails)
  if (thumbnail) {
    return decodeImageSrc(thumbnail)
  }

  return getEntryImageRawUrl(obj)
}

// The metadata cover an entry declares (`json_metadata.image`, a string or the
// first of an array), decoded as the render decodes it, or null.
function metaCoverRawUrl(obj: Entry): string | null {
  let meta: Entry['json_metadata'] | null
  if (typeof obj.json_metadata === 'object') {
    meta = obj.json_metadata
  } else {
    try {
      meta = JSON.parse(obj.json_metadata as string)
    } catch (e) {
      meta = null
    }
  }
  if (meta && typeof meta.image === 'string' && meta.image.length > 0) {
    return decodeImageSrc(meta.image)
  }
  if (meta && meta.image && !!meta.image.length && typeof meta.image[0] === 'string' && meta.image[0].length > 0) {
    return decodeImageSrc(meta.image[0])
  }
  return null
}

/**
 * The image an entry page shows first, for its LCP preload (#2119): the
 * metadata cover, else the first body image or YouTube poster in source order,
 * flagged `poster` when it is a poster (the body renders that as a plain
 * format=match <img>, not a <picture>). Null when the regex scan cannot decide
 * (a markdown image it cannot read may come first). getEntryImageRawUrl keeps
 * ignoring posters: feed cards rank a regex-found image above an earlier one.
 */
export function getEntryLcpImage(obj: Entry): { url: string; poster: boolean } | null {
  const cover = metaCoverRawUrl(obj)
  if (cover) {
    return { url: cover, poster: false }
  }
  const prepared = prepareBody(obj.body)
  const found = findFirstImageCandidate(prepared, true)
  if (found.ambiguous) {
    return null
  }
  const poster = findFirstVideoPoster(prepared)
  if (poster && (!found.candidate || poster.pos < found.candidate.pos)) {
    return { url: poster.url, poster: true }
  }
  const url = bodyImageRawUrl(obj.body, prepared)
  return url ? { url, poster: false } : null
}

export function getEntryImageRawUrl(obj: Entry | string): string | null {
  // Decode with the SAME pipeline the renderer applies to the in-body <img>
  // (decodeImageSrc: entities then percent-encoding), so the LCP preload's
  // proxy hash byte-matches the body's <picture> avif <source> for &amp; /
  // %-encoded / non-ASCII cover URLs (otherwise the preload is wasted and the
  // LCP image double-downloads).
  if (typeof obj === 'string') {
    return firstBodyImageRawUrl(obj)
  }
  return metaCoverRawUrl(obj) ?? firstBodyImageRawUrl(obj.body)
}

/**
 * The first <img> src of the full render of a body, or null: catchPostImage's
 * last tier. Passed in by catch-post-image.ts so this module never imports the
 * markdown renderer, and a bundle that only needs card images leaves the
 * markdown and sanitize stack out (#2113).
 */
export type RenderFirstImage = (obj: Entry | string) => string | null

/**
 * The image lookup behind catchPostImage and getEntryCardImage, memoized per
 * entry. Without `renderFirstImage` it never renders markdown: metadata, the
 * regex tiers and the video poster only.
 */
export function lookupPostImage(
  obj: Entry | string,
  width: number,
  height: number,
  format: string,
  renderFirstImage: RenderFirstImage | null
): string | null {
  if (typeof obj === 'string') {
    // Process string directly to avoid cache key collision
    // Don't create Entry wrapper as it would generate invalid cache keys
    if (!renderFirstImage) {
      return fastBodyImage(obj, width, height, format)
    }
    // Fast-path: regex over raw markdown
    const fast = findFirstImageUrl(obj)
    if (fast) {
      return proxifyFound(fast, width, height, format)
    }
    const src = renderFirstImage(obj)
    return src ? proxifyFound(src, width, height, format) : null
  }
  // Fast and full lookups can legitimately disagree (null vs a markdown-only
  // find), so they get separate slots rather than the first caller deciding for
  // both.
  const key = `${makeEntryCacheKey(obj)}-${width}x${height}-${format}${renderFirstImage ? '' : '-fast'}`

  // A null result is memoized too. Recomputing it is the expensive case: the
  // markdown tier ran, found nothing, and would run again on the next request.
  const meta = metaFingerprint(obj.json_metadata)
  const item = entryMemoGet<string | null>(key, obj.body, meta)
  if (item !== MEMO_MISS) {
    return item
  }

  const res = getImage(obj, width, height, format, renderFirstImage)
  entryMemoSet(key, obj.body, meta, res)

  return res
}

/**
 * The proxied image a feed card shows: catchPostImage(..., { fast: true })
 * without the markdown renderer, so a card bundle stays free of it (#2113).
 * Metadata (thumbnails, then image), the regex tiers and the video poster.
 */
export function getEntryCardImage(obj: Entry | string, width = 0, height = 0, format = 'match'): string | null {
  return lookupPostImage(obj, width, height, format, null)
}
