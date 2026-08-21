import { proxifyImageSrc } from './proxify-image-src'
import { markdown2Html } from './markdown-2-html'
import { createDoc, makeEntryCacheKey, decodeImageSrc, decodeEntities } from './helper'
import { cacheGet, cacheSet } from './cache'
import { Entry } from './types'

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
// whitespace (group 1) so it is NOT a URL already inside ![](), <img src="">, or
// a [label](href) link — avoiding false positives on image-extension URLs that
// the renderer does NOT surface as a standalone image. Same extension set as the
// renderer's IMG_REGEX. Linear-time: one bounded char class + a single greedy
// `+`, no nested quantifier.
const BARE_IMAGE_RE = /(^|\s)(https?:\/\/[^\s<>"'()[\]]+\.(?:tiff?|jpe?g|gif|png|svg|ico|heic|webp|arw)(?:[?#][^\s<>"'()[\]]*)?)/im
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
  if (!body) return null
  const cleaned = body
    .replace(BACKTICK_FENCE_RE, '')
    .replace(TILDE_FENCE_RE, '')
    .replace(INLINE_CODE_RE, '')
    .replace(INDENTED_CODE_RE, '')

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
      return null
    }
  }
  // MD_IMAGE_RE is unanchored, so a markdown image can go uncaptured (URL over the length
  // bound, or broken syntax) while `mdMatch` is null OR is a *later* image. If any such
  // uncaptured image sits before what we captured (or nothing was captured), bail to the full
  // parser so it resolves the true first image rather than promoting a later HTML/bare/markdown
  // candidate.
  const priorRegion = mdMatch ? cleaned.slice(0, mdMatch.index ?? 0) : cleaned
  if (MD_IMAGE_PRESENT_RE.test(priorRegion)) {
    return null
  }

  // Collect valid candidates with their source position; the rendered document
  // surfaces whichever image appears first in source order.
  const candidates: { url: string; pos: number }[] = []
  if (mdMatch) candidates.push({ url: mdMatch[1], pos: mdMatch.index ?? 0 })
  if (htmlMatch && htmlMatch[1] && SAFE_URL_RE.test(htmlMatch[1])) {
    candidates.push({ url: htmlMatch[1], pos: htmlMatch.index ?? 0 })
  }
  if (includeBareUrls) {
    const bareMatch = cleaned.match(BARE_IMAGE_RE)
    if (bareMatch && bareMatch[2] && SAFE_URL_RE.test(bareMatch[2])) {
      // position of the URL itself, past the leading start/whitespace (group 1)
      candidates.push({ url: bareMatch[2], pos: (bareMatch.index ?? 0) + bareMatch[1].length })
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

  if (candidates.length === 0) return null
  candidates.sort((a, b) => a.pos - b.pos)
  return candidates[0].url
}

function proxifyFound(src: string, width: number, height: number, format: string): string {
  const decoded = decodeEntities(src)
  if (isGifLink(decoded)) {
    return proxifyImageSrc(decoded, 0, 0, format)
  }
  return proxifyImageSrc(decoded, width, height, format)
}

function getImage(entry: Entry, width = 0, height = 0, format = 'match'): string | null {
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

export function catchPostImage(obj: Entry | string, width = 0, height = 0, format = 'match'): string | null {
  if (typeof obj === 'string') {
    // Process string directly to avoid cache key collision
    // Don't create Entry wrapper as it would generate invalid cache keys

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
  const key = `${makeEntryCacheKey(obj)}-${width}x${height}-${format}`

  const item = cacheGet<string | null>(key)
  if (item) {
    return item
  }

  const res = getImage(obj, width, height, format)
  cacheSet(key, res)

  return res
}

