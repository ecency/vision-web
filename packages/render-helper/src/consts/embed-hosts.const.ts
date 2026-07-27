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
  // Skatehive / Skatehype
  'ipfs.skatehive.app',
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
// emits. Hosts absent from this map fall back to host-only (their embed paths
// vary and they are not consumed by the un-sandboxed client video extensions).
const EMBED_HOST_PATH_PATTERNS: Record<string, RegExp> = {
  'www.youtube.com': /^\/embed\//,
  'youtube.com': /^\/embed\//,
  'www.youtube-nocookie.com': /^\/embed\//,
  'youtube-nocookie.com': /^\/embed\//,
  'player.vimeo.com': /^\/video\//,
  'player.twitch.tv': /^\/$/, // channel/video carried in the query string
  'emb.d.tube': /^\/$/, // dtube carries the ref in the #! fragment
  'play.3speak.tv': /^\/(watch|embed)/,
  'open.spotify.com': /^\/embed\//,
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
  'odysee.com': /^\/(?:\$|%24)\/embed\//
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
export function isAllowedEmbedSrc(value?: string | null): boolean {
  if (!value) return false
  let url: URL
  try {
    url = new URL(value.trim())
  } catch {
    return false
  }
  if (url.protocol !== 'https:') return false
  const host = url.hostname.toLowerCase()
  const hostAllowed =
    ALLOWED_EMBED_HOSTS.has(host) ||
    ALLOWED_EMBED_HOST_SUFFIXES.some(suffix => host.endsWith(suffix))
  if (!hostAllowed) return false
  const pathPattern = EMBED_HOST_PATH_PATTERNS[host]
  if (pathPattern && !pathPattern.test(url.pathname)) return false
  return true
}
