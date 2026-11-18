import { decodeHTML, decodeHTMLAttribute, decodeHTMLStrict } from 'entities'

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

function guardNumericRefs(value: string): string {
  return value
    .replace(LEADING_ZEROS_DEC, '&#')
    .replace(LEADING_ZEROS_HEX, (m) => m.slice(0, 3))
    .replace(OVERLONG_NUMERIC_REF, '\uFFFD')
}

export function decodeEntities(value: string): string {
  const safe = guardNumericRefs(value)
  try {
    return decodeHTML(safe)
  } catch {
    return safe
  }
}

/**
 * Decode an attribute value the way a browser does. Unlike text, an attribute
 * keeps a legacy named reference without its `;` when `=` or an alphanumeric
 * follows: `?x=1&timestamp=5&region=us` stays as written instead of becoming
 * `×tamp` / `®ion`. Same overlong-reference guard as decodeEntities.
 */
export function decodeAttributeEntities(value: string): string {
  const safe = guardNumericRefs(value)
  try {
    return decodeHTMLAttribute(safe)
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
  return decodeDomImageSrc(decodeEntities(src))
}

/**
 * A body image URL read from the parsed document (an <img> src, an href, a
 * text node). The parser, and for markdown the destination decode in
 * markdown-to-html, have already decoded its entities exactly once (#2092):
 * only percent-encoding is left. Guarded so a malformed `%` cannot throw.
 */
export function decodeDomImageSrc(src: string): string {
  try {
    return decodeURIComponent(src).trim()
  } catch {
    return src.trim()
  }
}

// A complete reference: one that ends in `;`.
const COMPLETE_REFERENCE = /&(?:#\d{1,7}|#x[\da-f]{1,6}|[a-z][a-z\d]{1,31});/gi

// An image extension, the set the renderer has always recognised.
const IMAGE_EXT_G = /\.(?:tiff?|jpe?g|gif|png|svg|ico|heic|webp|arw)/gi
// Prose punctuation that can follow a URL in text without belonging to it.
const TRAILING_PUNCTUATION = '.,;:!)]}*_~'

/**
 * Where the image URL in a bare URL token ends, or -1 when the token is not an
 * image URL. As before, a token holding an image extension is an image taken
 * whole, suffixes and query included (`ABC.jpg:large`, `i.png/100x100`,
 * `i.png?name=a.jpg&sig=x`); only prose punctuation at the end of a URL
 * without a query is left out as text (`i.png,`). An extension does not count when a letter or digit runs on
 * from it (`.ico` in `.icons/readme`) or when another extension follows it
 * (`.jpg` in `photo.jpg.html`): those name something other than an image.
 * Shared by the render (text linkify and a.method's link promotion) and the
 * LCP preload, so they read a URL the same way. Linear: one pass for the
 * extensions, one for the punctuation.
 */
export function imageUrlEnd(token: string): number {
  // Trailing punctuation is prose only without a query or fragment, where a
  // `;` or `)` can belong to the URL.
  let contentEnd = token.length
  if (!/[?#]/.test(token)) {
    while (contentEnd > 0 && TRAILING_PUNCTUATION.includes(token[contentEnd - 1])) contentEnd--
  }
  IMAGE_EXT_G.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = IMAGE_EXT_G.exec(token)) !== null) {
    const at = m.index + m[0].length
    if (at > contentEnd) continue
    if (at < contentEnd && (/[a-z\d]/i.test(token[at]) || (token[at] === '.' && /[a-z]/i.test(token[at + 1] ?? '')))) continue
    return contentEnd
  }
  return -1
}

/**
 * Decodes only complete references, as CommonMark reads a link or image
 * destination: `?a=1&copy` stays as written, `?a=1&copy;` is `?a=1©`. A legacy
 * name that merely prefixes the token (`&region;` would read as `®ion;`) is
 * not a reference and stays too (#2092).
 */
export function decodeCompleteReferences(value: string): string {
  return value.replace(COMPLETE_REFERENCE, (reference) => {
    // Strict: only an exact, complete name or number decodes, so `&semi;` is
    // `;` while `&region;` is not `®ion;`.
    try {
      return decodeHTMLStrict(guardNumericRefs(reference))
    } catch {
      return reference
    }
  })
}

/**
 * True when the body already holds, in any form, the private-use pair the
 * render swaps an escaped `&` for while it parses a destination: the render
 * then leaves escaped ampersands to Remarkable alone, and the LCP preload
 * reads them the same way.
 */
export function hasAmpSentinel(body: string): boolean {
  return /[\uE000\uE001]|%EE%80%8[01]|&#x0*e00[01];|&#0*5734[45];/i.test(body)
}

// Remarkable's backslash escapes (unescapeMd).
const MD_ESCAPE_RE = /\\([\\!"#$%&'()*+,./:;<=>?@[\]^_`{|}~-])/g

/**
 * A body image URL taken from the raw post body (the LCP preload's scan),
 * decoded the way the render reads it, then percent-encoding.
 * A markdown destination (`destination`) is unescaped as Remarkable does, an
 * escaped `&` (`\\&`) staying a literal ampersand unless the body turns that
 * off (hasAmpSentinel), and its complete references are decoded once (#2092).
 * A bare URL in text: the escape rule already made `\\&` a literal `&`.
 * Raw HTML differs only for a legacy name without `;` before a
 * non-alphanumeric character, which an HTML attribute decodes.
 */
export function decodeRawBodyImageSrc(src: string, destination = false, ampEscapes = true): string {
  const unescaped = destination
    ? src.replace(MD_ESCAPE_RE, (_m, c: string) => (c === '&' && ampEscapes ? '&amp;' : c))
    : src.replace(/\\&/g, '&amp;')
  return decodeDomImageSrc(decodeCompleteReferences(unescaped))
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
// Escapes a decoded attribute value for a double-quoted attribute.
// Tab, line feed and carriage return stay references: xmldom turns a literal
// one in an attribute into a space but keeps one that arrives as a reference.
function escapeAttrValue(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\t/g, '&#9;')
    .replace(/\n/g, '&#10;')
    .replace(/\r/g, '&#13;')
}

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
  // No tag can close past the last `>`: from there on the input is copied as
  // is. Without this, a body of `<a b ` repeated with no `>` rescanned the rest
  // of the input from every `<`, quadratic: 100 KB took 15 s to render.
  const lastGt = html.lastIndexOf('>')
  // Characters scanned by tags that never closed. A `>` that only ever sits
  // inside a quoted value (`'<a b '.repeat(n) + 'c=">"'`) defeats the guard
  // above and every `<` rescans to the end; past this budget the rest of the
  // input is copied as written, so the work stays linear.
  const scanBudget = 4 * n + 4096
  let wasted = 0
  let out = ''
  let i = 0

  while (i < n) {
    const lt = html.indexOf('<', i)
    if (lt < 0) {
      out += html.slice(i)
      break
    }
    out += html.slice(i, lt)
    if (lt > lastGt) {
      out += html.slice(lt)
      break
    }

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
      // The value without its quotes, when it is complete; null keeps the
      // attribute's bytes as written (no value, or an unterminated quote).
      let rawValue: string | null = null
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
              rawValue = html.slice(r + 1, end)
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
            rawValue = html.slice(r, s)
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
        // Names are lower-cased on the way out (#1919). xmldom keeps them as
        // written, so `CLASS=` / `DATA-AUTHOR=` / `SRC=` / `HREF=` used to slip
        // past every transform that reads attributes by their lower-case name
        // (img proxying, the link policy, marker stripping), and xss then
        // lower-cases them on output, where they took effect.
        //
        // A value is handed on with only explicit references (#2085): decoded
        // the way a browser decodes an attribute, then re-escaped. xmldom
        // decodes `&times` / `&copy` / `&lt` even without `;` and before `=`,
        // which a browser never does in an attribute, so `?video=1&times=1`
        // came out as `?video=1×=1`.
        // A value that is already in that form keeps its bytes as written.
        // A literal tab, line feed or carriage return is attribute whitespace:
        // a space, as xmldom reads it. One written as a reference stays one.
        const value =
          rawValue === null
            ? null
            : escapeAttrValue(decodeAttributeEntities(rawValue.replace(/\r\n?|[\n\t]/g, ' ')))
        attrs.push(
          value === null || value === rawValue
            ? key + fullAttr.slice(attrName.length)
            : `${key}="${value}"`
        )
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
      wasted += q - lt
      if (wasted > scanBudget) {
        out += html.slice(lt)
        break
      }
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


/**
 * FNV-1a over the UTF-16 code units. Not cryptographic: it only has to tell two
 * bodies of the same entry apart, and it is linear with no allocation, so it
 * costs a small fraction of the markdown render a cache miss would run.
 */
function hashBody(body: unknown): string {
  const s = typeof body === 'string' ? body : ''
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return `${s.length}.${(h >>> 0).toString(36)}`
}

// The body is part of the key because the same author/permlink/last_update can
// reach the renderer with different bodies: a takedown replaces the body
// (filterDmcaEntry) without touching last_update, so a post rendered before the
// lists were in force, or from a surface that does not filter, kept serving its
// original HTML, cover and summary to later filtered requests.
// A memo hit would otherwise cost a full hash, and one entry object goes
// through several memo calls per render (card, og and preload sizes, summary).
// The stored hash is reused only while the body is the same string, so a body
// replaced in place on the same object is hashed again.
const bodyHashes = new WeakMap<object, { body: string; hash: string }>()

function entryBodyHash(entry: any): string {
  const body = entry.body
  if (typeof body !== 'string' || typeof entry !== 'object' || entry === null) {
    return hashBody(body)
  }
  const stored = bodyHashes.get(entry)
  if (stored && stored.body === body) {
    return stored.hash
  }
  const hash = hashBody(body)
  bodyHashes.set(entry, { body, hash })
  return hash
}

export function makeEntryCacheKey(entry: any): string {
  return `${entry.author}-${entry.permlink}-${entry.last_update}-${entry.updated}-${entryBodyHash(entry)}`
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
    // Seconds ("90", "90s") or YouTube's XhYmZs form ("1m30s", "1h2m3s"), each
    // part and the total bounded to 7 digits. An invalid t falls back
    // to a valid start.
    const m = /^(?:(\d{1,7})h)?(?:(\d{1,7})m)?(?:(\d{1,7})s?)?$/i.exec(params.get('t') || '');
    if (m && (m[1] || m[2] || m[3])) {
      const seconds = (+(m[1] || 0)) * 3600 + (+(m[2] || 0)) * 60 + (+(m[3] || 0));
      if (seconds <= 9999999) return '' + seconds;
    }
    const start = params.get('start') || '';
    return /^\d{1,7}$/.test(start) ? '' + (+start) : '';
  } catch (error) {
    return '';
  }
}
/**
 * Class list for a YouTube video wrapper. A Short is vertical (9:16) but its
 * embed URL is the same `/embed/<id>` as a landscape video, so the `/shorts/`
 * path of the posted URL is the only orientation signal. Pass the segment
 * YOUTUBE_REGEX matched, before the source URL is discarded, and the extra
 * `markdown-video-link-youtube-portrait` modifier lets the stylesheets size the
 * player 9:16. Links posted as `watch?v=` or `youtu.be/` carry no such hint and
 * stay 16:9.
 */
export function youtubeVideoLinkClass(matchedUrl: string): string {
  const base = 'markdown-video-link markdown-video-link-youtube'
  return /youtube\.com\/shorts\//i.test(matchedUrl) ? `${base} markdown-video-link-youtube-portrait` : base
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



