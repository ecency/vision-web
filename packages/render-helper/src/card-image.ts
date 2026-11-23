import { getProxyBase, MAX_PROXIED_URL_LENGTH, proxifyImageSrc } from './proxify-image-src'
import { cleanReply } from './methods/clean-reply.method'
import { hasAmpSentinel, imageUrlEnd, internalizeLeoLinks, plainDestination, unescapeDestination, withoutLoneSurrogates, makeEntryCacheKey, decodeImageSrc, rawBodySource, decodeDomImageSrc, decodeAttributeEntities, decodeEntities, decodeCompleteReferences, stripHtmlTags } from './helper'
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
// plain form is group 2, ended by a space or a control as the parser ends it,
// a backslash escaping the character after it (`\)` is part of the URL).
// Around the destination and title the parser skips only spaces and newlines,
// and no part spans a blank line, which ends the paragraph first (#2176).
// The label may hold balanced brackets two levels deep (#2179); a deeper one
// is not captured, and the uncaptured-image check below defers it. A
// backslash escape is one character, so `\\[` and `\\]` are not brackets.
const MD_IMAGE_RE = /!\[(?:[^[\]\n\\]|\\[^\n]|\\(?=\n)|\n(?! *\n)|\[(?:[^[\]\n\\]|\\[^\n]|\\(?=\n)|\n(?! *\n)|\[(?:[^[\]\n\\]|\\[^\n]|\\(?=\n)|\n(?! *\n))*\])*\])*\]\( *(?:\n *)?(?:<((?:[^<>\n\\]|\\[^\n]){1,2048})>|((?:[^)\\\u0000-\u0020\u007f]|\\[\s\S]){1,2048}))(?:(?= |\n) *(?:\n *)?(?:"(?:[^"\n]|\n(?! *\n))*"|'(?:[^'\n]|\n(?! *\n))*'))? *(?:\n *)?\)/

// Whether the character at `pos` is backslash-escaped: an odd run of
// backslashes right before it.
function escapedAt(text: string, pos: number): boolean {
  let k = pos - 1
  while (k >= 0 && text.charCodeAt(k) === 0x5c) k--
  return (pos - 1 - k) % 2 === 1
}

// A `%` that starts no percent escape.
const STRAY_PCT_RE = /%(?![\da-f]{2})/i

// An angle destination in the spelling its plain form has, as the render
// writes it (plainDestination, shared through helper.ts, #2176): escapes
// resolved first, lone surrogates as U+FFFD, then the render's plain form. A
// `\\` left after the unescape is encoded, so the destination decode
// unescapes nothing again.
function angleAsPlain(raw: string, ampEscapes: boolean): string {
  return plainDestination(withoutLoneSurrogates(unescapeDestination(raw, ampEscapes)))
}

// The body as the render's parser reads it, so the card scans the same text
// (#2176). First the render's own input pass: cleanReply (markdown2Html drops
// platform byline lines) and leofinance/inleo links internalised
// (markdownToHTML); its lone-surrogate pass keeps every offset, and the scans
// read a lone surrogate where it sits (#2158), so it is not repeated here. Then Remarkable's block parser
// (ParserBlock.parse): U+00A0 as a space, `\r\n`, `\r\u0085`, U+2424, U+2028
// and U+0085 as newlines, and each tab as one to four spaces, counted from the
// previous tab on its line. Raw HTML is part of that text too.
const PARSER_REWRITTEN_RE = /[\u00a0\t\r\u2424\u2028\u0085]/
const PARSER_NEWLINES_RE = /\r[\n\u0085]|[\u2424\u2028\u0085]/g
function parserInput(raw: string): string {
  const body = internalizeLeoLinks(cleanReply(raw))
  if (!PARSER_REWRITTEN_RE.test(body)) return body
  let str = body.replace(/\u00a0/g, ' ').replace(PARSER_NEWLINES_RE, '\n')
  if (str.indexOf('\t') >= 0) {
    let lineStart = 0
    let lastTabPos = 0
    const source = str
    str = source.replace(/[\n\t]/g, (match, offset: number) => {
      if (source.charCodeAt(offset) === 0x0a) {
        lineStart = offset + 1
        lastTabPos = 0
        return match
      }
      const spaces = '    '.slice((offset - lineStart - lastTabPos) % 4)
      lastTabPos = offset - lineStart + 1
      return spaces
    })
  }
  return str
}

