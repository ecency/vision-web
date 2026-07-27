import querystring from 'querystring'
import { LRUCache } from 'lru-cache'

let proxyBase = 'https://i.ecency.com'

// base58 encoding of the source URL is the dominant cost in proxifyImageSrc.
// The same URL is encoded repeatedly: once per srcset width (5×), once per
// image size variant (blur/grid/row), and across requests (trending posts
// repeat). Caching by URL collapses all of those to a single encode.
const urlHashCache = new LRUCache<string, string>({ max: 500 })

const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'

// base58btc, byte-for-byte what multihashes' toB58String produced (that function was
// `bs58.encode` behind a Buffer type-check — no multihash prefix). Inlined because the
// Buffer it demanded is a Node global: bundlers that do not shim it (the self-hosted
// blog SPA's, for one) shipped a `Buffer is not defined` crash into the browser on any
// post carrying an image. The output is the image proxy's cache key and appears in
// every image URL, so it must not change; proxify-image-src.spec.ts pins it.
function base58Encode(bytes: Uint8Array): string {
  if (bytes.length === 0) return ''
  const digits: number[] = [0]
  for (let i = 0; i < bytes.length; i++) {
    let carry = bytes[i]
    for (let j = 0; j < digits.length; j++) {
      carry += digits[j] << 8
      digits[j] = carry % 58
      carry = (carry / 58) | 0
    }
    while (carry > 0) {
      digits.push(carry % 58)
      carry = (carry / 58) | 0
    }
  }
  let out = ''
  // Each leading zero byte encodes as a literal '1' rather than as a digit.
  for (let k = 0; k < bytes.length && bytes[k] === 0; k++) out += BASE58_ALPHABET[0]
  for (let q = digits.length - 1; q >= 0; q--) out += BASE58_ALPHABET[digits[q]]
  return out
}

function utf8Bytes(url: string): Uint8Array {
  // TextEncoder is standard in browsers and Node >= 11; Buffer stays as the fallback so
  // any runtime without it (older React Native) keeps the behaviour it has today.
  if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(url)
  return Uint8Array.from(Buffer.from(url, 'utf8'))
}

function getUrlHash(url: string): string {
  const cached = urlHashCache.get(url)
  if (cached) return cached
  const hash = base58Encode(utf8Bytes(url))
  urlHashCache.set(url, hash)
  return hash
}

export function setProxyBase(p: string): void {
  proxyBase = p
}

export function getProxyBase(): string {
  return proxyBase
}

// The image proxy's own /p/ route, on the active base and the legacy
// images.ecency.com origin (the base before the i.ecency.com SNI migration).
// Recognizing both lets a transform on an already-proxified URL reuse the
// existing hash instead of re-encoding the whole URL into a proxy-of-a-proxy.
const PROXY_P_PREFIXES = (): string[] => [`${proxyBase}/p/`, 'https://images.ecency.com/p/']

export function extractPHash(url: string): string | null {
  const prefix = PROXY_P_PREFIXES().find((p) => url.startsWith(p))
  if (prefix) {
    const [hash] = url.slice(prefix.length).split('?')
    return hash.replace(/\.(webp|png)$/,'')
  }
  return null
}

export function isValidUrl(url: string): boolean {
  try {
    return Boolean(new URL(url));
  }
  catch(e){
    return false;
  }
}

/**
 * Longest image URL we will base58-encode. See the guard in proxifyForFormat:
 * the encoder is quadratic, so this bounds per-render CPU on user-authored
 * input. Observed maximum in real post bodies is ~234 characters.
 */
const MAX_PROXIED_URL_LENGTH = 2048

/**
 * A legacy foreign SIZED proxy URL: `images.hive.blog/<WxH>/<inner>` or the
 * steemitimages equivalent — the only shape that carries a nested source URL
 * for getLatestUrl to unwrap.
 *
 * Deliberately narrower than {@link isLegacyForeignProxyUrl}: other non-`/D`
 * paths on those hosts (notably their own `/p/<hash>` proxy route) name a hash
 * in a foreign hash space, so routing them through our `/p/` would proxy a
 * proxy, and their content type is genuinely unknown.
 *
 * Shared by the proxify routing and the `<picture>` eligibility gate so the two
 * cannot disagree about which URLs reach the /p/ route.
 */
