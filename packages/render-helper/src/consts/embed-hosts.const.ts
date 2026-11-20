import { BITCHUTE_REGEX, BRIGHTEON_REGEX, DAPPLR_REGEX } from './regexes.const'

// Authoritative allowlist of hosts the renderer is allowed to embed in an
// <iframe>. This is the SAME trust boundary that iframe.method.ts and
// a.method.ts already enforce via per-provider regexes — it is consolidated
// here so the sanitizer (central, authoritative) and the client video
// extensions (belt-and-suspenders) validate against ONE list instead of
// diverging copies.
//
// Every host listed here is one that a.method.ts / iframe.method.ts can emit
// as an https embed target. Subdomain-suffix tricks (play.3speak.tv.evil.com)
// fail because we compare the parsed hostname for EXACT equality, and
// protocol-relative / http / javascript: / data: values fail the https check.
export const ALLOWED_EMBED_HOSTS: ReadonlySet<string> = new Set([
  // YouTube
  'www.youtube.com',
  'youtube.com',
  'www.youtube-nocookie.com',
  'youtube-nocookie.com',
  // Vimeo
  'player.vimeo.com',
  // Twitch
  'player.twitch.tv',
  // DTube
  'emb.d.tube',
  // 3Speak (video + audio)
  'play.3speak.tv',
  '3speak.tv',
  'audio.3speak.tv',
  // Loom
  'www.loom.com',
  // Spotify
  'open.spotify.com',
  // SoundCloud
  'w.soundcloud.com',
  // BitChute
  'www.bitchute.com',
  'bitchute.com',
  // Rumble
  'www.rumble.com',
  'rumble.com',
  // Brighteon
  'www.brighteon.com',
  'brighteon.com',
  // VIMM
  'www.vimm.tv',
  // BrandNewTube
  'brandnewtube.com',
  // LBRY / Odysee
  'lbry.tv',
  'odysee.com',
  // Skatehype. (The skatehive IPFS gateway is not an embed host: iframe()
  // turns those sources into a <video>, so no iframe may point at it.)
  'www.skatehype.com',
  'skatehype.com',
  // archive.org
  'archive.org',
  // Truvvl
  'embed.truvvl.com',
  // Aureal
  'aureal-embed.web.app',
  'www.aureal-embed.web.app',
  // Dapplr (player.*.dapplr.in / *.dapplr.in) — host suffix, handled below
])

// Dapplr embeds come from arbitrary `<region>.dapplr.in` subdomains (see
// DAPPLR_REGEX), so they need a suffix check rather than an exact-host entry.
const ALLOWED_EMBED_HOST_SUFFIXES: readonly string[] = ['.dapplr.in']

// Per-host embed PATH requirement. Host allowlisting alone still lets a hostile
// post point an allowed-host iframe at a non-embed path on that host (e.g. an
// open-redirect endpoint, or a user-content page that — in an un-sandboxed
// frame — could hijack top-navigation). For the providers whose embed URL shape
// the renderer controls (a.method.ts), require the pathname to match that shape
// too. Each pattern is permissive enough to pass every value the renderer
// emits. Every listed host has one.
const EMBED_HOST_PATH_PATTERNS: Record<string, RegExp> = {
  'www.youtube.com': /^\/embed\//,
  'youtube.com': /^\/embed\//,
  'www.youtube-nocookie.com': /^\/embed\//,
  'youtube-nocookie.com': /^\/embed\//,
  'player.vimeo.com': /^\/video\//,
  'player.twitch.tv': /^\/$/, // channel/video carried in the query string
  'emb.d.tube': /^\/$/, // dtube carries the ref in the #! fragment
  'play.3speak.tv': /^\/(watch|embed)/,
  // embed-podcast is Spotify's older episode/show embed route, still emitted
  // for those (SPOTIFY_EMBED_REGEX) and answered by Spotify.
  'open.spotify.com': /^\/embed(?:-podcast)?\//,
  'www.loom.com': /^\/embed\//,
  'www.bitchute.com': /^\/embed\//,
  'bitchute.com': /^\/embed\//,
  'www.rumble.com': /^\/embed\//,
  'rumble.com': /^\/embed\//,
  'www.brighteon.com': /^\/embed\//,
  'brighteon.com': /^\/embed\//,
  // Odysee's embed route is /$/embed/<claim path>. Both the literal `$` and its
  // percent-encoded spelling occur in the wild: the renderer emits the literal
  // form, while Odysee's own share dialog hands out fully-encoded URLs, and
  // `URL.pathname` does not decode either. ODYSEE_REGEX accepts both for the
  // same reason.
  'odysee.com': /^\/(?:\$|%24)\/embed\//,
  // The rest mirror the iframe.method.ts provider patterns (#1919), so the
  // sanitizer holds an untransformed iframe to the same shapes iframe() does.
  'lbry.tv': /^\/(?:\$|%24)\/embed\//,
  '3speak.tv': /^\/(watch|embed)$/,
  'audio.3speak.tv': /^\/play$/,
  'w.soundcloud.com': /^\/player\/$/,
  'archive.org': /^\/embed\/[^/]+$/,
  'www.vimm.tv': /^\/[A-Za-z0-9_-]+(?:\/embed)?\/?$/,
  'brandnewtube.com': /^\/embed\/[a-z0-9]+$/i,
  'www.skatehype.com': /^\/ifplay\.php$/,
  'skatehype.com': /^\/ifplay\.php$/,
  'embed.truvvl.com': /^\/@[\w.\d-]+\//,
  'aureal-embed.web.app': /^\/\d+$/,
  'www.aureal-embed.web.app': /^\/\d+$/
}

