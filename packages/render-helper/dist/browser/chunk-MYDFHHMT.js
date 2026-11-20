import { DAPPLR_REGEX, BITCHUTE_REGEX, BRIGHTEON_REGEX } from './chunk-5HL7IVFO.js';

// src/consts/embed-hosts.const.ts
var ALLOWED_EMBED_HOSTS = /* @__PURE__ */ new Set([
  // YouTube
  "www.youtube.com",
  "youtube.com",
  "www.youtube-nocookie.com",
  "youtube-nocookie.com",
  // Vimeo
  "player.vimeo.com",
  // Twitch
  "player.twitch.tv",
  // DTube
  "emb.d.tube",
  // 3Speak (video + audio)
  "play.3speak.tv",
  "3speak.tv",
  "audio.3speak.tv",
  // Loom
  "www.loom.com",
  // Spotify
  "open.spotify.com",
  // SoundCloud
  "w.soundcloud.com",
  // BitChute
  "www.bitchute.com",
  "bitchute.com",
  // Rumble
  "www.rumble.com",
  "rumble.com",
  // Brighteon
  "www.brighteon.com",
  "brighteon.com",
  // VIMM
  "www.vimm.tv",
  // BrandNewTube
  "brandnewtube.com",
  // LBRY / Odysee
  "lbry.tv",
  "odysee.com",
  // Skatehype. (The skatehive IPFS gateway is not an embed host: iframe()
  // turns those sources into a <video>, so no iframe may point at it.)
  "www.skatehype.com",
  "skatehype.com",
  // archive.org
  "archive.org",
  // Truvvl
  "embed.truvvl.com",
  // Aureal
  "aureal-embed.web.app",
  "www.aureal-embed.web.app"
  // Dapplr (player.*.dapplr.in / *.dapplr.in) — host suffix, handled below
]);
var ALLOWED_EMBED_HOST_SUFFIXES = [".dapplr.in"];
var EMBED_HOST_PATH_PATTERNS = {
  "www.youtube.com": /^\/embed\//,
  "youtube.com": /^\/embed\//,
  "www.youtube-nocookie.com": /^\/embed\//,
  "youtube-nocookie.com": /^\/embed\//,
  "player.vimeo.com": /^\/video\//,
  "player.twitch.tv": /^\/$/,
  // channel/video carried in the query string
  "emb.d.tube": /^\/$/,
  // dtube carries the ref in the #! fragment
  "play.3speak.tv": /^\/(watch|embed)/,
  // embed-podcast is Spotify's older episode/show embed route, still emitted
  // for those (SPOTIFY_EMBED_REGEX) and answered by Spotify.
  "open.spotify.com": /^\/embed(?:-podcast)?\//,
  "www.loom.com": /^\/embed\//,
  "www.bitchute.com": /^\/embed\//,
  "bitchute.com": /^\/embed\//,
  "www.rumble.com": /^\/embed\//,
  "rumble.com": /^\/embed\//,
  "www.brighteon.com": /^\/embed\//,
  "brighteon.com": /^\/embed\//,
  // Odysee's embed route is /$/embed/<claim path>. Both the literal `$` and its
  // percent-encoded spelling occur in the wild: the renderer emits the literal
  // form, while Odysee's own share dialog hands out fully-encoded URLs, and
  // `URL.pathname` does not decode either. ODYSEE_REGEX accepts both for the
  // same reason.
  "odysee.com": /^\/(?:\$|%24)\/embed\//,
  // The rest mirror the iframe.method.ts provider patterns (#1919), so the
  // sanitizer holds an untransformed iframe to the same shapes iframe() does.
  "lbry.tv": /^\/(?:\$|%24)\/embed\//,
  "3speak.tv": /^\/(watch|embed)$/,
  "audio.3speak.tv": /^\/play$/,
  "w.soundcloud.com": /^\/player\/$/,
  "archive.org": /^\/embed\/[^/]+$/,
  "www.vimm.tv": /^\/[A-Za-z0-9_-]+(?:\/embed)?\/?$/,
  "brandnewtube.com": /^\/embed\/[a-z0-9]+$/i,
  "www.skatehype.com": /^\/ifplay\.php$/,
  "skatehype.com": /^\/ifplay\.php$/,
  "embed.truvvl.com": /^\/@[\w.\d-]+\//,
  "aureal-embed.web.app": /^\/\d+$/,
  "www.aureal-embed.web.app": /^\/\d+$/
};
var EMBED_SUFFIX_PATH_PATTERNS = {
  ".dapplr.in": /^\/file\/dapplr-videos\//
};
var EMBED_SUFFIX_TRANSFORM_PATTERNS = {
  ".dapplr.in": DAPPLR_REGEX
};
var isTrimmable = (code) => code >= 1 && code <= 32;
function trimC0AndSpace(value) {
  let start = 0;
  let end = value.length;
  while (start < end && isTrimmable(value.charCodeAt(start))) start++;
  while (end > start && isTrimmable(value.charCodeAt(end - 1))) end--;
  return value.slice(start, end);
}
function isAllowedEmbedSrc(value) {
  if (!value) return false;
  const trimmed = trimC0AndSpace(value);
  if (!/^https:\/\//i.test(trimmed) || trimmed.includes("\0")) return false;
  let url;
  try {
    url = new URL(trimmed);
  } catch {
    return false;
  }
  if (url.protocol !== "https:") return false;
  const host = url.hostname.toLowerCase();
  if (ALLOWED_EMBED_HOSTS.has(host)) {
    const pathPattern = EMBED_HOST_PATH_PATTERNS[host];
    return !pathPattern || pathPattern.test(url.pathname);
  }
  const suffix = ALLOWED_EMBED_HOST_SUFFIXES.find((s) => host.endsWith(s) && host.length > s.length && !host.startsWith("."));
  if (!suffix) return false;
  const suffixPattern = EMBED_SUFFIX_PATH_PATTERNS[suffix];
  if (suffixPattern && !suffixPattern.test(url.pathname)) return false;
  const transformPattern = EMBED_SUFFIX_TRANSFORM_PATTERNS[suffix];
  return !transformPattern || transformPattern.test(trimmed);
}
function canonicalEmbedSrc(src) {
  let s = src.trim().replace(/^(?:https?:)?\/\//i, "https://").replace(/^https:\/\/(?:m\.)?youtube\.com\//i, "https://www.youtube.com/").replace(/^https:\/\/(?:play\.)?3speak\.[a-z]+\//i, "https://play.3speak.tv/");
  if (/^https:\/\/www\.youtube\.com\//i.test(s)) {
    s = s.replace(/^(https:\/\/www\.youtube\.com)\/embed\//i, "$1/embed/");
    const shortId = s.match(/^https:\/\/www\.youtube\.com\/shorts\/([A-Za-z0-9_-]{11})\/?(?=[?#]|$)/i);
    if (shortId) s = `https://www.youtube.com/embed/${shortId[1]}`;
  }
  const bitchute = s.match(BITCHUTE_REGEX);
  if (bitchute) s = `https://www.bitchute.com/embed/${bitchute[1]}/`;
  const brighteon = s.match(BRIGHTEON_REGEX);
  if (brighteon) s = `https://www.brighteon.com/embed/${brighteon[2]}`;
  return s;
}

export { ALLOWED_EMBED_HOSTS, canonicalEmbedSrc, isAllowedEmbedSrc };
//# sourceMappingURL=chunk-MYDFHHMT.js.map
//# sourceMappingURL=chunk-MYDFHHMT.js.map