import { traverse } from './traverse.method'
import { sanitizeHtml } from './sanitize-html.method'
import { stripAuthorMarkers } from './strip-author-markers.method'
import { createRenderNonce, xmldomNodeFilter } from './render-boundary.method'
import { decodeCompleteReferences, decodeEntities, hasAmpSentinel, moveBlockClosingTagOutOfParagraph, removeDuplicateAttributes } from '../helper'
import { regexMatches } from '../regex-matches'
import { DOMParser, XMLSerializer, ENTITY_REGEX, PLACEHOLDER_DELIMITERS, PRIVATE_DELIMITERS_FROM, PRIVATE_DELIMITERS_TO } from '../consts'
import { Remarkable, utils } from 'remarkable'
import { linkify } from 'remarkable/linkify'
import * as htmlparser2 from 'htmlparser2'
import * as domSerializerModule from 'dom-serializer'
import { RenderOptions, SeoContext } from '../types'

const domSerializer = (domSerializerModule as any).default || domSerializerModule

// A URL in the markdown source, in an attribute, a link destination or text.
// It ends at whitespace, a quote, an angle bracket or an unbalanced `)`, the
// delimiters a URL sits between in markdown and HTML; one level of balanced
// parentheses stays inside (`photo_(1).png`, Wikipedia's `X_(Y).jpg`, #2092),
// and so does an unclosed `(` (`a_(x&amp;y.png`), which no markdown construct
// closes. Nothing follows the repetition, so the first (greedy) parse is taken
// without backtracking: linear. Entities in a markdown destination are left
// to the parser's own reading of it (undecodedAngleDestination), not guessed
// here (#2154).
const URL_RUN = /https?:\/\/(?:[^\s<>"'`()]|\([^\s<>"'`()]*\)|\()+/gi

// A backslash-escaped `&` in a link or image destination is a literal
// ampersand (CommonMark), so `[x](https://e.com/?q=\\&copy;)` names
// `?q=&copy;`. Remarkable drops the backslash before decode_destinations runs,
// which then read `&copy;` as ©. So while Remarkable parses a link, an image
// or a reference definition, and only then, each escaped `&` in its source is
// swapped for AMP_PAIR (same length, so every position holds). The hrefs and
// srcs it produces get a literal `&` after their references are decoded; the
// label's text gets the `&` the escape rule would have given; inline code and
// HTML inside a label get the source's `\\&` back. Code blocks, raw HTML,
// autolinks and other text are never parsed with the pair, so they render as
// before. Off for a body that already holds the pair's characters in any form
// (hasAmpSentinel), which then renders exactly as it did.
const AMP_PAIR = '\uE000\uE001'
const AMP_PAIR_G = /\uE000\uE001/g
const AMP_PAIR_HREF = /\uE000\uE001|%EE%80%80%EE%80%81/g
let ampEscapes = false

// The source with each escaped `&` (an odd run of backslashes before it) as
// AMP_PAIR, or null when it has none.
function pairedSource(src: string): string | null {
  const paired = src.replace(BACKSLASH_RUN, (run) =>
    run.endsWith('&') && run.length % 2 === 0 ? run.slice(0, -2) + AMP_PAIR : run
  )
  return paired.includes(AMP_PAIR) ? paired : null
}

// Every whole run of backslashes, with the `&` after it if there is one; an
// escaped `&` is an odd run (even length with the `&`). The match is greedy and
// the next search starts after it, so each run is read once: linear. No
// lookbehind: Safari before 16.4 cannot parse one (no-regex-lookbehind.spec).
const BACKSLASH_RUN = /\\+&?/g

type RuleList = { __rules__: Array<{ name: string; fn: any }>; at: (name: string, fn: any) => void }
function wrapRule(ruler: RuleList, name: string, wrap: (fn: any) => any): void {
  const rule = ruler.__rules__.find((r) => r.name === name)
  if (rule) ruler.at(name, wrap(rule.fn))
}

// The inline parse state, with the paired source computed once per state.
// The links rule runs at every `[` and `!`, and its label parse re-enters the
// rules on the same state, so nothing here compares or rescans the source.
type PairState = { src: string; ampPaired?: string | null; ampInside?: boolean; ampOriginal?: string }
type ParseRule = (state: PairState, silent?: boolean) => boolean

function withPairedSource(rule: ParseRule): ParseRule {
  return (state, silent) => {
    if (!ampEscapes || state.ampInside) return rule(state, silent)
    if (state.ampPaired === undefined) state.ampPaired = pairedSource(state.src)
    const paired = state.ampPaired
    if (paired === null) return rule(state, silent)
    const src = state.src
    state.src = paired
    state.ampInside = true
    state.ampOriginal = src
    try {
      return rule(state, silent)
    } finally {
      state.src = src
      state.ampInside = false
      state.ampOriginal = undefined
    }
  }
}

// An autolink in a link label is parsed while the label holds the pair, but an
// autolink takes no escapes: `<https://e.com/?a\\&b>` keeps its backslash
// (#2098). So it reads the original source, as one outside a label does. Same
// length, so every position holds.
function withOriginalSource(rule: ParseRule): ParseRule {
  return (state, silent) => {
    if (!state.ampInside || state.ampOriginal === undefined) return rule(state, silent)
    const paired = state.src
    state.src = state.ampOriginal
    try {
      return rule(state, silent)
    } finally {
      state.src = paired
    }
  }
}

type BlockState = { tokens: Array<{ type: string; content?: string }> }

// Reference definitions are parsed from paragraph content by the core
// `references` rule; the paragraph keeps whatever is not a definition.
function withPairedReferences(rule: (state: BlockState) => unknown): (state: BlockState) => unknown {
  return (state) => {
    if (!ampEscapes) return rule(state)
    // Original content of each paired token. A token the rule left as it was
    // gets its original string back: the restored copy would be a two-byte
    // string, which makes linkify take its slower path on Latin-1 bodies.
    const originals = new Map<{ content?: string }, { original: string; paired: string }>()
    for (const token of state.tokens) {
      if (token.type !== 'inline' || !token.content) continue
      const paired = pairedSource(token.content)
      if (paired === null) continue
      originals.set(token, { original: token.content, paired })
      token.content = paired
    }
    try {
      return rule(state)
    } finally {
      for (const [token, { original, paired }] of originals) {
        token.content = token.content === paired ? original : token.content?.replace(AMP_PAIR_G, '\\&')
      }
    }
  }
}

// Largest code block that is syntax highlighted (#2097).
const MAX_HIGHLIGHT_LENGTH = 20_000

const escapeCode = (text: string): string =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

interface DestinationToken {
  type: string
  src?: string
  href?: string
  alt?: string
  title?: string
  content?: string
  children?: DestinationToken[]
}

// AMP_PAIR back to what the source said, by where it ended up. Only on a
// render that paired anything (ampEscapes).
const hrefAmp = (value: string) => value.replace(AMP_PAIR_HREF, '&')
const literalAmp = (value: string) => value.replace(AMP_PAIR_G, '&')
const sourceAmp = (value: string) => value.replace(AMP_PAIR_G, '\\&')

function restorePairedAmpersands(token: DestinationToken): void {
  if (token.content === undefined || !token.content.includes(AMP_PAIR)) return
  // Inline code and HTML keep the backslash, as the parser leaves it there;
  // any other token went through the escape rule (`\\&` is `&`).
  token.content = token.type === 'code' || token.type === 'htmltag' ? sourceAmp(token.content) : literalAmp(token.content)
}

/**
 * Decodes the references in a markdown image or link destination once, as
 * CommonMark does: only a complete one, ending in `;` (#2092). Remarkable leaves `![](?a=1&amp;b=2)`
 * undecoded and escapes it again, so the URL reached the document as the text
 * `&amp;b=2`, and the image path had to decode a second time, which broke raw
 * HTML (`<img src="?x=1&amp;times=2">` was proxied as `?x=1×=2`). Now every
 * image URL reaches the document decoded exactly once, whichever syntax wrote
 * it. A decoded `javascript:` is refused downstream by a()'s scheme list and
 * the output sanitizer, as for any other link.
 */
function decodeDestinations(state: { tokens: DestinationToken[] }): boolean {
  for (const block of state.tokens) {
    if (block.type !== 'inline' || !block.children) continue
    for (const token of block.children) {
      // A marked `\\&` becomes a literal `&` after the decode, so it never
      // starts a reference.
      if (token.type === 'image' && token.src) token.src = decodeCompleteReferences(token.src)
      else if (token.type === 'link_open' && token.href) token.href = decodeCompleteReferences(token.href)
      if (!ampEscapes) continue
      if (token.src) token.src = hrefAmp(token.src)
      if (token.href) token.href = hrefAmp(token.href)
      if (token.alt) token.alt = literalAmp(token.alt)
      if (token.title) token.title = literalAmp(token.title)
      restorePairedAmpersands(token)
    }
  }
  return true
}

// An angle-bracket destination (`[x](<url>)`, `[r]: <url>`) is decoded by
// Remarkable itself (normalizeLink: references, then decodeURI/encodeURI), and
// decode_destinations decoded it again, so `<?q=&amp;amp;>` named `?q=&` where
// the plain form names `?q=&amp;` (#2154). Its value goes back to the source,
// URI-normalised as Remarkable does but undecoded, and decode_destinations
// decodes it once like every other destination. Only when the token holds
// exactly what Remarkable makes of that source, so a misread never changes one.
const uriNormalized = (url: string): string => {
  try {
    url = decodeURI(url)
  } catch {
    // Remarkable keeps a malformed URI as it is too.
  }
  return encodeURI(url)
}

// The app render's placeholders back to the entities they stand for.
type Unswap = (text: string) => string

// `raw` is the source as the parser read it, with the app render's
// placeholders (which Remarkable percent-encoded, so the final restore could
// never find them, #2154): those go back to their entities first, so the
// destination reads exactly as written, whatever its scheme.
function undecodedAngleDestination(value: string | undefined, raw: string, unswap: Unswap): string | undefined {
  try {
    if (value !== uriNormalized(utils.replaceEntities(utils.unescapeMd(raw)))) return undefined
    return uriNormalized(utils.unescapeMd(unswap(raw)))
  } catch {
    return undefined
  }
}

// What between `<` and `>` an angle destination at `pos` holds, read as
// Remarkable's parseLinkDestination reads it, or null when there is none.
function angleDestination(src: string, pos: number, max: number): string | null {
  if (src.charCodeAt(pos) !== 0x3c) return null
  for (let at = pos + 1; at < max; at++) {
    const code = src.charCodeAt(at)
    if (code === 0x0a) return null
    if (code === 0x3e) return src.slice(pos + 1, at)
    if (code === 0x5c && at + 1 < max) at++
  }
  return null
}

const skipSpaces = (src: string, pos: number, max: number): number => {
  while (pos < max && (src.charCodeAt(pos) === 0x20 || src.charCodeAt(pos) === 0x0a)) pos++
  return pos
}

type InlineToken = { type: string; href?: string; src?: string }
type InlineState = {
  src: string
  pos: number
  posMax: number
  isInLabel?: boolean
  tokens: InlineToken[]
  parser: { skipToken: (state: InlineState) => void }
}

// Where the label opened by the `[` at `start` ends, read exactly as
// Remarkable's parseLinkLabel does (with its own skipToken, whose cache the
// parse that just ran filled, so each step is a lookup), or -1.
function linkLabelEnd(state: InlineState, start: number): number {
  const oldPos = state.pos
  const oldFlag = state.isInLabel
  state.pos = start + 1
  state.isInLabel = true
  let level = 1
  let end = -1
  while (state.pos < state.posMax) {
    const code = state.src.charCodeAt(state.pos)
    if (code === 0x5b) level++
    else if (code === 0x5d && --level === 0) {
      end = state.pos
      break
    }
    state.parser.skipToken(state)
  }
  state.pos = oldPos
  state.isInLabel = oldFlag
  return end
}

function withAngleDestinations(rule: (state: InlineState, silent?: boolean) => boolean, unswap: Unswap) {
  return (state: InlineState, silent?: boolean): boolean => {
    const start = state.pos
    const before = state.tokens.length
    const ok = rule(state, silent)
    if (!ok || silent) return ok
    const label = state.src.charCodeAt(start) === 0x21 ? start + 1 : start
    const labelEnd = linkLabelEnd(state, label)
    if (labelEnd < 0 || state.src.charCodeAt(labelEnd + 1) !== 0x28) return ok
    const raw = angleDestination(state.src, skipSpaces(state.src, labelEnd + 2, state.posMax), state.posMax)
    if (raw === null) return ok
    const token = state.tokens.slice(before).find((t) => t.type === 'link_open' || t.type === 'image')
    if (!token) return ok
    const field = token.type === 'image' ? 'src' : 'href'
    const undecoded = undecodedAngleDestination(token[field], raw, unswap)
    if (undecoded !== undefined) token[field] = undecoded
    return ok
  }
}

type CoreState = {
  tokens: Array<{ type: string; content?: string }>
  inline: InlineState['parser']
  env: { references?: Record<string, { href: string }> }
}

// The same for reference definitions. The core rule parses each paragraph's
// definitions one after another, each on its own inline state, until one
// fails: what it consumed is the paragraph's content before minus after, and
// an attempt starting past that is the one that failed. The states are
// collected through skipToken, which the label scan calls; an empty label
// (`[]:`, which Remarkable accepts) calls nothing, so those are found in the
// consumed text. Each definition is then read back in source order, the first
// of a label winning, as in the parser.
function withAngleReferences(rule: (state: CoreState) => unknown, unswap: Unswap): (state: CoreState) => unknown {
  return (state) => {
    const parser = state.inline
    const skipToken = parser.skipToken
    const seen: InlineState[] = []
    const seenSet = new Set<InlineState>()
    const known = new Set(Object.keys(state.env.references ?? {}))
    const tokens = state.tokens
    const paragraphs: Array<{ token: { content?: string }; before: string }> = []
    for (let i = 1; i < tokens.length - 1; i++) {
      if (tokens[i].type === 'inline' && tokens[i - 1].type === 'paragraph_open' && tokens[i + 1].type === 'paragraph_close') {
        paragraphs.push({ token: tokens[i], before: tokens[i].content ?? '' })
      }
    }
    parser.skipToken = function (this: unknown, inline: InlineState) {
      if (!seenSet.has(inline)) {
        seenSet.add(inline)
        seen.push(inline)
      }
      return skipToken.call(this, inline)
    }
    let result: unknown
    try {
      result = rule(state)
    } finally {
      parser.skipToken = skipToken
    }
    const references = state.env.references
    if (!references) return result
    let next = 0
    for (const { token, before } of paragraphs) {
      if (before.charCodeAt(0) !== 0x5b) continue
      const consumed = before.length - (token.content ?? '').length
      const attempts: Array<{ at: number; inline?: InlineState }> = []
      let last = -1
      while (next < seen.length) {
        const at = before.length - seen[next].src.length
        if (at <= last || !before.endsWith(seen[next].src)) break
        attempts.push({ at, inline: seen[next] })
        last = at
        next++
      }
      for (let at = before.indexOf('[]:'); at !== -1 && at < consumed; at = before.indexOf('[]:', at + 1)) {
        let k = at - 1
        while (k >= 0 && before.charCodeAt(k) === 0x20) k--
        if (k === -1 || before.charCodeAt(k) === 0x0a) attempts.push({ at })
      }
      attempts.sort((x, y) => x.at - y.at)
      for (const { at, inline } of attempts) {
        if (at >= consumed) break
        const labelEnd = inline ? at + linkLabelEnd(inline, 0) : at + 1
        if (labelEnd < at || before.charCodeAt(labelEnd) !== 0x5d || before.charCodeAt(labelEnd + 1) !== 0x3a) continue
        const key = before.slice(at + 1, labelEnd).trim().replace(/\s+/g, ' ').toUpperCase()
        if (known.has(key)) continue
        known.add(key)
        const raw = angleDestination(before, skipSpaces(before, labelEnd + 2, before.length), before.length)
        if (raw === null || !references[key]) continue
        const undecoded = undecodedAngleDestination(references[key].href, raw, unswap)
        if (undecoded !== undefined) references[key].href = undecoded
      }
    }
    return result
  }
}

// Entities the app render swaps out wait as DELIMITER index DELIMITER. The
// delimiter is a character the body does not hold, so author text can never
// read as a placeholder (#2154): a zero-width space as before, or the first
// free one of a few other invisible characters, then the private use area
// (past AMP_PAIR). When the body holds every one of those, a pair of private
// use characters it never holds in that order.
function placeholderDelimiter(input: string): string {
  // Raw or written as a reference (`&#8203;`), which the DOM decodes.
  if (input.includes('&')) input += decodeEntities(input)
  const free = PLACEHOLDER_DELIMITERS.find((d) => !input.includes(d))
  if (free) return free
  const used = new Uint8Array(PRIVATE_DELIMITERS_TO - PRIVATE_DELIMITERS_FROM + 1)
  for (let i = 0; i < input.length; i++) {
    const code = input.charCodeAt(i)
    if (code >= PRIVATE_DELIMITERS_FROM && code <= PRIVATE_DELIMITERS_TO) used[code - PRIVATE_DELIMITERS_FROM] = 1
  }
  const at = used.indexOf(0)
  if (at !== -1) return String.fromCharCode(PRIVATE_DELIMITERS_FROM + at)
  const size = used.length
  const pairs = new Set<number>()
  for (let i = 0; i + 1 < input.length; i++) {
    const first = input.charCodeAt(i) - PRIVATE_DELIMITERS_FROM
    const second = input.charCodeAt(i + 1) - PRIVATE_DELIMITERS_FROM
    if (first >= 0 && first < size && second >= 0 && second < size) pairs.add(first * size + second)
  }
  // At most input.length pairs are taken, so a free one turns up within that.
  let pair = 0
  while (pairs.has(pair)) pair++
  return String.fromCharCode(PRIVATE_DELIMITERS_FROM + Math.floor(pair / size), PRIVATE_DELIMITERS_FROM + (pair % size))
}

// Expands each tab as Remarkable's ParserBlock.parse will: to the next
// four-column stop of its line, read after the parser's line-break and
// no-break-space normalisation (which leaves tabs where they are). Only the
// tabs change, so the parser's own pass sees the same lines and has no tab
// left to expand; normalising line breaks here too would not be a fixed point
// (`\r\r\n` collapses one step further on a second pass).
function expandTabsLikeRemarkable(src: string): string {
  if (!src.includes('\t')) return src
  const normalized = src.replace(/\u00a0/g, ' ').replace(/\r[\n\u0085]|[\u2424\u2028\u0085]/g, '\n')
  const widths: string[] = []
  let lineStart = 0
  let lastTabPos = 0
  for (let offset = 0; offset < normalized.length; offset++) {
    const code = normalized.charCodeAt(offset)
    if (code === 0x0a) {
      lineStart = offset + 1
      lastTabPos = 0
    } else if (code === 0x09) {
      widths.push('    '.slice((offset - lineStart - lastTabPos) % 4))
      lastTabPos = offset - lineStart + 1
    }
  }
  let k = 0
  return src.replace(/\t/g, () => widths[k++])
}

type CodeToken = { type: string; content?: string; params?: string; children?: CodeToken[] }

// Code renders its text verbatim, so it gets back the entities as written,
// in exactly the code the parser found: blocks fenced or indented, and spans
// paired within one block (#2093, #2154). Before the highlighter runs, which
// split a placeholder across spans (`0 1b2` for `&amp; &lt;b&gt;`, #2093).
function restoreCodeEntities(unswap: (text: string) => string) {
  const restore = (token: CodeToken) => {
    if (token.type !== 'code' && token.type !== 'fence') return
    if (token.content) token.content = unswap(token.content)
    if (token.params) token.params = unswap(token.params)
  }
  return (state: { tokens: CodeToken[] }): boolean => {
    for (const token of state.tokens) {
      restore(token)
      if (token.type === 'inline' && token.children) token.children.forEach(restore)
    }
    return true
  }
}

// Conditionally load lolight for syntax highlighting (Node.js only)
// Browser builds will gracefully handle missing lolight by using fallback
type Lolight = typeof import('lolight').default
let lolightPromise: Promise<Lolight | null> | null = null
let lolightModule: Lolight | null = null

async function loadLolight() {
  if (typeof window !== 'undefined') {
    // Skip in browser environment
    return null
  }

  if (lolightModule) {
    return lolightModule
  }

  if (!lolightPromise) {
    lolightPromise = import('lolight')
      .then((mod) => {
        lolightModule = mod.default || mod
        return lolightModule
      })
      .catch(() => {
        lolightModule = null
        return null
      })
  }

  return lolightPromise
}

// Synchronous wrapper for backward compatibility
function getLolightInstance() {
  return lolightModule
}

// Pre-load lolight when module is imported (Node.js only)
if (typeof window === 'undefined') {
  loadLolight().catch(() => {
    // Silently fail if lolight is not available
  })
}

/**
 * Fixes block-level HTML tags that Remarkable incorrectly wraps inside <p> tags.
 *
 * Problem: When Remarkable encounters block-level HTML tags (like <center>, <div>)
 * with blank lines after them, it generates malformed HTML like:
 *   <p><center></p>
 *   <p>content</p>
 *   <p></center></p>
 *
 * This function repairs such patterns by:
 * 1. Extracting block-level tags from paragraph wrappers
 * 2. Removing empty paragraphs created by this mismatch
 *
 * @param html - The HTML string to fix
 * @returns The repaired HTML string
 */
// Block-level tags that should never be wrapped in <p> tags. Defined at
// module scope so the alternation string and the Set used by the
// non-regex closing pass stay in sync.
const BLOCK_TAGS_ALTERNATION = 'center|div|table|figure|section|article|aside|header|footer|nav|main'
const BLOCK_TAGS_SET = new Set(BLOCK_TAGS_ALTERNATION.split('|'))

function fixBlockLevelTagsInParagraphs(html: string): string {
  // Pattern 1: <p><tag></p> - opening tag wrapped in <p>
  // Replace with just <tag> (remove the wrapping <p>)
  const openingPattern = new RegExp(`<p>(<(?:${BLOCK_TAGS_ALTERNATION})(?:\\s[^>]*)?>)<\\/p>`, 'gi')
  html = html.replace(openingPattern, '$1')

  // Pattern 2: <p></tag></p> - closing tag wrapped in <p>
  // Replace with just </tag> (remove the wrapping <p>)
  const closingPattern = new RegExp(`<p>(<\\/(?:${BLOCK_TAGS_ALTERNATION})>)<\\/p>`, 'gi')
  html = html.replace(closingPattern, '$1')

  // Pattern 3: <p><tag><br> or <p><tag> at start of <p>
  // This handles cases where the tag is at the start but followed by content
  const startPattern = new RegExp(`<p>(<(?:${BLOCK_TAGS_ALTERNATION})(?:\\s[^>]*)?>)(?:<br>)?\\s*`, 'gi')
  html = html.replace(startPattern, '$1<p>')

  // Pattern 4: </tag></p> or <br>\n</tag></p> - closing tag at end of <p>
  // Done as a single linear pass instead of a regex. The previous form
  // `\s*(?:<br>)?\s*(<\/(?:…)>)<\/p>` had two unanchored `\s*`
  // quantifiers that backtracked quadratically on whitespace-heavy
  // inputs with no matching closing tag.
  html = moveBlockClosingTagOutOfParagraph(html, BLOCK_TAGS_SET)

  // Clean up any empty paragraphs that may have been created
  html = html.replace(/<p>\s*<\/p>/g, '')
  html = html.replace(/<p><br>\s*<\/p>/g, '')

  return html
}

/**
 * Removes the document wrapper the DOM round trip adds (xml declaration,
 * doctype, html/head/body and the xhtml namespace). Exact tag names only:
 * `<header>`, `<htmlx>` and `<html-x>` are author content.
 */
export function stripDocumentWrapper(html: string): string {
  return html
    .replace(/ xmlns="http:\/\/www.w3.org\/1999\/xhtml"/g, '')
    // Strip full HTML document wrapper (native browser DOMParser wraps in <html><head><body>)
    .replace(/^<\?xml[^?]*\?>/, '')
    .replace(/^<!DOCTYPE[^>]*>/i, '')
    // Exact tag names: `<header>` and `<htmlx>` are author content.
    .replace(/<\/?html(?=[\s/>])[^>]*>/g, '')
    .replace(/<head(?=[\s/>])[^>]*>[\s\S]*?<\/head>/g, '')
    .replace('<body id="root">', '')
    .replace('</body>', '')
    .trim()
}

export function markdownToHTML(input: string, forApp: boolean, parentDomain: string = 'ecency.com', seoContext?: SeoContext, renderOptions?: RenderOptions): string {
  // Internalize leofinance.io links
  input = input.replace(new RegExp("https://leofinance.io/threads/view/","g"), "/@");
  input = input.replace(new RegExp("https://leofinance.io/posts/","g"), "/@");
  input = input.replace(new RegExp("https://leofinance.io/threads/","g"), "/@");
  input = input.replace(new RegExp("https://inleo.io/threads/view/","g"), "/@");
  input = input.replace(new RegExp("https://inleo.io/posts/","g"), "/@");
  input = input.replace(new RegExp("https://inleo.io/threads/","g"), "/@");


  const md = new Remarkable({
    html: true,
    breaks: true,
    typographer: false,
    // Returning '' hands the block back to remarkable, which escapes it as
    // plain code. A raw `str` used to be returned, and token text was written
    // unescaped, so markup in a string literal (`"<i>hi</i>"`) rendered as
    // markup inside the code block.
    highlight: function (str: string) {
      // The highlighter is slow on large input (3.5 s for 60 KB, #2097), and
      // it runs synchronously on the SSR path: past this size, plain code.
      if (str.length > MAX_HIGHLIGHT_LENGTH) {
        return ''
      }
      const lolightInstance = getLolightInstance()
      if (!lolightInstance) {
        return ''
      }

      try {
        const tokens = lolightInstance.tok(str);
        return tokens.map(
          (token: string[]) => `<span class="ll-${token[0]}">${escapeCode(token[1])}</span>`
        ).join('')
      } catch (err) { console.error(err) }

      return ''
    }
  }).use(linkify)
  // Before linkify, so every link and image token here was written as
  // markdown (linkify's hrefs come from text, already decoded).
  md.core.ruler.before('linkify', 'decode_destinations', decodeDestinations, {})
  // The angle wrappers go on first, so they read the source the paired
  // wrappers hand the rule.
  wrapRule(md.inline.ruler as unknown as RuleList, 'links', (rule) => withAngleDestinations(rule, (text) => unswap(text)))
  wrapRule(md.inline.ruler as unknown as RuleList, 'links', withPairedSource)
  wrapRule(md.inline.ruler as unknown as RuleList, 'autolink', withOriginalSource)
  wrapRule(md.core.ruler as unknown as RuleList, 'references', (rule) => withAngleReferences(rule, (text) => unswap(text)))
  wrapRule(md.core.ruler as unknown as RuleList, 'references', withPairedReferences)
  md.core.ruler.enable([
    'abbr'
  ]);
  md.block.ruler.enable([
    'footnote',
    'deflist'
  ]);
  md.inline.ruler.enable([
    'footnote_inline',
    'ins',
    'mark',
    'sub',
    'sup'
  ]);
  const serializer = new XMLSerializer()

  if (!input) {
    return ''
  }

  let output = '';

  ampEscapes = input.includes('\\&') && !hasAmpSentinel(input)

  // Replace entities with placeholders to preserve them during rendering
  const entities = forApp ? input.match(ENTITY_REGEX) : null;
  const entityPlaceholders: string[] = [];
  const delimiter = entities ? placeholderDelimiter(input) : null;
  const placeholderRe = delimiter ? new RegExp(`${delimiter}(0|[1-9]\\d*)${delimiter}`, 'g') : null;
  const unswap = (text: string) =>
    placeholderRe ? text.replace(placeholderRe, (placeholder, index: string) => entityPlaceholders[+index] ?? placeholder) : text;

  if (entities && delimiter) {
    // The parser expands tabs to four-column stops. A placeholder is shorter
    // than its entity, so a tab after one would land on another stop: expand
    // them first, exactly as the parser would (#2154).
    input = expandTabsLikeRemarkable(input);
    // Deduplicate entities to avoid duplicate placeholders. Each distinct entity
    // gets a markdown-inert placeholder (the delimiter around its index).
    const indexOf = new Map<string, number>();
    for (const entity of entities) {
      if (!indexOf.has(entity)) {
        indexOf.set(entity, entityPlaceholders.length);
        entityPlaceholders.push(entity);
      }
    }
    // Replace every occurrence OUTSIDE a URL. The placeholders stand in for
    // entities in text; inside a URL one reached the transforms instead, and an
    // image was proxied with the placeholder in its URL, inside the proxy hash
    // where the final restore cannot reach, so the app loaded a different image
    // URL than the post names (#2092). One regex pass per segment, linear in
    // its length (a split/join per distinct entity was not).
    //
    // Code is swapped too and gets its entities back from the parser's own
    // code tokens (restoreCodeEntities), so it renders exactly as on the web.
    // An escaped `\\&` (odd backslash run) is a literal ampersand on the
    // web, in a destination of any scheme and in text: the entity after it is
    // not one, so it is left for the parser as the web leaves it (#2098).
    const escaped = (text: string, at: number) => {
      let k = at - 1;
      while (k >= 0 && text.charCodeAt(k) === 0x5c) k--;
      return (at - 1 - k) % 2 === 1;
    };
    const swap = (text: string) =>
      text.replace(ENTITY_REGEX, (entity: string, ...rest: unknown[]) => {
        const at = rest[rest.length - 2] as number;
        return escaped(text, at) ? entity : `${delimiter}${indexOf.get(entity)}${delimiter}`;
      });
    let protectedInput = '';
    let last = 0;
    for (const m of regexMatches(input, URL_RUN)) {
      const at = m.index ?? 0;
      protectedInput += swap(input.slice(last, at)) + m[0];
      last = at + m[0].length;
    }
    input = protectedInput + swap(input.slice(last));
    md.core.ruler.before('linkify', 'restore_code_entities', restoreCodeEntities(unswap), {})
  }

  // The sanitize-only fallback below skips the DOM transforms, so the
  // sanitizer applies their safety rules itself (#1919).
  const untransformed = { ...renderOptions, untransformed: true }
  // Stamps what the transforms produced; see render-boundary.method.ts.
  const nonce = createRenderNonce()

  try {
    output = md.render(input)
    if (ampEscapes) output = sourceAmp(output)

    // Fix malformed block-level HTML tags that Remarkable wraps in <p> tags
    // This prevents "Opening and ending tag mismatch" errors from DOMParser
    output = fixBlockLevelTagsInParagraphs(output)

    const doc = DOMParser.parseFromString(`<body id="root">${removeDuplicateAttributes(output)}</body>`, 'text/html')

    stripAuthorMarkers(doc as unknown as Document)
    traverse(doc as unknown as Node, forApp, 0, { firstImageFound: false }, parentDomain, seoContext, renderOptions)

    output = serializer.serializeToString(doc, xmldomNodeFilter(nonce))
  } catch (error) {
    // @xmldom/xmldom is stricter than old xmldom and throws ParseError for malformed HTML
    // Instead of returning empty string (bad UX), attempt graceful recovery
    try {
      // Strategy:
      // 1. Pre-sanitize to remove XSS vectors
      // 2. Use lenient htmlparser2 to auto-repair malformed HTML (auto-close unclosed tags)
      // 3. Serialize the repaired HTML
      // 4. Re-parse with @xmldom/xmldom (now well-formed)
      // 5. Traverse and serialize as normal
      // Reuse the markdown output already produced before the failing
      // DOMParser pass — `md.render(input)` is the expensive step and
      // re-running it costs ~100 ms per fallback hit on a 60 KB body.
      const preSanitized = sanitizeHtml(output, { ...renderOptions, beforeTransform: true })

      // Use htmlparser2 to parse malformed HTML leniently
      const dom = htmlparser2.parseDocument(preSanitized, {
        // lenient options - don't throw on malformed HTML
        lowerCaseTags: false,
        lowerCaseAttributeNames: false,
      })

      // Serialize back to well-formed HTML (htmlparser2 auto-closes tags)
      const repairedHtml = domSerializer(dom.children)

      // Now parse the well-formed HTML with @xmldom/xmldom
      const doc = DOMParser.parseFromString(`<body id="root">${removeDuplicateAttributes(repairedHtml)}</body>`, 'text/html')

      stripAuthorMarkers(doc as unknown as Document)
      traverse(doc as unknown as Node, forApp, 0, { firstImageFound: false }, parentDomain, seoContext, renderOptions)

      output = serializer.serializeToString(doc, xmldomNodeFilter(nonce))
    } catch (fallbackError) {
      // If DOM parsing fails, sanitize the Remarkable HTML output directly.
      // This skips the traverse() image proxy/link rewriting but preserves
      // readable HTML content instead of showing escaped tags.
      output = sanitizeHtml(output || (ampEscapes ? sourceAmp(md.render(input)) : md.render(input)), untransformed)
    }
  }

  // Restore original entities from placeholders, in one pass (a split/join
  // per distinct entity was quadratic on a body of many distinct references).
  // The delimiter is not in the body, so every match is one of ours.
  if (output && entityPlaceholders.length > 0) {
    output = unswap(output);
  }

  output = stripDocumentWrapper(output)

  return sanitizeHtml(output, { ...renderOptions, renderNonce: nonce })
}
