import { proxifyImageSrc } from './proxify-image-src'
import { markdown2Html } from './markdown-2-html'
import { createDoc, makeEntryCacheKey, decodeImageSrc, decodeEntities } from './helper'
import { cacheGet, cacheSet } from './cache'
import { Entry } from './types'
import { YOUTUBE_REGEX } from './consts'

const gifLinkRegex = /\.(gif)$/i;

function isGifLink(link: string) {
  return gifLinkRegex.test(link);
}

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
const INDENTED_CODE_RE = /^(?: {4}|\t).+$/gm
// HTML regions whose text never reaches the page as an image: comments and
// <style> (dropped by the sanitizer) and <pre> (the renderer leaves its text
// alone). Verified against the renderer: a URL inside <code> or <script> text
// IS linkified into an image, so those are not listed. Lazy bodies bounded by
// the closing marker: linear on untrusted input.
const HTML_HIDDEN_RE = /<!--[\s\S]*?-->|<(style|pre)\b[^>]*>[\s\S]*?<\/\1\s*>/gi
// Requires a closing `)` so broken syntax like `![](url` (no close) doesn't
// match. Also tolerates the optional title form `![](url "title")`. The alt-text
// class excludes `[` (so a `![a](`/`![[[…` run can't be re-scanned at every start),
// while the href quantifier is LENGTH-BOUNDED rather than `[`-excluding so it still
// matches image URLs that legitimately contain a literal `[` (e.g. array query params
// like `?w[]=600`) — the per-position scan stays capped, so it's sub-quadratic on
// untrusted input.
const MD_IMAGE_RE = /!\[[^[\]]*\]\(\s*([^)\s]{1,2048})(?:\s+["'][^"']*["'])?\s*\)/
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
// Every occurrence is a candidate; isStandalone() then rejects the ones that
// sit inside another construct (see there). Global, so matchAll can walk them
// in source order.
const BARE_IMAGE_RE = /https?:\/\/[^\s<>"'()[\]]+\.(?:tiff?|jpe?g|gif|png|svg|ico|heic|webp|arw)(?:[?#][^\s<>"'()[\]]*)?/gi
// A bare YouTube URL (text.method) or a `[url](url)` YouTube link (a.method)
// renders as a poster <img> for https://img.youtube.com/vi/<id>/hqdefault.jpg.
// Any subdomain (music., m., www.); the id itself is then read with the
// renderer's own YOUTUBE_REGEX so the two can never disagree.
const BARE_YOUTUBE_RE = /https?:\/\/(?:[\w-]+\.)*(?:youtube\.com|youtu\.be)\/[^\s<>"'()[\]]+/gi

// Whether a URL found at `idx` stands on its own in prose, which is what the
// renderer linkifies into an image or a video poster. Verified against the
// renderer: it does so after whitespace, a closing `>`, and inside
// parentheses, emphasis or quotes alike. It does NOT when the URL is:
//   - glued to another token (a longer URL, a word, `=`), or
//   - the href of a markdown link `[label](href)`, or the label's start `[`
//     (the `[url](url)` image-link form is found by the link scan instead), or
//   - an attribute value (`src="..."`, `href='...'`), or
//   - a markdown image `![alt](href)` (handled by the markdown scan).
function isStandalone(text: string, idx: number): boolean {
  if (idx === 0) return true
  const prev = text[idx - 1]
  if (/[\w/.:%?&=#[!-]/.test(prev)) return false
  const prev2 = idx > 1 ? text[idx - 2] : ''
  if (prev === '(' && prev2 === ']') return false
  if ((prev === '"' || prev === "'") && prev2 === '=') return false
  return true
}

function firstStandalone(text: string, re: RegExp): { url: string; pos: number } | null {
  for (const m of text.matchAll(re)) {
    const idx = m.index ?? 0
    if (isStandalone(text, idx)) return { url: m[0], pos: idx }
  }
  return null
}
// An HTML anchor. Its text sits right after a `>`, so the standalone-position
// rule above would read an image or video URL used as link TEXT as a bare URL.
// The renderer only promotes such an anchor when the text equals the href
// (a.method), so anchors whose text differs are blanked before the bare scans.
// Lazy body bounded by the closing tag: linear on untrusted input.
const HTML_ANCHOR_RE = /<a\b[^>]*?\bhref\s*=\s*["']([^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi
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
// Mirrors a.method's `href.match(IMG_REGEX)` — an image URL by extension
// (anywhere after the dot, matching the renderer). Eligibility for an avif
// <source> is then decided separately by isPictureEligibleRawUrl.
const IMG_HREF_RE = /https?:\/\/.*\.(?:tiff?|jpe?g|gif|png|svg|ico|heic|webp|arw)/i

// The fast-path bypasses sanitize-html (which the full markdown pipeline
// applies). The sanitizer only preserves http/https <img> sources — ftp,
// data, javascript, relative, etc. are all dropped. Mirror that policy here
// so the fast-path can never surface an image the full path would have
// dropped. Anything else returns null and falls back to the sanitized parse.
const SAFE_URL_RE = /^https?:\/\//i

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

function stripCodeRegions(body: string): string {
  return body
    .replace(BACKTICK_FENCE_RE, '')
    .replace(TILDE_FENCE_RE, '')
    .replace(INLINE_CODE_RE, '')
    .replace(INDENTED_CODE_RE, '')
    .replace(HTML_HIDDEN_RE, '')
}

// Blank (offset-preserving, so positions stay comparable) every anchor whose
// text is not its href. Both sides are entity-decoded first, the way the
// renderer sees them (textContent vs getAttribute). See HTML_ANCHOR_RE.
function blankUnequalAnchors(cleaned: string): string {
  return cleaned.replace(HTML_ANCHOR_RE, (whole: string, href: string, text: string) =>
    decodeEntities(text.trim()) === decodeEntities(href.trim()) ? whole : ' '.repeat(whole.length)
  )
}

/**
 * The body with every region the page never shows removed, plus the same text
 * with non-promoted anchors blanked for the bare-URL scans. Computed once per
 * lookup; every scan below works on these.
 */
interface PreparedBody {
  cleaned: string
  blanked: string
}

function prepareBody(body: string): PreparedBody {
  const cleaned = body ? stripCodeRegions(body) : ''
  return { cleaned, blanked: cleaned ? blankUnequalAnchors(cleaned) : '' }
}

interface ImageCandidate {
  url: string
  /** Offset in the code-stripped body, for source-order comparisons. */
  pos: number
}

/**
 * The poster image the renderer would produce for the first standalone YouTube
 * URL in the body, with its position, or null. Fast-mode only: the full render
 * discovers these itself through text.method / a.method.
 */
function findFirstVideoPoster(prepared: PreparedBody): ImageCandidate | null {
  const { cleaned, blanked } = prepared
  if (!cleaned) return null
  const bare = firstStandalone(blanked, BARE_YOUTUBE_RE)
  let best: ImageCandidate | null = null
  if (bare) {
    const id = bare.url.match(YOUTUBE_REGEX)
    if (id && id[1]) {
      best = { url: id[1], pos: bare.pos }
    }
  }
  // `[url](url)` form: a.method turns a link whose text equals its href into
  // the same poster. Take it only when it comes before the bare form.
  for (const m of cleaned.matchAll(MD_LINK_RE)) {
    const idx = m.index ?? 0
    if (idx > 0 && cleaned[idx - 1] === '!') continue
    if (best && idx >= best.pos) break
    const href = m[2]
    if (href && m[1].trim() === href) {
      const id = href.match(YOUTUBE_REGEX)
      if (id && id[1]) {
        best = { url: id[1], pos: idx }
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
  const { cleaned, blanked } = prepared
  if (!cleaned) return NONE

  const mdMatch = cleaned.match(MD_IMAGE_RE)
  const htmlMatch = cleaned.match(HTML_IMAGE_RE)

  // If markdown image syntax is present at all, it must be unambiguous. The
  // capture class `[^)\s]+` excludes `)`, so a captured URL containing `(`
  // means the URL was truncated mid-paren (e.g., a real
  // `https://x.com/path_(a)_full.jpg`). When ambiguous, bail and let the full
  // markdown parser handle it — returning a truncated URL would be wrong.
  if (mdMatch) {
    const url = mdMatch[1]
    if (!url || !SAFE_URL_RE.test(url) || url.includes('(')) {
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
  const candidates: { url: string; pos: number }[] = []
  if (mdMatch) candidates.push({ url: mdMatch[1], pos: mdMatch.index ?? 0 })
  if (htmlMatch && htmlMatch[1] && SAFE_URL_RE.test(htmlMatch[1])) {
    candidates.push({ url: htmlMatch[1], pos: htmlMatch.index ?? 0 })
  }
  if (includeBareUrls) {
    const bareMatch = firstStandalone(blanked, BARE_IMAGE_RE)
    if (bareMatch && SAFE_URL_RE.test(bareMatch.url)) {
      candidates.push(bareMatch)
    }
    // `[url](url)` image-link form: a markdown link the renderer promotes to an
    // image (a.method) — href is an image URL and the label text equals it.
    // Skip `![...]()` images (preceding `!`). Take the earliest such link.
    const deAmp = (s: string) => s.trim().replace(/&amp;/g, '&')
    for (const m of cleaned.matchAll(MD_LINK_RE)) {
      const idx = m.index ?? 0
      if (idx > 0 && cleaned[idx - 1] === '!') continue // it's an image ![](), handled above
      const href = m[2]
      if (href && SAFE_URL_RE.test(href) && IMG_HREF_RE.test(href) && deAmp(m[1]) === deAmp(href)) {
        candidates.push({ url: href, pos: idx })
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

function proxifyFound(src: string, width: number, height: number, format: string): string {
  const decoded = decodeEntities(src)
  if (isGifLink(decoded)) {
    return proxifyImageSrc(decoded, 0, 0, format)
  }
  return proxifyImageSrc(decoded, width, height, format)
}

function getImage(entry: Entry, width = 0, height = 0, format = 'match', fastMode = false): string | null {
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
    const decodedThumbnail = decodeEntities(thumbnail)
    const proxied = isGifLink(decodedThumbnail)
      ? proxifyImageSrc(decodedThumbnail, 0, 0, format)
      : proxifyImageSrc(decodedThumbnail, width, height, format)
    if (proxied) {
      return proxied
    }
  }

  if (meta && typeof meta.image === 'string' && meta.image.length > 0) {
    // Decode HTML entities (e.g., &amp; -> &) before proxifying
    const decodedImage = decodeEntities(meta.image)
    if (isGifLink(decodedImage)) {
      return proxifyImageSrc(decodedImage, 0, 0, format)
    }
    return proxifyImageSrc(decodedImage, width, height, format)
  }

  if (meta && meta.image && !!meta.image.length && meta.image[0]) {
    // Only decode if it's a string, otherwise pass through to proxifyImageSrc which will return ''
    if (typeof meta.image[0] === 'string') {
      // Decode HTML entities (e.g., &amp; -> &) before proxifying
      const decodedImage = decodeEntities(meta.image[0])
      if (isGifLink(decodedImage)) {
        return proxifyImageSrc(decodedImage, 0, 0, format)
      }
      return proxifyImageSrc(decodedImage, width, height, format)
    }
    // For non-string types, let proxifyImageSrc handle it (returns '')
    if (isGifLink(meta.image[0])) {
      return proxifyImageSrc(meta.image[0], 0, 0, format)
    }
    return proxifyImageSrc(meta.image[0], width, height, format)
  }

  // Fast mode never renders markdown: regex tiers (bare URLs included) and the
  // YouTube poster, or null. The caller would rather show no thumbnail than pay
  // for a full markdown render on a body none of that found an image in.
  if (fastMode) {
    return fastBodyImage(entry.body, width, height, format)
  }

  // Fast-path: try to find the first image with a regex over the raw body.
  // Avoids the cost of full markdown2Html + DOM parsing for the common case.
  const fast = findFirstImageUrl(entry.body)
  if (fast) {
    return proxifyFound(fast, width, height, format)
  }

  // Fall back to the full markdown render (handles edge cases the regex missed)
  const html = markdown2Html(entry)
  const doc = createDoc(html)
  if (!doc) {
    return null
  }

  const imgEls = doc.getElementsByTagName('img')
  if (imgEls.length >= 1) {
    const src = imgEls[0].getAttribute('src')
    if (!src) {
      return null
    }
    return proxifyFound(src, width, height, format)
  }

  return null
}

/**
 * The RAW (pre-proxify) URL of an entry's primary image, using the same
 * discovery order as catchPostImage (json_metadata.image, then the first body
 * image). Unlike catchPostImage it does NOT proxify — callers need the original
 * URL (e.g. to test picture-eligibility for an LCP preload, since catchPostImage
 * returns an already-proxified /p/ URL). Returns null when the fast path finds
 * no unambiguous image (the caller can fall back to catchPostImage).
 */
export function getEntryImageRawUrl(obj: Entry | string): string | null {
  // Decode with the SAME pipeline the renderer applies to the in-body <img>
  // (decodeImageSrc: entities then percent-encoding), so the LCP preload's
  // proxy hash byte-matches the body's <picture> avif <source> for &amp; /
  // %-encoded / non-ASCII cover URLs (otherwise the preload is wasted and the
  // LCP image double-downloads).
  if (typeof obj === 'string') {
    const src = findFirstImageUrl(obj, true)
    return src ? decodeImageSrc(src) : null
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
  if (meta && typeof meta.image === 'string' && meta.image.length > 0) {
    return decodeImageSrc(meta.image)
  }
  if (meta && meta.image && !!meta.image.length && typeof meta.image[0] === 'string' && meta.image[0].length > 0) {
    return decodeImageSrc(meta.image[0])
  }
  const bodySrc = findFirstImageUrl(obj.body, true)
  return bodySrc ? decodeImageSrc(bodySrc) : null
}

export interface CatchPostImageOptions {
  /**
   * Stop after the metadata and regex tiers. The last tier is a full
   * markdown2Html + DOM parse, which on a long body with no image at all costs
   * hundreds of milliseconds of synchronous CPU; a feed of such rows can hold a
   * server's event loop for seconds. Callers that can live without the rare
   * markdown-only finds (video embed posters, for instance) set this and get
   * null back instead. Default false keeps every existing caller byte-identical.
   */
  fast?: boolean
}

export function catchPostImage(
  obj: Entry | string,
  width = 0,
  height = 0,
  format = 'match',
  options: CatchPostImageOptions = {}
): string | null {
  const fastMode = options.fast === true
  if (typeof obj === 'string') {
    // Process string directly to avoid cache key collision
    // Don't create Entry wrapper as it would generate invalid cache keys

    if (fastMode) {
      return fastBodyImage(obj, width, height, format)
    }

    // Fast-path: regex over raw markdown
    const fast = findFirstImageUrl(obj)
    if (fast) {
      return proxifyFound(fast, width, height, format)
    }

    const html = markdown2Html(obj)
    const doc = createDoc(html)
    if (!doc) {
      return null
    }

    const imgEls = doc.getElementsByTagName('img')
    if (imgEls.length >= 1) {
      const src = imgEls[0].getAttribute('src')
      if (!src) {
        return null
      }
      return proxifyFound(src, width, height, format)
    }

    return null
  }
  // Fast and full lookups can legitimately disagree (null vs a markdown-only
  // find), so they get separate slots rather than the first caller deciding for
  // both.
  const key = `${makeEntryCacheKey(obj)}-${width}x${height}-${format}${fastMode ? '-fast' : ''}`

  // A null result is memoized too. Recomputing it is the expensive case: the
  // markdown tier ran, found nothing, and would run again on the next request.
  const item = cacheGet<string | null | undefined>(key)
  if (item !== undefined) {
    return item
  }

  const res = getImage(obj, width, height, format, fastMode)
  cacheSet(key, res)

  return res
}

