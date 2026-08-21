import { DOMParser } from './consts'
import type { Document } from '@xmldom/xmldom'
import { decodeHTML } from 'entities'

/**
 * Decode HTML character references in user-authored text.
 *
 * `entities.decodeHTML` throws a RangeError on a numeric reference whose digit
 * string overflows a double (309+ decimal or 256+ hex digits, leading zeros
 * included: 0 * Infinity = NaN -> String.fromCodePoint(NaN)). Post bodies and
 * json_metadata come straight from the chain, so a crafted reference must
 * never take a feed page down. Leading zeros are dropped first (they carry no
 * value, and `&#0065;` must still be "A"); a reference that is still overlong
 * after that cannot be a code point and becomes U+FFFD, which is what the HTML
 * spec and the previous decoder (he) produce for an out-of-range value.
 * Anything else the decoder rejects is returned as-is.
 */
const LEADING_ZEROS_DEC = /&#0+(?=[0-9])/g
const LEADING_ZEROS_HEX = /&#x0+(?=[0-9a-f])/gi
const OVERLONG_NUMERIC_REF = /&#(?:x[0-9a-f]{256,}|[0-9]{309,});?/gi

export function decodeEntities(value: string): string {
  const safe = value
    .replace(LEADING_ZEROS_DEC, '&#')
    .replace(LEADING_ZEROS_HEX, (m) => m.slice(0, 3))
    .replace(OVERLONG_NUMERIC_REF, '\uFFFD')
  try {
    return decodeHTML(safe)
  } catch {
    return safe
  }
}

/**
 * Decode an image URL the way the renderer does before proxifying, so a URL's
 * proxy hash (base58 of the exact string) is identical whether it came from the
 * rendered <img> (img.method) or from raw discovery (getEntryImageRawUrl) — i.e.
 * the LCP preload byte-matches the in-body <picture> avif <source>. Decodes HTML
 * entities (&amp;, &#NN;, &#xNN;) then percent-encoding (%XX / non-ASCII).
 * Percent-decoding is guarded so a malformed `%` in user content can't throw
 * (callers run at SSR time).
 */
export function decodeImageSrc(src: string): string {
  const entityDecoded = decodeEntities(src)
  try {
    return decodeURIComponent(entityDecoded).trim()
  } catch {
    return entityDecoded.trim()
  }
}

/**
 * Removes duplicate attributes from HTML tags.
 * @xmldom/xmldom 0.9+ throws fatalError on duplicate attributes (e.g., <iframe allowfullscreen allowfullscreen>).
 *
 * Single-pass tokenizer. The previous regex-based implementation had
 * catastrophic backtracking on malformed inputs such as
 *   <div style=background-color:yellow;">
 * (unquoted attribute value followed by a stray quote, no closing `>` for the
 * tag in the immediate vicinity). The nested alternation
 *   (?:[^>"']+|"[^"]*"|'[^']*')*?
 * combined with a greedy `+` inside the non-greedy `*?` produced O(n²+)
 * backtracking that pinned a 6 KB body for >30 seconds, tripping the watchdog
 * and killing the container.
 */
function isSpaceChar(c: number): boolean {
  return c === 0x20 || c === 0x09 || c === 0x0a || c === 0x0d || c === 0x0c
}

function isAsciiLetter(c: number): boolean {
  return (c >= 0x41 && c <= 0x5a) || (c >= 0x61 && c <= 0x7a)
}

function isTagNameChar(c: number): boolean {
  return isAsciiLetter(c) || (c >= 0x30 && c <= 0x39)
}

function isAttrNameChar(c: number): boolean {
  // a-zA-Z, 0-9, '-', '_', ':', '.'
  return (
    isAsciiLetter(c) ||
    (c >= 0x30 && c <= 0x39) ||
    c === 0x2d ||
    c === 0x5f ||
    c === 0x3a ||
    c === 0x2e
  )
}