const LEGACY_SIZED_PROXY_RE = /^https:\/\/(?:images\.hive\.blog|steemitimages\.com)\/\d+x\d+\/(.+)$/

export function isLegacySizedProxyUrl(url?: string): boolean {
  if (!url || typeof url !== 'string') return false
  return LEGACY_SIZED_PROXY_RE.test(url)
}

/**
 * The nested source of a legacy sized proxy URL — everything after the `<WxH>/`
 * segment, query string included — or null when the URL is not that shape.
 *
 * Positional, not a search for the last `http(s)://`: the nested source may
 * itself carry a URL-valued query parameter, and picking the last URL in the
 * string would resolve to that parameter's target instead of the image.
 *
 * Normalised exactly the way the imagehoster's legacy handler does it, because
 * both sides base58-encode this string and any divergence means two different
 * hashes for the same image: parse the path segment (trailing slashes stripped)
 * as a URL, then re-attach the query through searchParams — which percent-
 * encodes a URL-valued parameter — and re-serialise.
 */
function extractLegacySizedSource(url: string): string | null {
  const m = LEGACY_SIZED_PROXY_RE.exec(url)
  if (!m) return null

  // Drop the fragment FIRST, and before splitting off the query. A browser
  // never sends anything from the first '#' onward, so the imagehoster resolves
  // `…/image.png` and `…/image.png#frag` to one hash; keeping it here would
  // mint a separate proxy hash — and therefore a separate CDN entry — per
  // fragment, letting arbitrary `#…` variants miss an already-cached image.
  // Order matters too: a '?' inside a fragment (`…/image.png#a?b=c`) is part of
  // the fragment, so splitting on '?' first would invent a query from it.
  const rest = m[1]
  const hashIndex = rest.indexOf('#')
  const addressable = hashIndex >= 0 ? rest.slice(0, hashIndex) : rest

  const qIndex = addressable.indexOf('?')
  const path = qIndex >= 0 ? addressable.slice(0, qIndex) : addressable
  const query = qIndex >= 0 ? addressable.slice(qIndex + 1) : ''

  // Trailing slashes are trimmed with a scan, not /\/+$/: post bodies are
  // user-authored, so a crafted URL ending in thousands of slashes would make
  // that regex backtrack quadratically on every render, including SSR.
  let end = path.length
  while (end > 0 && path.charCodeAt(end - 1) === 47 /* '/' */) {
    end--
  }

  try {
    const inner = new URL(path.slice(0, end))
    if (query) {
      // append, not set: the handler preserves repeated keys
      for (const [key, value] of new URLSearchParams(query)) {
        inner.searchParams.append(key, value)
      }
    }
    return inner.toString()
  } catch {
    return null
  }
}

/**
 * Any legacy foreign proxy URL that has historically been served by swapping
 * the hostname onto our proxy base. Kept broad on purpose — this is the
 * long-standing behaviour for these hosts and narrowing it is out of scope.
 * `/D…` (stored upload) URLs are excluded: those go through the normal /p/
 * path so they can be resized and format-negotiated.
 */
function isLegacyForeignProxyUrl(url: string): boolean {
  return (
    (url.indexOf('https://images.hive.blog/') === 0 && url.indexOf('https://images.hive.blog/D') !== 0) ||
    (url.indexOf('https://steemitimages.com/') === 0 && url.indexOf('https://steemitimages.com/D') !== 0)
  )
}