// A markdown image whose URL exceeds MD_IMAGE_RE's length bound (or whose syntax is broken)
// isn't captured by it — leaving `mdMatch` null, or (MD_IMAGE_RE is unanchored) matching a
// *later* image instead. This linear detector (no closing `)` required; a label opening a
// nested `[` counts, #2179) still spots the uncaptured image so the lookups can bail
// to the full parser rather than promoting a later HTML/bare/markdown candidate over it.
// A line inside an image that may open a block as the parser reads one: a
// heading, quote, list item, fence, thematic break, setext underline, table
// row, a separator or hyphen underline (`-`, `:` and `|` only), a definition
// marker, a footnote definition, an ordered list marker of any length, or an
// HTML block (`<!`, `<?`, or a block tag). Such a line can end the paragraph
// before the image closes, so the image is left to the render; any other line
// keeps it readable. Any indent counts: inside a list item a block starts at
// the item's own indent, which can be 4 or more.
const BLOCK_START_LINE_RE =
  /\n *(?:#{1,6}(?=[ \n]|$)|>|[-*+](?=[ \n]|$)|\d+[.)](?=[ \n]|$)|`{3,}|~{3,}|<[!?]|(?:[-*_] *){3,}(?=\n|$)|=+ *(?=\n|$)|[-:][-:| ]*(?=\n|$)|[:~] |\[\^[^\]\n]*\]:|\|)/
const HTML_LINE_TAG_RE = /\n {0,3}<\/?([A-Za-z][A-Za-z0-9-]*)/g
function opensBlockInside(text: string): boolean {
  if (BLOCK_START_LINE_RE.test(text)) return true
  for (const m of regexMatches(text, HTML_LINE_TAG_RE)) {
    if (HTML_BLOCK_TAGS.has(m[1].toLowerCase())) return true
  }
  return false
}

const MD_IMAGE_PRESENT_RE = /!\[[^[\]]*(?:\]\(\s*[^\s)]|\[)/g

// The first match of a global `re` whose `!` is not backslash-escaped: an
// escaped `\![...](url)` is a link, and an image may still sit inside its
// label, so the scan resumes just past the escaped `![` (#2179). A label
// holding a URL is returned all the same: the render can turn that link into
// an image, which only the parser reads exactly, so the caller defers.
function firstUnescapedImage(text: string, re: RegExp): RegExpExecArray | null {
  re.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    if (!escapedAt(text, m.index) || escapedLabelHoldsUrl(m[0])) return m
    re.lastIndex = m.index + 2
  }
  return null
}
function escapedLabelHoldsUrl(match: string): boolean {
  const close = match.lastIndexOf('](')
  return match.slice(0, close === -1 ? match.length : close).includes('://')
}
const MD_IMAGE_RE_G = new RegExp(MD_IMAGE_RE.source, 'g')

// A markdown image's head, `![label](`, read with MD_IMAGE_RE's own label
// grammar, so its last `]` is the one that closes the label.
const MD_IMAGE_HEAD_RE = new RegExp(MD_IMAGE_RE.source.slice(0, MD_IMAGE_RE.source.indexOf('\\]\\(') + 4), 'y')

/**
 * The offset of every `]` that closes the label of a link or image the scans
 * can read, so a URL after a `](` can be told apart from one the render reads
 * as text (#2180). A label closed by an escaped `]`, or opened by an escaped
 * `[`, is text.
 */
function knownLabelCloses(cleaned: string): { closes: Set<number>; untrusted: Array<[number, number]> } {
  const closes = new Set<number>()
  // The destinations of links the parser may read otherwise, in source order.
  const untrusted: Array<[number, number]> = []
  for (const m of regexMatches(cleaned, MD_IMAGE_RE_G)) {
    // An escaped `!` makes a link, which the loop below reads.
    if (escapedAt(cleaned, m.index ?? 0)) continue
    MD_IMAGE_HEAD_RE.lastIndex = m.index ?? 0
    if (MD_IMAGE_HEAD_RE.exec(cleaned)) closes.add(MD_IMAGE_HEAD_RE.lastIndex - 2)
  }
  for (const m of regexMatches(cleaned, MD_LINK_RE)) {
    const open = m.index ?? 0
    const close = open + 1 + m[1].length
    if (escapedAt(cleaned, open) || escapedAt(cleaned, close)) continue
    if (
      // The pattern is looser than the parser: a blank line ends the
      // paragraph, `[x][y](url)` is a reference link followed by text, an
      // angle destination must end the destination, and a `(` in a plain one
      // may be one the parser balances further on.
      /\n[ \t]*\n/.test(m[0]) ||
      cleaned[open - 1] === ']' ||
      (/[<>]/.test(m[2]) && !/^<[^<>]*>$/.test(m[2])) ||
      (!m[2].startsWith('<') && m[2].includes('('))
    ) {
      untrusted.push([close + 2, open + m[0].length])
      continue
    }
    closes.add(close)
  }
  return { closes, untrusted }
}

/**
 * The `]` of a `](` that the URL at `idx` follows as a destination would
 * (spaces, at most one line break and an angle bracket between), or -1.
 */
function labelCloseBefore(text: string, idx: number): number {
  let k = idx - 1
  if (text[k] === '<') k--
  while (k >= 0 && text[k] === ' ') k--
  if (text[k] === '\n') {
    k--
    while (k >= 0 && text[k] === ' ') k--
  }
  return text[k] === '(' && text[k - 1] === ']' ? k - 1 : -1
}

// An image the render leaves without a src: a plain label and a plain URL the
// proxy refuses for its length, with nothing in it that the render would
// shorten (a reference, an escape). Sticky, at a `![`.
const DROPPED_IMAGE_RE = /!\[[^[\]\n\\`<>]*\]\((https?:\/\/[^\s()<>[\]\\`&"']+)\)/y

// The end of the image at `pos` when the render drops it (#2182), else -1.
function droppedImageEnd(text: string, pos: number): number {
  DROPPED_IMAGE_RE.lastIndex = pos
  const m = DROPPED_IMAGE_RE.exec(text)
  // An existing proxy URL is kept as written, whatever its length.
  if (!m || m[1].length <= MAX_PROXIED_URL_LENGTH || m[1].startsWith(`${getProxyBase()}/`)) return -1
  const url = m[1]
  if (url.includes('%')) {
    // The render decodes some escapes and keeps others; dropped for sure only
    // when even every escape decoded is over the limit. A UTF-8 sequence
    // decodes to at least one character per three escapes (`%C3%A9` is `é`),
    // so each escape shrinks the URL by under three.
    const escapes = url.match(PERCENT_ESCAPE_G)?.length ?? 0
    if (url.length - 3 * escapes <= MAX_PROXIED_URL_LENGTH) return -1
  }
  return DROPPED_IMAGE_RE.lastIndex
}

const DROPPED_IMAGE_G = new RegExp(DROPPED_IMAGE_RE.source, 'g')
const PERCENT_ESCAPE_G = /%[\da-f]{2}/gi

// Whether `text` before `pos` is only images the render drops and whitespace
// (a shorter image there would itself be the first image).
function onlyDroppedBefore(text: string, pos: number): boolean {
  return !text.slice(0, pos).replace(DROPPED_IMAGE_G, '').trim()
}

// Whether `text` holds a markdown image the scans cannot read (see
// firstUnescapedImage), skipping one the render drops for its length (#2182);
// `dropped` is set when one was skipped.
function hasUndecidedImage(text: string, seen: { dropped: boolean }): boolean {
  const re = MD_IMAGE_PRESENT_RE
  re.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    if (escapedAt(text, m.index) && !escapedLabelHoldsUrl(m[0])) {
      re.lastIndex = m.index + 2
      continue
    }
    const end = droppedImageEnd(text, m.index)
    if (end === -1) return true
    seen.dropped = true
    re.lastIndex = end
  }
  return false
}
// The first `<img` tag with a quoted `src`, in one forward pass (#2185). A
// tag is read by the HTML tag grammar, attribute by attribute, a quoted value
// whole, so a `src` inside another attribute's value (`alt="x src='a.png'"`)
// or a `>` there is text. A name that only ends in `src` (`data-src`) is
// reported as dashed. At the first `<img` the grammar does not read (no space
// before a name, an unclosed quote, no `>`, a line that ends the paragraph), the render shows text the scans
// cannot place, so the scan stops: nothing after it is named (unreadBefore
// defers on the `<img`), and no later tag is read inside this one's text.
const IMG_OPEN_RE = /<img\b/gi
// Whitespace is skipped in code: a `\s*` before an optional part reads as
// backtracking to a regex scanner, though each pattern is sticky.
const ATTRIBUTE_NAME_RE = /[A-Za-z_:][\w.:-]*/y
const ATTRIBUTE_VALUE_RE = /"([^"]*)"|'([^']*)'|[^\s"'=<>`]+/y
const TAG_END_RE = /\/?>/y
// Whether a line inside text[from, to) ends the paragraph the tag is in
// (#2194): a blank line, or one starting what can begin a block (a rule,
// setext underline, heading, quote, list item, fence, table row, definition,
// footnote or HTML block), or any line break when the tag's own line is a
// block of one line. The render then shows the tag as text, and what comes after it
// depends on the URL. A line that starts an attribute (`src="…"`) is plain
// continuation, which real posts write. Read in a loop bounded to the tag, so
// a gallery stays linear.
const BLOCK_START_CHARS = '-*_=#>+|<`~:[0123456789'
function tagBreaksParagraph(text: string, from: number, to: number, footnotes: boolean): boolean {
  let multiline = false
  for (let k = from; k < to; k++) {
    // A lone `\r` breaks a line too.
    const c = text[k]
    if (c !== '\n' && !(c === '\r' && text[k + 1] !== '\n')) continue
    multiline = true
    let j = k + 1
    while (j < to && (text[j] === ' ' || text[j] === '\t')) j++
    if (j >= to || text[j] === '\n' || text[j] === '\r' || BLOCK_START_CHARS.includes(text[j])) return true
    k = j - 1
  }
  if (!multiline) return false
  // A footnote definition reads its lines its own way.
  if (footnotes) return true
  // A tag on a line that is a block of one line (a heading, a table row)
  // ends at the line break whatever follows. The look back stops at the
  // previous line break, which a previous multiline tag holds.
  let lineStart = from
  while (lineStart > 0 && text[lineStart - 1] !== '\n' && text[lineStart - 1] !== '\r') lineStart--
  return /[#|[]/.test(text.slice(lineStart, from))
}
const SPACE_CHARS = ' \t\n\r\f'
function skipSpaces(text: string, i: number): number {
  while (i < text.length && SPACE_CHARS.includes(text[i])) i++
  return i
}
interface HtmlImageMatch {
  index: number
  src: string
  /** The attribute's name only ends in `src` (`data-src`). */
  dashed: boolean
  /** An `<img` inside another tag, maybe in a quoted attribute: the render's to read (#2195). */
  undecided?: boolean
}
// `marksOf` gives markInsideTags of `text`, computed once per body (rawTagsOf).
function matchHtmlImage(text: string, marksOf: () => Uint8Array): HtmlImageMatch | null {
  const footnotes = text.includes('[^')
  IMG_OPEN_RE.lastIndex = 0
  let m: RegExpExecArray | null
  let tagMarks: Uint8Array | null = null
  while ((m = IMG_OPEN_RE.exec(text)) !== null) {
    const start = m.index
    // `<div title='<img src="A">'>` shows no image: the attribute is text.
    tagMarks ??= marksOf()
    if (tagMarks[start] === 1) return { index: start, src: '', dashed: false, undecided: true }
    let i = start + 4
    let found: HtmlImageMatch | null = null
    let srcSeen = false
    for (;;) {
      const spaced = skipSpaces(text, i)
      TAG_END_RE.lastIndex = spaced
      if (TAG_END_RE.exec(text)) {
        i = TAG_END_RE.lastIndex
        break
      }
      // An attribute: whitespace, a name, then an optional `= value`.
      ATTRIBUTE_NAME_RE.lastIndex = spaced
      const named = spaced > i ? ATTRIBUTE_NAME_RE.exec(text) : null
      if (!named) return null
      i = ATTRIBUTE_NAME_RE.lastIndex
      let value: string | undefined
      const eq = skipSpaces(text, i)
      if (text[eq] === '=') {
        ATTRIBUTE_VALUE_RE.lastIndex = skipSpaces(text, eq + 1)
        const v = ATTRIBUTE_VALUE_RE.exec(text)
        if (v) {
          i = ATTRIBUTE_VALUE_RE.lastIndex
          value = v[1] ?? v[2]
        }
      }
      const name = asciiLower(named[0])
      // The first src decides, as the render reads it: an empty one leaves
      // the tag without an image, whatever follows.
      if (name === 'src') {
        if (!srcSeen && !found && value) found = { index: start, src: value, dashed: false }
        srcSeen = true
      } else if (!found && !srcSeen && value && name.endsWith('src') && /\W/.test(name[name.length - 4])) {
        found = { index: start, src: value, dashed: true }
      }
    }
    // A tag across a line that ends its paragraph is text the render reads
    // its own way.
    if (tagBreaksParagraph(text, start, i, footnotes)) return null
    if (found) return found
    IMG_OPEN_RE.lastIndex = i
  }
  return null
}
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
        // 2 marks the `<` that opens the tag, so a `<` marked 1 sits inside
        // a tag already open (#2195).
        marks[i] = 2
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
  return urlEnd === -1 ? null : token.slice(0, urlEnd)
}