export function removeDuplicateAttributes(html: string): string {
  const n = html.length
  let out = ''
  let i = 0

  while (i < n) {
    const lt = html.indexOf('<', i)
    if (lt < 0) {
      out += html.slice(i)
      break
    }
    out += html.slice(i, lt)

    // Only opening tags that start with an ASCII letter and have at least
    // one whitespace before the attributes are normalised — matches the
    // scope of the prior regex (closing tags, comments, doctypes, and bare
    // `<` characters are left untouched).
    if (lt + 1 >= n || !isAsciiLetter(html.charCodeAt(lt + 1))) {
      out += '<'
      i = lt + 1
      continue
    }

    let p = lt + 1
    while (p < n && isTagNameChar(html.charCodeAt(p))) p++
    const tagName = html.slice(lt + 1, p)

    if (p >= n || !isSpaceChar(html.charCodeAt(p))) {
      out += '<'
      i = lt + 1
      continue
    }

    const attrs: string[] = []
    const seen = new Set<string>()
    let q = p

    while (q < n) {
      while (q < n && isSpaceChar(html.charCodeAt(q))) q++
      if (q >= n) break

      const ch = html.charCodeAt(q)
      if (ch === 0x3e) break // '>'
      if (ch === 0x2f && q + 1 < n && html.charCodeAt(q + 1) === 0x3e) break // '/>'

      const nameStart = q
      while (q < n && isAttrNameChar(html.charCodeAt(q))) q++
      if (q === nameStart) {
        // Stray character that can't start an attribute name. Skip it so
        // we make progress; the original tag bytes are preserved verbatim
        // below if we ultimately can't close the tag.
        q++
        continue
      }
      const attrName = html.slice(nameStart, q)

      let r = q
      while (r < n && isSpaceChar(html.charCodeAt(r))) r++

      let valueEnd = q
      if (r < n && html.charCodeAt(r) === 0x3d /* '=' */) {
        r++
        while (r < n && isSpaceChar(html.charCodeAt(r))) r++
        if (r < n) {
          const v = html.charCodeAt(r)
          if (v === 0x22 || v === 0x27) {
            // Quoted value
            const quote = html[r]
            const end = html.indexOf(quote, r + 1)
            if (end < 0) {
              // Unterminated quote — bail to the next `>` to avoid eating
              // the rest of the document.
              const gt = html.indexOf('>', r + 1)
              valueEnd = gt < 0 ? n : gt
            } else {
              valueEnd = end + 1
            }
          } else {
            // Unquoted value: read until whitespace or `>`
            let s = r
            while (s < n) {
              const k = html.charCodeAt(s)
              if (isSpaceChar(k) || k === 0x3e) break
              s++
            }
            valueEnd = s
          }
        } else {
          valueEnd = r
        }
      }

      const fullAttr = html.slice(nameStart, valueEnd)
      q = valueEnd

      const key = attrName.toLowerCase()
      if (!seen.has(key)) {
        seen.add(key)
        attrs.push(fullAttr)
      }
    }

    let selfClose = false
    if (q < n && html.charCodeAt(q) === 0x2f /* '/' */) {
      selfClose = true
      q++
    }
    if (q >= n || html.charCodeAt(q) !== 0x3e /* '>' */) {
      // Unterminated tag — leave the original input alone past the `<` and
      // continue scanning. This mirrors the prior regex's behaviour of not
      // matching such fragments.
      out += '<'
      i = lt + 1
      continue
    }
    q++

    const attrsJoined = attrs.length > 0 ? ' ' + attrs.join(' ') : ''
    out += '<' + tagName + attrsJoined + (selfClose ? ' /' : '') + '>'
    i = q
  }

  return out
}

export function createDoc(html: string): Document | null {
  if (html.trim() === '') {
    return null
  }

  // Preprocess to remove duplicate attributes which cause @xmldom/xmldom 0.9+ to throw fatalError
  const cleanedHtml = removeDuplicateAttributes(html)

  // Wrap in body tag to handle multiple root elements
  // This is needed because markdownToHTML can generate multiple top-level elements
  // (e.g., <center>...</center><hr />) which DOMParser doesn't accept without a wrapper
  // Using <body> instead of <div> prevents conflicts with <div> elements in the content
  //
  // @xmldom/xmldom 0.9+ always throws a ParseError from its internal fatalError() path
  // (see dom-parser.js:490) for severely malformed HTML — e.g., mismatched tags like
  // <body>...<p>...</body> — regardless of the onError handler returning undefined.
  // The onError handler only gets to observe; the throw still happens.
  //
  // Wrap in try/catch so that pathologically-malformed post bodies degrade gracefully
  // (no image preload hint) instead of crashing the SSR render of /entry/[...]. Both
  // callers in catch-post-image.ts already handle a null return.
  try {
    return DOMParser.parseFromString(`<body>${cleanedHtml}</body>`, 'text/html')
  } catch {
    return null
  }
}