export function getLatestUrl(str: string): string {
  const [last] = [...str.replace(/https?:\/\//g, '\n$&').trim().split('\n')].reverse()
  return last
}

export interface ProxifyOptions {
  /**
   * Request a tiny blurred LQIP placeholder. The proxy resizes to ~20px and
   * gaussian-blurs it (a few hundred bytes), for use behind the real image
   * while it loads.
   */
  blur?: boolean
  /**
   * Route on-host uploads through the /p/ proxy even when no width/height is
   * requested, so the server still negotiates WebP/AVIF via the Accept header
   * (instead of streaming the original bytes from direct-serve). Use for
   * displayed `<img>` sources; leave off for OG/social images, where the
   * original format is safest.
   */
  forceProxy?: boolean
}

// Internal format-aware proxify. The public proxifyImageSrc (below) locks the
// format to 'match' (Accept-negotiated at the origin). Explicit per-format
// variants (avif/webp) for <picture> are built via this + buildSrcSetForFormat,
// which keep the chosen format in the URL — cache-safe behind a CDN that does
// NOT vary its cache on the Accept header (so the negotiated variant can't be
// cross-served to a client that requested a different one).
function proxifyForFormat(
  url?: string,
  width = 0,
  height = 0,
  format = 'match',
  opts: ProxifyOptions = {}
) {
  if (!url || typeof url !== 'string' || !isValidUrl(url)) {
    return ''
  }

  // base58 encoding is quadratic in the input length, and post bodies are
  // user-authored: a single crafted 60KB image URL costs ~12.6s of CPU per
  // render, on the SSR path. Real image URLs are nowhere near this — across 374
  // in-body URLs from 60 live posts the longest was 234 characters — so cap it
  // with generous headroom and treat anything longer as unusable, exactly like
  // a malformed URL. Applies to every shape, including the legacy sized route
  // that previously short-circuited to a hostname swap before any hashing.
  if (url.length > MAX_PROXIED_URL_LENGTH) {
    return ''
  }

  // The /p/ route is the only one that transforms (resize/blur) or negotiates
  // WebP/AVIF; the direct-serve route streams the stored original bytes as-is.
  // Route through /p/ when a transform is requested, or when the caller opts in
  // to format negotiation on an otherwise-unsized image (forceProxy). Otherwise
  // keep the lightweight hostname-swap — no proxy self-fetch, original format
  // preserved (which matters for OG/social where AVIF may be unsupported).
  const routeThroughProxy = width > 0 || height > 0 || !!opts.blur || !!opts.forceProxy

  // Legacy sized proxy URLs (`images.hive.blog/<WxH>/<inner>`, same for
  // steemitimages). The bare hostname swap keeps them on our own domain but
  // lands on the direct-serve route, which the imagehoster answers with a 301
  // to the /p/ form. Two costs: the extra round trip, and the redirect carries
  // the width baked into the URL path (`.../1536x0/...` -> `width=1536`) rather
  // than the width the caller asked for — so a 600px thumbnail was served the
  // 1536px rendition (measured on a real post photo: 17,027 bytes via the
  // redirect vs 3,316 bytes going straight to /p/ at width=600).
  //
  // The redirect target is the hash of the INNER source URL — the imagehoster
  // unwraps the nested URL itself (verified: its Location header is byte-equal
  // to the /p/ URL this function now returns). So routing here directly changes
  // no image identity and no cache entry: if the inner source is gone, both
  // paths fall back to the same placeholder.
  //
  // So keep the swap only when nothing is being requested of the proxy (OG and
  // social images, where the original format is safest). Once a transform or
  // format negotiation is wanted, fall through: getLatestUrl() unwraps the
  // nested source URL, so the image is fetched from its origin through our own
  // /p/ route in one hop, resized, and format-negotiated.
  // Only the sized `<WxH>/<inner>` shape changes: it falls through to /p/ once
  // something is actually asked of the proxy. Every other legacy foreign URL
  // keeps the hostname swap exactly as before, transform or not.
  if (isLegacyForeignProxyUrl(url) && !(isLegacySizedProxyUrl(url) && routeThroughProxy)) {
    return url
      .replace('https://images.hive.blog', proxyBase)
      .replace('https://steemitimages.com', proxyBase)
  }

  // Legacy on-chain content embeds images.ecency.com URLs directly. With no
  // transform or format negotiation requested, re-point them to the active
  // proxy base — the same imagehoster backend, just an SNI-resilient hostname
  // (some ISPs, e.g. Virgin Media UK, SNI-filter the images.ecency.com
  // hostname) — and serve the stored bytes directly (no proxy self-fetch).
  // Otherwise fall through to the /p/ proxy: the bare hostname swap yields a
  // direct-serve URL that ignores ?width / ?blur and does no WebP/AVIF
  // negotiation, shipping the full-size original in its original format.
  if (url.indexOf('https://images.ecency.com/') === 0 && !routeThroughProxy) {
    return url.replace('https://images.ecency.com', proxyBase)
  }

  // For a legacy sized URL take everything after the `<WxH>/` segment verbatim.
  // getLatestUrl() picks the LAST http(s):// substring anywhere in the string,
  // so a nested source carrying a URL-valued query parameter
  // (`/60x70/http://host/image.png?redirect=https://other/x.png`) would resolve
  // to the parameter's URL instead of the image. The imagehoster extracts the
  // path segment and keeps the query — verified against its Location header —
  // so match that exactly or the two disagree about which image this is.
  const realUrl = extractLegacySizedSource(url) ?? getLatestUrl(url)
  const pHash = extractPHash(realUrl)

  const options: Record<string, string | number> = {
    format,
    mode: 'fit',
  }

  if (width > 0) {
    options.width = width
  }

  if (height > 0) {
    options.height = height
  }

  if (opts.blur) {
    options.blur = 1
  }

  const qs = querystring.stringify(options)

  if (pHash) {
    return `${proxyBase}/p/${pHash}?${qs}`
  }

  const b58url = getUrlHash(realUrl.toString())

  return `${proxyBase}/p/${b58url}?${qs}`
}

/**
 * @param _format - @deprecated Ignored. The public API always requests 'match'
 * so the origin negotiates WebP/AVIF via the Accept header. Explicit per-format
 * renditions (for `<picture>`) are built via buildSrcSetForFormat /
 * buildPictureSources, which keep the format in the URL (cache-safe behind a CDN
 * that ignores Accept).
 */
export function proxifyImageSrc(
  url?: string,
  width = 0,
  height = 0,
  _format = 'match',
  opts: ProxifyOptions = {}
) {
  return proxifyForFormat(url, width, height, 'match', opts)
}

// Widths chosen to align with sizes already cached by the image proxy
// (600 used by OG/deck thumbnails, 800 by self-hosted thumbnails)
const SRCSET_WIDTHS = [320, 600, 800, 1024, 1280];

/**
 * Builds a srcset string with multiple width variants for responsive images.
 * Uses the image proxy's width parameter to serve appropriately sized images.
 * Format is locked to 'match' (Accept-negotiated) — see buildSrcSetForFormat
 * for explicit per-format renditions.
 */
export function buildSrcSet(url?: string): string {
  return buildSrcSetForFormat(url, 'match');
}

/**
 * Like buildSrcSet but pins an explicit output format in the URL (avif/webp/
 * match). Used to build the per-format `<source>` srcsets of a `<picture>`: a
 * format baked into the URL is cache-safe behind a CDN that ignores the Accept
 * header, whereas a single 'match' URL gets one negotiated variant cached and
 * cross-served to every client. Byte-identical to buildSrcSet when format is
 * 'match'.
 */
export function buildSrcSetForFormat(
  url?: string,
  format: 'avif' | 'webp' | 'match' = 'match'
): string {
  if (!url || typeof url !== 'string') return '';

  // For already-proxied URLs, extract the hash and rebuild with widths.
  // Use plain string operations rather than RegExp(`^${proxyBase}/p/...`)
  // so proxyBase (a user-settable hostname) never reaches a regex compile
  // path — keeps CodeQL's hostname-regex analysis clean.
  const proxyPrefix = `${proxyBase}/p/`;
  let result: string;
  if (url.startsWith(proxyPrefix)) {
    const rest = url.slice(proxyPrefix.length);
    const q = rest.indexOf('?');
    const phash = extractPHash(url) || (q >= 0 ? rest.slice(0, q) : rest);
    result = SRCSET_WIDTHS
      .map(w => `${proxyBase}/p/${phash}?format=${format}&mode=fit&width=${w} ${w}w`)
      .join(', ');
  } else {
    // For non-proxified URLs, proxify at each width with the requested format
    result = SRCSET_WIDTHS
      .map(w => {
        const proxied = proxifyForFormat(url, w, 0, format);
        return proxied ? `${proxied} ${w}w` : '';
      })
      .filter(Boolean)
      .join(', ');
  }

  // Honor the contract ("pins an explicit output format in the URL"): only
  // return a srcset that actually carries the requested format. Legacy
  // direct-serve hosts (images.hive.blog/WxH, steemitimages) host-swap WITHOUT
  // routing through the /p/ transform, so they can't be transcoded — return ''
  // rather than a srcset that silently ignores the requested avif/webp.
  if (format !== 'match' && result && !result.split(',').every(c => c.includes(`format=${format}`))) {
    return '';
  }
  return result;
}

// Static raster formats the imagehoster reliably transcodes to avif/webp.
// Animated (gif/apng), vector (svg) and exotic (heic/ico/tiff/arw) are excluded:
// the origin returns the ORIGINAL bytes for ?format=avif on an animated source,
// which a <source type="image/avif"> would mislabel (the browser commits to that
// source and never reaches the <img> fallback). Checked against the URL PATHNAME
// only — a static-looking extension in the query/fragment (e.g. `?file=a.png`,
// `x.svg#thumb.png`) does not prove the fetched resource is a static raster.
const STATIC_RASTER_PATH_EXT = /\.(?:jpe?g|png|webp)$/i;
// Image-proxy sized route, e.g. /600x500/<url> — already-proxified, extension lost.
const SIZED_PROXY_PATH = /^\/\d+x\d+\//;

/**
 * Whether a RAW (pre-proxify) image URL is safe to offer avif/webp `<source>`
 * renditions for. Requires an http(s) URL whose PATHNAME ends in a static-raster
 * extension and that is NOT already proxified — already-proxified routes (`/p/`
 * base58 hash, `/u/` avatars, `WxH` sized) have the original extension stripped,
 * so we can't prove the underlying bytes aren't an animated gif and must fall
 * back to a bare img. URL parsing (not string regex on the host) keeps the host
 * comparison exact and avoids an interpolated-hostname regex.
 */
export function isPictureEligibleRawUrl(rawUrl?: string): boolean {
  if (!rawUrl || typeof rawUrl !== 'string') return false;
  let u: URL;
  try {
    u = new URL(rawUrl);
  } catch {
    return false;
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;

  // Legacy sized-proxy URLs now reach the /p/ route (see proxifyForFormat), so a
  // format CAN be pinned for them. Their path hides the original extension, but
  // that no longer decides anything: an animated source is returned untouched
  // whatever format is requested (verified on a live 44-frame gif — match, avif
  // and webp all return the same 1,001,718 bytes), and an SVG is already
  // rasterised by the /p/ route under format=match (verified: match and avif
  // return byte-identical output). So a pinned <source> cannot change what the
  // reader sees. These are ~5% of in-body images overall but cluster in
  // photo-heavy posts, where a big image is usually the LCP element.
  if (isLegacySizedProxyUrl(rawUrl)) return true;

  const host = `${u.protocol}//${u.host}`;
  const isProxyHost = host === proxyBase || host === 'https://images.ecency.com';
  if (
    isProxyHost &&
    (u.pathname.startsWith('/p/') || u.pathname.startsWith('/u/') || SIZED_PROXY_PATH.test(u.pathname))
  ) {
    return false;
  }
  return STATIC_RASTER_PATH_EXT.test(u.pathname);
}

/**
 * Build the avif + webp `<source>` srcsets for a `<picture>` around a RAW image
 * URL, or null when the URL is ineligible (non-raster, animated, already
 * proxified, or a legacy host that bypasses the /p/ transform). Single
 * eligibility gate shared by the renderer so the decision can't diverge.
 */
export function buildPictureSources(
  rawUrl?: string
): { avif: string; webp: string } | null {
  if (!isPictureEligibleRawUrl(rawUrl)) return null;
  // buildSrcSetForFormat returns '' when it can't honor the requested format
  // (legacy direct-serve hosts that bypass the /p/ transform), so a non-empty
  // pair guarantees every candidate is a proxied /p/ URL carrying the format.
  const avif = buildSrcSetForFormat(rawUrl, 'avif');
  const webp = buildSrcSetForFormat(rawUrl, 'webp');
  if (!avif || !webp) return null;
  return { avif, webp };
}
