import { traverse } from './traverse.method'
import { sanitizeHtml } from './sanitize-html.method'
import { stripAuthorMarkers } from './strip-author-markers.method'
import { createRenderNonce, xmldomNodeFilter } from './render-boundary.method'
import { decodeCompleteReferences, moveBlockClosingTagOutOfParagraph, removeDuplicateAttributes } from '../helper'
import { regexMatches } from '../regex-matches'
import { DOMParser, XMLSerializer, ENTITY_REGEX } from '../consts'
import { Remarkable } from 'remarkable'
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
// without backtracking: linear.
const URL_RUN = /https?:\/\/(?:[^\s<>"'`()]|\([^\s<>"'`()]*\)|\()+/gi

/**
 * A backslash-escaped `&` in a URL is a literal ampersand (CommonMark), so
 * `[x](https://e.com/?q=\\&copy;)` names `?q=&copy;`. Remarkable drops the
 * backslash before decode_destinations runs, which then read `&copy;` as ©.
 * Written as `&amp;` instead, the destination decode turns it back into the
 * literal `&`, and in text it shows as `&`, as the escape did. Only URLs in
 * markdown change: code keeps its backslash, and a URL in a raw HTML attribute
 * (after `=`, `"` or `'`) is left to the attribute's own reading.
 */
function escapeUrlAmpersands(src: string): string {
  const inUrls = (text: string) => {
    let out = ''
    let last = 0
    for (const m of regexMatches(text, URL_RUN)) {
      const at = m.index ?? 0
      const before = at > 0 ? text[at - 1] : ''
      if (before === '=' || before === '"' || before === "'") continue
      out += text.slice(last, at) + m[0].replace(/\\&/g, '&amp;')
      last = at + m[0].length
    }
    return out + text.slice(last)
  }
  let out = ''
  let last = 0
  for (const [start, end] of codeRanges(src)) {
    if (start < last) continue
    out += inUrls(src.slice(last, start)) + src.slice(start, end)
    last = end
  }
  return out + inUrls(src.slice(last))
}

// Largest code block that is syntax highlighted (#2097).
const MAX_HIGHLIGHT_LENGTH = 20_000

const escapeCode = (text: string): string =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

interface DestinationToken {
  type: string
  src?: string
  href?: string
  children?: DestinationToken[]
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
      if (token.type === 'image' && token.src) token.src = decodeCompleteReferences(token.src)
      else if (token.type === 'link_open' && token.href) token.href = decodeCompleteReferences(token.href)
    }
  }
  return true
}

// A fence line, optionally inside blockquotes: `(?: {0,3}>)+` then one
// optional space; each `>` ends its own repetition, so the match is linear.
const FENCE_OPEN = /^((?: {0,3}>)+ ?)? {0,3}(`{3,}|~{3,})/
const FENCE_CLOSE = /^((?: {0,3}>)+ ?)? {0,3}(`{3,}|~{3,})[ \t]*$/

/**
 * Code in the markdown source, as [start, end) ranges in order: fenced blocks
 * (``` or ~~~ at a line start, inside blockquotes too, to the matching close,
 * the end of a quoted fence's blockquote, or the end) and inline
 * code spans (a backtick run to the next run of the same length). Linear: each
 * line is read once, and each backtick run is paired through a precomputed
 * "next run of the same length" table rather than a search.
 */