// Path shape for the suffix-matched hosts above (DAPPLR_REGEX).
const EMBED_SUFFIX_PATH_PATTERNS: Record<string, RegExp> = {
  '.dapplr.in': /^\/file\/dapplr-videos\//
}
const EMBED_SUFFIX_TRANSFORM_PATTERNS: Record<string, RegExp> = {
  '.dapplr.in': DAPPLR_REGEX
}

/**
 * True iff `value` is an absolute https:// URL whose host is one the renderer
 * is permitted to embed AND (for hosts with a known embed-path shape) whose
 * path matches that shape. Used to validate data-embed-src / data-video-href in
 * the sanitizer and the iframe `src` the client video extensions assign.
 *
 * Defensive: never throws (a malformed URL returns false), rejects every
 * non-https scheme (javascript:, data:, http:, protocol-relative //host),
 * compares the parsed hostname so an attacker can't smuggle an allowed host as
 * a path/query/userinfo/subdomain-suffix segment, and constrains the path so an
 * allowed host can't be aimed at a non-embed route.
 */
// U+0001-U+0020 only: NUL is not trimmed, because the HTML parser turns it
// into U+FFFD before any URL parser sees it (a leading NUL would make the
// browser read the value as a relative URL); the NUL test below rejects it.
const isTrimmable = (code: number): boolean => code >= 0x01 && code <= 0x20

// Index scan rather than a `[\0- ]+$` regex, which backtracks quadratically.
function trimC0AndSpace(value: string): string {
  let start = 0
  let end = value.length
  while (start < end && isTrimmable(value.charCodeAt(start))) start++
  while (end > start && isTrimmable(value.charCodeAt(end - 1))) end--
  return value.slice(start, end)
}

export function isAllowedEmbedSrc(value?: string | null): boolean {
  if (!value) return false
  // Strip only what the URL parser itself strips at the ends (C0 controls
  // except NUL, and space), then demand a literal `https://` and no NUL. String.trim() also removes
  // NBSP, BOM, U+2028 and friends, and new URL() accepts `https:/host` and
  // `https:host`; a browser resolves all of those against the page as
  // RELATIVE URLs, so what was checked would not be what loads (#1919).
  const trimmed = trimC0AndSpace(value)
  if (!/^https:\/\//i.test(trimmed) || trimmed.includes('\u0000')) return false
  let url: URL
  try {
    url = new URL(trimmed)
  } catch {
    return false
  }
  if (url.protocol !== 'https:') return false
  const host = url.hostname.toLowerCase()
  if (ALLOWED_EMBED_HOSTS.has(host)) {
    const pathPattern = EMBED_HOST_PATH_PATTERNS[host]
    return !pathPattern || pathPattern.test(url.pathname)
  }
  // A real label must precede the suffix (`.dapplr.in` alone is not a host).
  const suffix = ALLOWED_EMBED_HOST_SUFFIXES.find(s => host.endsWith(s) && host.length > s.length && !host.startsWith('.'))
  if (!suffix) return false
  const suffixPattern = EMBED_SUFFIX_PATH_PATTERNS[suffix]
  if (suffixPattern && !suffixPattern.test(url.pathname)) return false
  // The src as written must also be one iframe() frames (DAPPLR_REGEX), so
  // the two never disagree: no empty inner label, port, credentials or
  // backslash path the URL parser would otherwise normalise away (#2155).
  const transformPattern = EMBED_SUFFIX_TRANSFORM_PATTERNS[suffix]
  return !transformPattern || transformPattern.test(trimmed)
}

/**
 * The spelling iframe() normalises an embed to: http and protocol-relative
 * become https, m.youtube.com / youtube.com become www.youtube.com, any 3speak
 * domain becomes play.3speak.tv, YouTube's /EMBED/ is lower-cased and a
 * /shorts/<11 char id> frames as /embed/<id>, and BitChute /video/<id> and
 * Brighteon page URLs frame their embed route. The sanitizer applies the same
 * to a src it would otherwise refuse, so a caller that never ran iframe()
 * (simpleMarkdownToHTML, chat and the editor) keeps the embeds the full
 * render keeps (#1919).
 */
export function canonicalEmbedSrc(src: string): string {
  let s = src
    .trim()
    .replace(/^(?:https?:)?\/\//i, 'https://')
    .replace(/^https:\/\/(?:m\.)?youtube\.com\//i, 'https://www.youtube.com/')
    .replace(/^https:\/\/(?:play\.)?3speak\.[a-z]+\//i, 'https://play.3speak.tv/')
  if (/^https:\/\/www\.youtube\.com\//i.test(s)) {
    s = s.replace(/^(https:\/\/www\.youtube\.com)\/embed\//i, '$1/embed/')
    const shortId = s.match(/^https:\/\/www\.youtube\.com\/shorts\/([A-Za-z0-9_-]{11})\/?(?=[?#]|$)/i)
    if (shortId) s = `https://www.youtube.com/embed/${shortId[1]}`
  }
  const bitchute = s.match(BITCHUTE_REGEX)
  if (bitchute) s = `https://www.bitchute.com/embed/${bitchute[1]}/`
  const brighteon = s.match(BRIGHTEON_REGEX)
  if (brighteon) s = `https://www.brighteon.com/embed/${brighteon[2]}`
  return s
}