export function makeEntryCacheKey(entry: any): string {
  return `${entry.author}-${entry.permlink}-${entry.last_update}-${entry.updated}`
}

/**
 * Linear-time HTML-tag stripper. Replaces the regex
 *   /(<([^>]+)>)/gi
 * which `regexp/no-super-linear-move` flags as quadratic on inputs with
 * many `<`s that never close. Mirrors the regex's behaviour: matches
 * `<tag...>` with at least one character between the angle brackets and
 * removes it, but leaves bare `<` (with no `>` to close it) and `<>`
 * (empty content) in place.
 */
export function stripHtmlTags(s: string): string {
  const n = s.length
  let out = ''
  let i = 0
  while (i < n) {
    const lt = s.indexOf('<', i)
    if (lt < 0) {
      out += s.slice(i)
      break
    }
    out += s.slice(i, lt)
    const gt = s.indexOf('>', lt + 1)
    if (gt < 0) {
      // Unclosed `<` — original regex required a `>` to match, so keep
      // the remaining text intact.
      out += s.slice(lt)
      break
    }
    if (gt === lt + 1) {
      // `<>` empty — original `[^>]+` required at least one inner char,
      // so preserve the literal `<>`.
      out += s.slice(lt, gt + 1)
      i = gt + 1
      continue
    }
    i = gt + 1
  }
  return out
}

/**
 * Linear-time trailing-`/` strip. Replaces the regex
 *   /\/+$/
 * which `regexp/no-super-linear-move` flags as quadratic on inputs
 * that end in a long run of slashes followed by anything else (the
 * engine retries at every starting position).
 */
export function trimTrailingSlash(s: string): string {
  let end = s.length
  while (end > 0 && s.charCodeAt(end - 1) === 0x2f /* '/' */) end--
  return s.slice(0, end)
}

/**
 * Linear-time query-string strip. Replaces the regex
 *   /\?.+$/
 * with a simple `indexOf` + `slice`. Matches the regex's behaviour:
 * strips only if `?` exists *and* at least one character follows it
 * (`?` at end-of-string leaves the input unchanged).
 */
export function stripQueryString(s: string): string {
  const q = s.indexOf('?')
  return q >= 0 && q < s.length - 1 ? s.slice(0, q) : s
}

// HTML ASCII whitespace per WHATWG/HTML spec
// (https://infra.spec.whatwg.org/#ascii-whitespace):
//   U+0009 TAB, U+000A LF, U+000C FF, U+000D CR, U+0020 SPACE.
// Narrower than JS regex `\s` (which also matches U+000B VT, NBSP,
// the U+2000–U+200A run, U+2028/U+2029, U+202F, U+205F, U+3000, BOM).
// See `moveBlockClosingTagOutOfParagraph` below for the rationale.
function isHtmlWhitespace(c: number): boolean {
  return c === 0x20 || c === 0x09 || c === 0x0a || c === 0x0d || c === 0x0c
}

/**
 * Linear-time replacement for the `endPattern` regex in
 * `markdown-to-html.method.ts`:
 *
 *   /(?:\s*<br>)?\s*(<\/(?:tagA|tagB|…)>)<\/p>/gi   →   '</p>$1'
 *
 * Anchors on `</p>` (rare, found via `indexOf`), checks that the
 * character immediately before is `>`, walks back to find the matching
 * `</tag…>`, and — if `tag` is one of the configured block tags —
 * rewrites the run to `</p></tag…>` while stripping any preceding
 * HTML-ASCII-whitespace + optional `<br>` + more HTML-ASCII-whitespace.
 *
 * The regex form had two unanchored `\s*` quantifiers that
 * `regexp/no-super-linear-move` flagged as quadratic on whitespace-heavy
 * inputs without a matching closing tag (engine retried at every
 * starting position). This pass is O(n).
 *
 * **Intentional divergence from the regex's `\s` class.** The regex
 * stripped JS-regex whitespace (which includes U+000B VT, NBSP, em
 * space, etc.); this helper only strips HTML-spec ASCII whitespace.
 * Markdown→HTML output doesn't insert those characters around `<br>`
 * in practice, so the behavioural difference is theoretical; when it
 * does happen the worst-case outcome is suboptimal HTML (a block
 * closing tag stays inside `<p>`), not invalid HTML or a security
 * issue. Aligning the whitespace class with the HTML spec is a
 * deliberate correctness choice, not an oversight — if a future
 * regression test wants exact `\s` parity, expand `isHtmlWhitespace`
 * accordingly.
 */