// The first body image as the render will proxy it: decoded by where it came
// from, an HTML attribute, a markdown destination, HTML block text or markdown
// text (#2092, #2098). Null rather than a guess where the render differs.
function firstBodyImageRawUrl(raw: string): string | null {
  const body = parserInput(raw)
  return bodyImageRawUrl(body, prepareBody(body))
}

// The text a bare URL at `pos` sits in, as the inline parser leaves it for
// linkify: to whitespace or `<`, and before a `[`, which may open a link,
// image or footnote (develop's reading; the render keeps the `[` only when no
// such construct parses, which is rare in a URL).
function markdownTextSpan(body: string, pos: number): string {
  let end = pos
  while (end < body.length && !/[\s<[]/.test(body[end])) end++
  return body.slice(pos, end)
}

// The index of the first lone surrogate in `text`, or -1.
function loneSurrogateAt(text: string): number {
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i)
    if (c >= 0xd800 && c <= 0xdbff) {
      const next = text.charCodeAt(i + 1)
      if (next >= 0xdc00 && next <= 0xdfff) {
        i++
        continue
      }
      return i
    }
    if (c >= 0xdc00 && c <= 0xdfff) return i
  }
  return -1
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

// Whether the line before `pos` holds a `#` that is neither a hashtag nor
// after an Autolinker word character (`x # y`, `_#`, `\#`, `&num;`; not
// `#tag`, `(#tag)` or `C#`): Autolinker's hashtag matcher then claims the text
// to the token's end and drops the URL, and the render reads it its own way.
// A heading's own marker is not text.
function strayHashBefore(body: string, pos: number): boolean {
  const line = decodeCompleteReferences(body.slice(body.lastIndexOf('\n', pos - 1) + 1, pos).replace(/^ {0,3}#{1,6}(?=[ \t])/, ''))
  for (let i = line.indexOf('#'); i !== -1; i = line.indexOf('#', i + 1)) {
    const prev = line[i - 1]
    const next = line[i + 1]
    if (prev !== undefined && autolinkWordChar(prev)) continue
    if (next !== undefined && (autolinkWordChar(next) || next === '_')) continue
    return true
  }
  return false
}

function bodyImageRawUrl(body: string, prepared: PreparedBody): string | null {
  const candidate = findFirstImageCandidate(prepared).candidate
  if (!candidate) return null
  // A video poster before it is the first <img>, which this lookup does not name.
  const poster = findFirstVideoPoster(prepared)
  if (poster && poster.pos < candidate.pos) return null
  const source = candidateSource(body, candidate)
  if (source === null) return null
  const url = decodeDomImageSrc(source)
  if (url.length > MAX_PROXIED_URL_LENGTH) return null
  // One already on the proxy is kept as written, which a decoded URL would
  // not name (#2191).
  if (onProxy(source.trim()) && url !== source.trim()) return null
  // A control character a destination decodes to (`&Tab;`, `%0A`): the render
  // reads it its own way, and a guessed preload is a wasted download.
  return candidate.destination && CONTROL_CHAR_RE.test(url) ? null : url
}

/**
 * A candidate's URL as the render's DOM holds it: references decoded by where
 * it came from, an HTML attribute, a markdown destination, HTML block text or
 * markdown text (#2092, #2098), percent-encoding still as written. Every
 * lookup reads a candidate through this, so the card, the fast card and the
 * LCP preload name one URL (#2183). Null rather than a guess where the render
 * differs.
 */
function candidateSource(body: string, candidate: ImageCandidate): string | null {
  if (candidate.html) return decodeAttributeEntities(candidate.url)
  const ampEscapes = !hasAmpSentinel(body)
  if (candidate.destination) return rawBodySource(candidate.url, true, ampEscapes)
  // A bare URL: raw text of an HTML block, or markdown text. Lines are read
  // with code already blanked (a `<div>` inside a fence opens no block); the
  // blanking keeps every offset.
  if (markLines(asciiLower(codeBlanked(body))).block[candidate.pos]) return htmlTextImageUrl(body, candidate.pos)
  // Develop's reading: the URL token up to a parenthesis, bracket or quote,
  // without trailing sentence punctuation.
  const after = body.slice(candidate.pos + candidate.url.length, candidate.pos + candidate.url.length + 4)
  // The token stops before a `;` that may close a reference (`.png&quot;`)
  // or be punctuation after literal text (`&foo;`, `\&amp;`): the render's.
  if (after.startsWith(';') && /&#?[a-z\d]+$/i.test(candidate.url)) return null
  // A lone surrogate reads as U+FFFD in the render now (#2158), which ends
  // the URL there.
  const loneAt = loneSurrogateAt(candidate.url)
  const token = loneAt === -1 ? candidate.url : candidate.url.slice(0, loneAt)
  const tokenUrl = (): string | null => {
    const url = withoutTrailingPunctuation(token, loneAt === -1 ? after : '')
    return imageUrlEnd(url) === -1 ? null : rawBodySource(url, false, ampEscapes)
  }
  // An autolink is its whole URL; one holding a reference is left to the render.
  if (body[candidate.pos - 1] === '<' && after.startsWith('>')) {
    return loneAt !== -1 || token.includes('&') ? null : token
  }
  // A raw anchor's text and a reference definition's destination are not
  // autolinked.
  if (/^<\/a[\s>]/i.test(after) || definitionDestinationAt(body, candidate.pos)) return tokenUrl()
  // Markdown text with a parenthesis in the URL (`?a=(1)`, `?a=1))`,
  // `?a=1&#41;`, `(url)text`): the token stops at it, while the render's
  // linkify (Autolinker) balances it (#2157). Read there as Autolinker does;
  // emphasis and everything else as before.
  // Only where nothing else can end the text first: no inline delimiter the
  // parser may take (`*~_|^`, `==`, `++`, raw or as a reference), and the URL starting
  // the line or after whitespace or `(`, not after `@` or with a stray `#`
  // earlier on the line (Autolinker skips those and the render reads them its
  // own way).
  const raw = markdownTextSpan(body, candidate.pos)
  let span = decodeCompleteReferences(raw.replace(/\\&/g, '&amp;'))
  span = withoutLoneSurrogates(span)
  let k = candidate.pos - 1
  while (k >= 0 && (body[k] === ' ' || body[k] === '\t')) k--
  const before = k < 0 ? '\n' : body[k]
  const plain =
    (k === candidate.pos - 1 ? before === '\n' || before === '(' : before !== '@') &&
    !strayHashBefore(body, candidate.pos)
  if (!/[()]/.test(span) || /[*~_|^]|==|\+\+/.test(span) || !plain) return tokenUrl()
  const url = span.slice(0, autolinkUrlEnd(span))
  return imageUrlEnd(url) === -1 ? null : url
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
  /** The body as written, same offsets as `cleaned`. */
  source: string
  cleaned: string
  image: ScanText
  video: ScanText
}

const EMPTY_SCAN: ScanText = { text: '', inTag: new Uint8Array(0) }

function prepareBody(body: string): PreparedBody {
  const cleaned = body ? stripCodeRegions(body) : ''
  if (!cleaned) return { source: body, cleaned, image: EMPTY_SCAN, video: EMPTY_SCAN }
  const imageText = blankUnequalAnchors(cleaned, false)
  const videoText = blankUnequalAnchors(cleaned, true)
  return {
    source: body,
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
  /** A markdown image (`![](url)`), as opposed to a link the render promotes. */
  md?: boolean
  /** A video poster whose context the scans could not confirm. */
  uncertain?: boolean
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
  return {
    url: `https://img.youtube.com/vi/${best.url.split('?')[0]}/hqdefault.jpg`,
    pos: best.pos,
    uncertain: !posterShown(prepared, best.pos)
  }
}

// Whether the render shows the video link at `pos` as a poster: read in the
// contexts a bare image URL is (#2185). A link the checks cannot place is
// uncertain, never absent: the caller defers.
function posterShown(prepared: PreparedBody, pos: number): boolean {
  const token = /^https?:\/\/[^\s<>"'`]+/i.exec(prepared.source.slice(pos, pos + 2100))
  const candidate: ImageCandidate = token ? { url: token[0], pos } : { url: '', pos, destination: true }
  const { cleaned, source } = prepared
  // A destination (`[]( URL )`) is a link, never a poster.
  if (token && labelCloseBefore(cleaned, pos) !== -1) return false
  // In an HTML block with an image later on its line, the DOM may reorder them.
  let lineEnd = source.indexOf('\n', pos)
  if (lineEnd === -1) lineEnd = source.length
  if (markLines(asciiLower(codeBlanked(source))).block[pos] && /!\[|<img\b/i.test(source.slice(pos, lineEnd))) return false
  return bareShown(prepared, candidate) && !unreadBefore(prepared, knownLabelCloses(cleaned).closes, pos)
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

// Any http(s) URL token, parentheses included as the render's linkify reads
// them (`a(1).png`). One class run: linear.
const LOOSE_URL_RE = /https?:\/\/[^\s<>"'`]+/gi
// Elements whose content the page does not show as body images.
const HIDING_TAG_RE = /<(\/?)(iframe|head|script|style|textarea|title|noscript|template|object|svg|select)\b/g
// A code fence line, after any container prefix: its run of `` ` `` or `~`.
const FENCE_LINE_RE = /^[ \t>*+\-\d.)]*(`{3,}|~{3,})/

// A fence as it opened: its marker run and the prefix before it.
interface Fence {
  run: string
  prefix: string
}
// Outside any fence (null), inside one, or past a line that may or may not
// have closed it ('unknown'): from there on nothing is read as known.
type FenceState = Fence | null | 'unknown'

const SPACES_RE = /^ *$/

// The fence state after `line`. A closer is the opener's character, at least
// as long, with nothing after it but spaces. Behind the opener's own prefix
// it closes; after an opener at the margin, a closer indented up to three
// spaces closes and one indented four is code. Any other prefix (a
// container, an indent the opener had and the closer has not, a tab) is a
// line the scans cannot place.
function nextFenceState(state: FenceState, line: string): FenceState {
  if (state === 'unknown') return state
  const m = FENCE_LINE_RE.exec(line)
  if (!m) return state
  const prefix = m[0].slice(0, -m[1].length)
  if (state === null) {
    // A backtick in the info string makes it no fence (Remarkable 2.0.1
    // refuses one after `~~~` too).
    if (line.slice(m[0].length).includes('`')) return 'unknown'
    return { run: m[1], prefix }
  }
  if (m[1][0] !== state.run[0] || m[1].length < state.run.length || line.slice(m[0].length).trim()) return state
  if (prefix === state.prefix) return null
  // A top-level fence: a closer indented up to three spaces closes it, one
  // indented four is its content.
  if (!state.prefix && SPACES_RE.test(prefix)) return prefix.length <= 3 ? null : state
  return 'unknown'
}

// Whether a code fence may be open at `pos` in `source`, reading the line
// `pos` is on whole: text after a marker there keeps the fence open.
function fenceOpen(source: string, pos: number): boolean {
  const eol = source.indexOf('\n', pos)
  let state: FenceState = null
  for (const line of source.slice(0, eol === -1 ? source.length : eol).split('\n')) state = nextFenceState(state, line)
  return state !== null
}

/**
 * Whether the body before `pos` holds something the scans cannot read, so the
 * first image is the render's to say (#2185): an image URL in any form the
 * scans did not take (glued, emphasised, in brackets, in code, with a
 * parenthesis), an element that hides its content still open, a code fence,
 * or another `<img` tag.
 */
function unreadBefore(prepared: PreparedBody, closes: Set<number>, pos: number): boolean {
  const { source, cleaned } = prepared
  const scan = prepared.image
  const prefix = cleaned.slice(0, pos)
  const lowerPrefix = asciiLower(prefix)
  if (/<img\b/.test(lowerPrefix)) return true
  if (fenceOpen(source, pos)) return true
  let open = 0
  for (const m of regexMatches(lowerPrefix, HIDING_TAG_RE)) open += m[1] ? -1 : 1
  if (open > 0) return true
  // A processing instruction (`<?...?>`) hides what is in it.
  if (lowerPrefix.lastIndexOf('<?') > lowerPrefix.lastIndexOf('?>')) return true
  const lastAnchorClose = lowerPrefix.lastIndexOf('</a')
  const nested = nestedAnchors(lowerPrefix)
  // Tags read on the text as written (an anchor blanked in the scan text is
  // still a tag), with where each one opened.
  let tagMarks: Uint8Array | null = null
  let tagOpen: Int32Array | null = null
  for (const m of regexMatches(source, LOOSE_URL_RE)) {
    const idx = m.index ?? 0
    if (idx >= pos) break
    if (imageUrlEnd(m[0]) === -1) continue
    // Inside an anchor the render keeps a link (blanked in the scan text, but
    // not as code) that closes before the image. Code is not skipped: the
    // scans' code reading is not the parser's.
    if (
      scan.text.slice(idx, idx + 4).toLowerCase() !== 'http' &&
      cleaned.slice(idx, idx + 4).toLowerCase() === 'http' &&
      lastAnchorClose >= idx &&
      !nested
    ) {
      continue
    }
    if (!tagMarks || !tagOpen) {
      tagMarks = markInsideTags(prefix)
      tagOpen = new Int32Array(prefix.length)
      let lt = -1
      let nl = -1
      for (let i = 0; i < prefix.length; i++) {
        if (prefix[i] === '<') lt = i
        if (prefix[i] === '\n') nl = i
        // A tag that opened on this line.
        tagOpen[i] = lt > nl ? lt : -1
      }
    }
    // An attribute value, in a tag that opens on the same line: a `<div` that
    // runs onto later lines may be text to the parser.
    if (tagMarks[idx] && tagOpen[idx] !== -1) continue
    const close = labelCloseBefore(cleaned, idx)
    if (close !== -1 && closes.has(close)) continue
    return true
  }
  return false
}

/**
 * Whether a paragraph's text before an image puts it in a definition (`]:`,
 * a footnote, an abbreviation) or an open link title (`](url "`), where the
 * render reads it as text. One pass.
 */
function inTextContext(text: string): boolean {
  if (text.includes(']:')) return true
  let inDestination = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (c === ']' && text[i + 1] === '(') {
      inDestination = true
      i++
    } else if (inDestination) {
      if (c === ')') inDestination = false
      else if (/\s/.test(c) && /["'(]/.test(text[i + 1] ?? '')) return true
    }
  }
  // Still inside a destination (`[]( [url](url)`): text, not an image.
  return inDestination
}

/** Whether the render shows the markdown image at `pos` where it stands. */
function mdImageShown(prepared: PreparedBody, pos: number): boolean {
  if (prepared.image.inTag[pos]) return false
  const text = prepared.cleaned
  const blank = text.lastIndexOf('\n\n', pos)
  return !inTextContext(text.slice(blank === -1 ? 0 : blank, pos))
}

// Whether the paragraph from `from` to `to` in `source` has a backtick outside
// code fences (a fence's own lines and its content are code already), the
// fences read from the start of the body: a paragraph may begin inside one.
function inlineBacktick(source: string, from: number, to: number): boolean {
  let state: FenceState = null
  let at = 0
  for (const line of source.slice(0, to).split('\n')) {
    const before = state
    state = nextFenceState(state, line)
    const lineStart = at
    at += line.length + 1
    if (lineStart < from) continue
    // Fenced lines and a fence's own marker lines are not inline code.
    if (before !== null || state !== null) continue
    if (line.includes('`')) return true
  }
  return false
}

// Inline syntax a bare URL may hold that the parser reads before linkify
// (code, a table cell, marks), so the render's URL ends elsewhere.
const URL_SYNTAX_RE = /[`|^]|\+\+|==|~~/

/**
 * Whether the render shows a bare URL or a promoted link at `pos` as an image
 * rather than as text in a construct the scans cannot see (#2185): a link's
 * text or title, a definition or footnote, code, an attribute, an escape, an
 * autolink in an HTML block, an anchor the render reads its own way. Read on
 * its paragraph as written.
 */
// Whether the `[` at `at` starts markdown the parser reads before linkify,
// in the shapes proven to: an inline link `[x](url)`, a footnote reference
// with its definition, or a reference whose definition stands on its own
// line after a blank one. Anything else may be text the linkify takes into
// the URL, so the caller defers.
function markdownBracketAt(source: string, at: number): boolean {
  const head = source.slice(at, at + 2200)
  if (/^\[(?:[^[\]\n]|\[[^[\]\n]{0,100}\]){0,100}\]\([^\s()<>]*\)/.test(head)) return true
  const m = /^\[([^[\]\n]{1,100})\](?:\[([^[\]\n]{0,100})\])?/.exec(head)
  if (!m) return false
  const label = (m[2] ? m[2] : m[1]).trim()
  if (!label) return false
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  // The definition: its own line, after a blank line or the body start,
  // one URL and nothing else, outside a code fence.
  const def = new RegExp(`(?:^|\\n[ \\t]*\\n)( {0,3}\\[${escaped}\\]:[ \\t]*\\S+[ \\t]*)(?:\\n|$)`, 'i').exec(source)
  if (!def) return false
  return !fenceOpen(source, def.index)
}

// Tag marks on the code-stripped text before any anchor is blanked: an
// anchor's own attributes are inside a tag too.
const rawTagMarks = new WeakMap<PreparedBody, Uint8Array>()
function rawTagsOf(prepared: PreparedBody): Uint8Array {
  let marks = rawTagMarks.get(prepared)
  if (!marks) {
    marks = markInsideTags(prepared.cleaned)
    rawTagMarks.set(prepared, marks)
  }
  return marks
}

// Whether anchors are nested anywhere in `lower`: the scan text blanks the
// outer one whole, though the render may still read an inner one.
function nestedAnchors(lower: string): boolean {
  let depth = 0
  for (const m of regexMatches(lower, /<(\/?)a\b/g)) {
    depth = m[1] ? Math.max(0, depth - 1) : depth + 1
    if (depth > 1) return true
  }
  return false
}

function bareShown(prepared: PreparedBody, candidate: ImageCandidate): boolean {
  const { source, cleaned } = prepared
  const pos = candidate.pos
  if (prepared.image.inTag[pos] || rawTagsOf(prepared)[pos]) return false
  let slashes = 0
  while (source[pos - 1 - slashes] === '\\') slashes++
  if (slashes % 2 === 1) return false
  const blank = source.lastIndexOf('\n\n', pos)
  const paraStart = blank === -1 ? 0 : blank + 2
  const para = source.slice(paraStart, pos)
  if (inTextContext(para)) return false
  // An open `[`: link text. A `]` in an attribute closes nothing; a `[` in
  // what looks like a tag still may open a label (`<center [>`).
  let depth = 0
  for (let i = 0; i < para.length; i++) {
    const c = para[i]
    if (c === '\\') i++
    else if (c === '[') depth++
    else if (c === ']' && !prepared.image.inTag[paraStart + i]) depth = Math.max(0, depth - 1)
  }
  if (depth > 0) return false
  if (inlineBacktick(source, paraStart, pos) || URL_SYNTAX_RE.test(candidate.url)) return false
  // An autolink in an HTML block is text to the parser.
  if (source[pos - 1] === '<' && markLines(asciiLower(codeBlanked(source))).block[pos]) return false
  // An anchor around it opened across lines, or nested, is read its own way.
  const lowerPara = asciiLower(cleaned.slice(paraStart, pos))
  if (nestedAnchors(lowerPara)) return false
  const lt = lowerPara.lastIndexOf('<a')
  if (lt !== -1 && /^<a\b/.test(lowerPara.slice(lt, lt + 3)) && lowerPara.slice(lt).includes('\n')) return false
  // A marker after the URL that nothing before it opens stays in the URL for
  // the render's linkify, as a quote does; a trailing backslash is an escape.
  const next = source[pos + candidate.url.length]
  if (next === "'") return false
  // Literal brackets the linkify takes into the URL (`URL[x]`), unlike a
  // footnote, link or defined reference the parser takes first.
  if (next === '[' && !markdownBracketAt(source, pos + candidate.url.length)) return false
  // A closing tag right after it that does not close the tag right before it
  // (`<div>URL</span>`): the DOM reads that its own way.
  const closing = /^<\/([a-z][a-z\d]*)/i.exec(source.slice(pos + candidate.url.length, pos + candidate.url.length + 40))
  if (closing) {
    const lt = cleaned.lastIndexOf('<', pos)
    const opening = lt === -1 ? null : /^<([a-z][a-z\d]*)/i.exec(cleaned.slice(lt, lt + 40))
    if (!opening || opening[1].toLowerCase() !== closing[1].toLowerCase()) return false
  }
  if (next !== undefined && '*_~'.includes(next) && !para.includes(next)) return false
  if (candidate.url.endsWith('\\')) return false
  // A reference written twice (`&amp;amp;`), or one without its `;` in an
  // anchor's text (`&copy`), which the render reads its own way.
  if (/&amp;(?:[a-z][a-z\d]*|#\d+|#x[\da-f]+);/i.test(candidate.url)) return false
  const tag = cleaned.lastIndexOf('<', pos)
  if (
    decodeHtmlText(candidate.url) !== decodeCompleteReferences(candidate.url) &&
    tag !== -1 &&
    /^<a\b/i.test(cleaned.slice(tag, tag + 3))
  ) {
    return false
  }
  return true
}

const NONE: CandidateResult = { candidate: null, ambiguous: false }
const AMBIGUOUS: CandidateResult = { candidate: null, ambiguous: true }

function findFirstImageCandidate(prepared: PreparedBody): CandidateResult {
  const { cleaned } = prepared
  if (!cleaned) return NONE

  const mdMatch = firstUnescapedImage(cleaned, MD_IMAGE_RE_G)
  const htmlMatch = matchHtmlImage(cleaned, () => rawTagsOf(prepared))

  // If markdown image syntax is present at all, it must be unambiguous. The
  // capture class `[^)\s]+` excludes `)`, so a captured URL containing `(`
  // means the URL was truncated mid-paren (e.g., a real
  // `https://x.com/path_(a)_full.jpg`). When ambiguous, bail and let the full
  // markdown parser handle it — returning a truncated URL would be wrong.
  // An angle destination is whole whatever it holds; a plain one with `(` may
  // have been cut short by the capture class.
  // A plain destination's escapes resolve as an angle one's do (`\\)` is `)`);
  // one without a backslash is unchanged.
  const mdUrl = mdMatch
    ? mdMatch[1] !== undefined || mdMatch[2].includes('\\')
      ? angleAsPlain(mdMatch[1] ?? mdMatch[2], !hasAmpSentinel(cleaned))
      : mdMatch[2]
    : undefined
  if (mdMatch) {
    const url = mdUrl
    if (
      !url ||
      !SAFE_URL_RE.test(url) ||
      (mdMatch[1] === undefined && url.includes('(')) ||
      opensBlockInside(mdMatch[0]) ||
      // An escaped `!` before a link whose text holds a URL (#2181 review).
      escapedAt(cleaned, mdMatch.index) ||
      // A backslash before whitespace escapes nothing in a plain destination.
      (mdMatch[2] !== undefined && /\\[\u0000-\u0020]/.test(mdMatch[2])) ||
      // With a `%` that starts no escape, the render normalises the escaped
      // destination and decodes it once, which only the parser reads exactly
      // (#2179).
      (mdMatch[2] !== undefined && mdMatch[2].includes('\\') && STRAY_PCT_RE.test(mdMatch[2]))
    ) {
      return AMBIGUOUS
    }
  }
  // MD_IMAGE_RE is unanchored, so a markdown image can go uncaptured (URL over the length
  // bound, or broken syntax) while `mdMatch` is null OR is a *later* image. If any such
  // uncaptured image sits before what we captured (or nothing was captured), bail to the full
  // parser so it resolves the true first image rather than promoting a later HTML/bare/markdown
  // candidate.
  const priorRegion = mdMatch ? cleaned.slice(0, mdMatch.index ?? 0) : cleaned
  const seen = { dropped: false }
  if (hasUndecidedImage(priorRegion, seen)) {
    return AMBIGUOUS
  }

  // Collect valid candidates with their source position; the rendered document
  // surfaces whichever image appears first in source order.
  const candidates: ImageCandidate[] = []
  if (mdMatch && mdUrl) candidates.push({ url: mdUrl, pos: mdMatch.index ?? 0, destination: true, md: true })
  // `data-src`, `x-src`: the pattern reads a name that only ends in `src`,
  // so which attribute the render takes is its own to say.
  // Only where it may come first: an image before it wins on source order.
  const dashSrc = !!htmlMatch && (htmlMatch.dashed || !!htmlMatch.undecided)
  if (dashSrc && !(mdMatch && mdUrl && (mdMatch.index ?? 0) < htmlMatch.index)) {
    return AMBIGUOUS
  }
  // The render trims the attribute (#2185).
  if (htmlMatch && !dashSrc && SAFE_URL_RE.test(htmlMatch.src.trim())) {
    candidates.push({ url: htmlMatch.src, pos: htmlMatch.index, html: true })
  }
  // A URL after a `](` that closes no label the scans read is text the render
  // linkifies, maybe into an image (#2180): only the parser reads it, so the
  // first one defers when it comes before every candidate.
  const scan = prepared.image
  const { closes, untrusted } = knownLabelCloses(cleaned)
  let undecidedAt = -1
  let range = 0
  for (const m of regexMatches(scan.text, URL_TOKEN_RE)) {
    const idx = m.index ?? 0
    if (scan.inTag[idx]) continue
    const url = imageToken(m[0])
    if (url === null) continue
    // Inside a destination the parser may read otherwise: only it knows.
    while (range < untrusted.length && untrusted[range][1] <= idx) range++
    if (range < untrusted.length && untrusted[range][0] <= idx) {
      undecidedAt = idx
      break
    }
    const close = labelCloseBefore(cleaned, idx)
    if (close !== -1) {
      if (closes.has(close)) continue
      undecidedAt = idx
      break
    }
    if (!isStandalone(scan, idx) || !SAFE_URL_RE.test(url)) continue
    candidates.push({ url, pos: idx })
    break
  }
  // `[url](url)` image-link form: a markdown link the renderer promotes to an
  // image (a.method) — href is an image URL and the label text equals it.
  // Skip `![...]()` images (preceding `!`). Take the earliest such link.
  for (const m of regexMatches(cleaned, MD_LINK_RE)) {
    const idx = m.index ?? 0
    if (idx > 0 && cleaned[idx - 1] === '!') continue // it's an image ![](), handled above
    // An angle destination is the URL inside the brackets.
    const href = /^<[^<>]*>$/.test(m[2]) ? m[2].slice(1, -1) : m[2]
    if (href && isImageHref(href) && promotesToImage(m[1], href)) {
      candidates.push({ url: href, pos: idx, destination: true })
      break
    }
  }

  if (undecidedAt !== -1 && candidates.every((c) => undecidedAt < c.pos)) {
    return AMBIGUOUS
  }
  candidates.sort((a, b) => a.pos - b.pos)
  const first = candidates[0]
  // Past a dropped image only the plain case is read (#2182): dropped images
  // and whitespace, then a markdown image. Anything else there may hold what
  // the scans misread, so the render reads it.
  // Read as written: the code blanking can hide text there.
  if (seen.dropped && !(first?.md && onlyDroppedBefore(prepared.source, first.pos))) {
    return AMBIGUOUS
  }
  if (!first) return NONE
  // What comes before the first image must hold nothing the scans cannot
  // read, and the image must sit where the render shows it (#2185).
  if (unreadBefore(prepared, closes, first.pos)) return AMBIGUOUS
  if (first.md && !mdImageShown(prepared, first.pos)) return AMBIGUOUS
  // The bare scans also take URLs the render shows as no image (a reference
  // definition, a link's title or text, code), with or without an image after
  // them (#2185).
  if (!(first.html || first.md) && !bareShown(prepared, first)) return AMBIGUOUS
  // A bare URL in an HTML block with an image on its line: the DOM may nest
  // or reorder the two (`<div>URL</span>![x](A)`).
  if (!(first.html || first.md)) {
    const lineEnd = prepared.cleaned.indexOf('\n', first.pos)
    const blockLine = markLines(asciiLower(codeBlanked(prepared.source))).block[first.pos]
    if (blockLine && candidates.some((c) => c !== first && (c.html || c.md) && (lineEnd === -1 || c.pos < lineEnd))) {
      return AMBIGUOUS
    }
  }
  return { candidate: first, ambiguous: false }
}

/**
 * Everything fast mode can find without rendering markdown: the regex tiers
 * including standalone bare image URLs, plus the YouTube poster the full render
 * would have produced, whichever comes first in the source. Returns the same
 * proxied URL the full render's first <img> would have carried, or null.
 */
function fastBodyImage(raw: string, width: number, height: number, format: string): string | null {
  const body = parserInput(raw)
  const prepared = prepareBody(body)
  const found = findFirstImageCandidate(prepared)
  // A markdown image the regex could not decide on: the full render would
  // resolve it, and it may well come first. Nothing else may stand in for it.
  if (found.ambiguous) {
    return null
  }
  const first = found.candidate
  // The render takes the first <img> in source order: an image, a promoted
  // link or a video poster, whichever comes first (#2185).
  const poster = findFirstVideoPoster(prepared)
  // A poster first whose context is unconfirmed may be link text or a title.
  if (poster && (!first || poster.pos < first.pos) && poster.uncertain) return null
  if (first && (first.html || first.md) && !(poster && poster.pos < first.pos)) {
    const source = candidateSource(body, first)
    return source === null ? null : proxifySource(source, width, height, format) || null
  }
  // The render ends a bare URL at a lone surrogate (#2158), which the full
  // lookup reads its own way: give up rather than name another URL (#2179),
  // unless a poster comes first and wins on source order anyway.
  if (first && !first.destination && loneSurrogateAt(first.url) !== -1 && !(poster && poster.pos < first.pos)) return null
  if (poster && (!first || poster.pos < first.pos)) {
    // The rendered poster <img> carries the 0x0 proxied URL; re-proxying it at
    // the requested size is exactly what the full render path does with it.
    return proxifySource(proxifyImageSrc(poster.url, 0, 0, 'match'), width, height, format)
  }
  if (!first) return null
  const source = candidateSource(body, first)
  // A URL the proxy refuses is one the render drops.
  return source === null ? null : proxifySource(source, width, height, format) || null
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

// A URL whose references are already decoded (candidateSource, the rendered
// DOM src), percent-decoded as the render decodes its <img> src before
// proxying (decodeDomImageSrc), so `a%20b.png` preloads the image the body
// shows (#2169). A legacy passthrough that carries the URL itself rather than
// a /p/ hash keeps it as written: decoded, a `%20` or `%0A` would become raw
// whitespace in it. Never entity-decoded again here (#2195).
// As the body reads any image src (bodyImageSources): one already on the
// proxy (/p/, /u/, a sized route) is kept as written, any other goes through
// /p/ (#2185, #2191), legacy sized hosts included.
function onProxy(src: string): boolean {
  const base = getProxyBase()
  return src.startsWith(`${base}/p/`) || src.startsWith(`${base}/u/`) || (src.startsWith(`${base}/`) && /^\d+x\d+\//.test(src.slice(base.length + 1)))
}

function proxifySource(written: string, width: number, height: number, format: string): string {
  const source = written.trim()
  if (!onProxy(source)) return proxifyImageSrc(decodeDomImageSrc(source), width, height, format, { forceProxy: true })
  // Unsized, the card is the src the render keeps.
  if (!width && !height) return source
  const proxied = proxifyImageSrc(decodeDomImageSrc(source), width, height, format)
  return proxied.startsWith(`${getProxyBase()}/p/`) ? proxied : proxifyImageSrc(source, width, height, format)
}

/**
 * The full lookup's regex tier: the first body image when it is a markdown or
 * HTML image the scans read, proxied, or null to leave the body to the render.
 * A bare URL or a promoted link that comes first is the render's to read
 * (#2180), and so is an image the proxy refuses, which the render drops
 * (#2182).
 */
function regexTierImage(raw: string, width: number, height: number, format: string): string | null {
  // '' (a URL the proxy refuses) is falsy at both callers, which then render.
  const body = parserInput(raw)
  const prepared = prepareBody(body)
  const found = findFirstImageCandidate(prepared).candidate
  if (!found || !(found.html || found.md)) return null
  // A video poster before it is the first <img> (#2185).
  const poster = findFirstVideoPoster(prepared)
  if (poster && poster.pos < found.pos) return null
  const source = candidateSource(body, found)
  return source === null ? null : proxifySource(source, width, height, format)
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
  const fast = regexTierImage(entry.body, width, height, format)
  if (fast) {
    return fast
  }

  // Fall back to the full markdown render (handles edge cases the regex missed)
  const src = renderFirstImage(entry)
  // A kept proxy URL the proxy would not take again (over its length limit)
  // is the rendered src as it stands. The DOM already decoded its references,
  // so they are not decoded again (#2195).
  return src ? proxifySource(src, width, height, format) || src : null
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
  const body = parserInput(obj.body)
  const prepared = prepareBody(body)
  const found = findFirstImageCandidate(prepared)
  if (found.ambiguous) {
    return null
  }
  const poster = findFirstVideoPoster(prepared)
  if (poster && (!found.candidate || poster.pos < found.candidate.pos)) {
    return poster.uncertain ? null : { url: poster.url, poster: true }
  }
  const url = bodyImageRawUrl(body, prepared)
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
    const fast = regexTierImage(obj, width, height, format)
    if (fast) {
      return fast
    }
    const src = renderFirstImage(obj)
    return src ? proxifySource(src, width, height, format) || src : null
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