function codeRanges(src: string): Array<[number, number]> {
  const ranges: Array<[number, number]> = []
  const runs: Array<[number, number]> = [] // [start, length] of backtick runs outside fences
  let pos = 0
  while (pos < src.length) {
    const eol = src.indexOf('\n', pos)
    const lineEnd = eol === -1 ? src.length : eol
    // A fence may sit in a blockquote (`> ~~~`): each `>` takes its own
    // optional indent, so the prefix is read without ambiguity.
    const open = FENCE_OPEN.exec(src.slice(pos, lineEnd))
    if (open) {
      const quoted = open[1] !== undefined
      const fence = open[2]
      let end = src.length
      let p = lineEnd + 1
      while (p < src.length) {
        const e = src.indexOf('\n', p)
        const le = e === -1 ? src.length : e
        const line = src.slice(p, le)
        // A quoted fence ends with its blockquote: the next line without `>`.
        if (quoted && !/^ {0,3}>/.test(line)) {
          end = p - 1
          break
        }
        const close = FENCE_CLOSE.exec(line)
        if (close && close[2][0] === fence[0] && close[2].length >= fence.length) {
          end = le
          break
        }
        p = le + 1
      }
      ranges.push([pos, end])
      pos = end + 1
      continue
    }
    for (let i = pos; i < lineEnd; i++) {
      if (src.charCodeAt(i) !== 0x60) continue
      let j = i
      while (j < lineEnd && src.charCodeAt(j) === 0x60) j++
      runs.push([i, j - i])
      i = j - 1
    }
    pos = lineEnd + 1
  }
  // Inline spans: a run opens a span closed by the next run of the same length.
  const nextSame: number[] = new Array(runs.length).fill(-1)
  const lastOfLength = new Map<number, number>()
  for (let k = runs.length - 1; k >= 0; k--) {
    nextSame[k] = lastOfLength.get(runs[k][1]) ?? -1
    lastOfLength.set(runs[k][1], k)
  }
  for (let k = 0; k < runs.length; k++) {
    const close = nextSame[k]
    if (close === -1) continue
    ranges.push([runs[k][0], runs[close][0] + runs[close][1]])
    k = close
  }
  return ranges.sort((a, b) => a[0] - b[0])
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

  if (input.includes('\\&')) input = escapeUrlAmpersands(input)

  // Replace entities with deterministic placeholders to preserve them during rendering
  const entities = input.match(ENTITY_REGEX);
  const entityPlaceholders: string[] = [];

  if (entities && forApp) {
    // Deduplicate entities to avoid duplicate placeholders. Each distinct entity
    // gets a markdown-inert placeholder (zero-width spaces around its index).
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
    // Code is left out too: a code span or block renders its text verbatim,
    // and the syntax highlighter split a placeholder across spans, so the
    // restore missed it and the app showed `0 1b2` for `&amp; &lt;b&gt;`
    // (#2093). Code renders exactly as on the web.
    const swap = (text: string) =>
      text.replace(ENTITY_REGEX, (entity) => `\u200B${indexOf.get(entity)}\u200B`);
    const protect = (text: string) => {
      let out = '';
      let last = 0;
      for (const m of regexMatches(text, URL_RUN)) {
        const at = m.index ?? 0;
        out += swap(text.slice(last, at)) + m[0];
        last = at + m[0].length;
      }
      return out + swap(text.slice(last));
    };
    let protectedInput = '';
    let last = 0;
    for (const [start, end] of codeRanges(input)) {
      if (start < last) continue;
      protectedInput += protect(input.slice(last, start)) + input.slice(start, end);
      last = end;
    }
    input = protectedInput + protect(input.slice(last));
  }

  // The sanitize-only fallback below skips the DOM transforms, so the
  // sanitizer applies their safety rules itself (#1919).
  const untransformed = { ...renderOptions, untransformed: true }
  // Stamps what the transforms produced; see render-boundary.method.ts.
  const nonce = createRenderNonce()

  try {
    output = md.render(input)

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
      output = sanitizeHtml(output || md.render(input), untransformed)
    }
  }

  // Restore original entities from placeholders
  // in one pass (a split/join per distinct entity was quadratic on a body of
  // many distinct references).
  // A zero-width space the author wrote can sit right before a placeholder
  // (`\u200B2024` then `\u200B0\u200B`): a match whose index is not one of ours
  // must not consume the placeholder's opening zero-width space, so the scan
  // resumes one character later. Indices are written without leading zeros, so
  // `\u200B00\u200B` is the author's text, not placeholder 0.
  if (forApp && output && entityPlaceholders.length > 0) {
    const placeholderRe = /\u200B(0|[1-9]\d*)\u200B/g;
    let restored = '';
    let last = 0;
    let match: RegExpExecArray | null;
    while ((match = placeholderRe.exec(output)) !== null) {
      const entity = entityPlaceholders[+match[1]];
      if (entity === undefined) {
        placeholderRe.lastIndex = match.index + 1;
        continue;
      }
      restored += output.slice(last, match.index) + entity;
      last = placeholderRe.lastIndex;
    }
    output = restored + output.slice(last);
  }

  output = stripDocumentWrapper(output)

  return sanitizeHtml(output, { ...renderOptions, renderNonce: nonce })
}