export function moveBlockClosingTagOutOfParagraph(html: string, blockTags: Set<string>): string {
  const n = html.length
  let out = ''
  let i = 0

  while (i < n) {
    const pStart = html.indexOf('</p>', i)
    if (pStart < 0) {
      out += html.slice(i)
      break
    }

    // The closing block tag must end immediately before `</p>` (i.e. the
    // char before `</p>` is `>`). Anything else means there's nothing
    // for this pass to do at this position.
    if (pStart === i || html.charCodeAt(pStart - 1) !== 0x3e /* '>' */) {
      out += html.slice(i, pStart + 4)
      i = pStart + 4
      continue
    }

    // Find the matching `</` for that closing `>`. Worst-case scans
    // back to the previous match boundary `i` when the run before
    // `</p>` contains no `</`; total work across the whole input is
    // still amortised O(n) because each character is visited at most
    // twice (once forward by `indexOf`, once backward here).
    const closingStart = html.lastIndexOf('</', pStart - 2)
    if (closingStart < i) {
      out += html.slice(i, pStart + 4)
      i = pStart + 4
      continue
    }
    const tagName = html.slice(closingStart + 2, pStart - 1).toLowerCase()
    if (!blockTags.has(tagName)) {
      out += html.slice(i, pStart + 4)
      i = pStart + 4
      continue
    }

    // Walk back from `closingStart` over whitespace, optionally one
    // `<br>`, and more whitespace — mirroring the regex's stripping
    // semantics exactly.
    let k = closingStart
    while (k > i && isHtmlWhitespace(html.charCodeAt(k - 1))) k--
    if (k - 4 >= i && html.slice(k - 4, k).toLowerCase() === '<br>') {
      k -= 4
      while (k > i && isHtmlWhitespace(html.charCodeAt(k - 1))) k--
    }

    out += html.slice(i, k) + '</p>' + html.slice(closingStart, pStart)
    i = pStart + 4
  }

  return out
}

export function extractYtStartTime(url:string):string {
  try {
    const urlObj = new URL(url);
    const params = new URLSearchParams(urlObj.search);
    if(params.has('t')){
      const t = params.get('t');
      return '' + parseInt(t || '0'); //parsing is important as sometimes t is famated '123s';
    }else if (params.has('start')){
      return params.get('start') || '';
    }
    return '';
  } catch (error) {
    return '';
  }
}
export function sanitizePermlink(permlink: string): string {
  if (!permlink || typeof permlink !== 'string') {
    return ''
  }

  const [withoutQuery] = permlink.split('?')
  const [cleaned] = withoutQuery.split('#')

  return cleaned
}

export function isValidPermlink(permlink: string): boolean {
  const sanitized = sanitizePermlink(permlink)

  if (!sanitized) {
    return false
  }

  // Should not contain image extensions, query params, or fragments
  const isImage = /\.(jpg|jpeg|png|webp|gif|svg)$/i.test(sanitized)
  const isCleanFormat = /^[a-z0-9-]+$/.test(sanitized) // Hive standard

  return isCleanFormat && !isImage
}

// Reference: https://en.wikipedia.org/wiki/Domain_Name_System#Domain_name_syntax
// Hive account names must follow similar rules to DNS (RFC 1035)
const LABEL_REGEX = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;

export function isValidUsername(username: string): boolean {
  if (!username || typeof username !== 'string') return false;
  if (username.length > 16) return false;

  const labels = username.split('.');

  return labels.every(label => {
    return (
      label.length >= 3 &&
      label.length <= 16 &&
      /^[a-z]/.test(label) &&                    // must start with a letter
      LABEL_REGEX.test(label) &&                 // a-z0-9, hyphens, no start/end hyphen
      !label.includes('..')                      // double dots are impossible after split, but just in case
    );
  });
}



