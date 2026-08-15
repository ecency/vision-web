/**
 * Outbound-link detection for the SEO/backlink-farm signal.
 *
 * A link only counts as outbound promotion when it leaves the Hive/Ecency
 * ecosystem and is not an embedded image, so ordinary on-platform references and
 * post illustrations never trip the check.
 */

// Hosts that are part of the Hive/Ecency ecosystem.
const INTERNAL_HOSTS = [
  "ecency.com",
  "ecency.app",
  "hive.blog",
  "hive.io",
  "hiveblocks.com",
  "peakd.com",
  "snapie.io",
  "hivesuite.app",
  "leofinance.io",
  "inleo.io",
  "3speak.tv",
  "d.buzz",
  "waivio.com"
];

// Image/media hosts: an embedded image is content, not a backlink.
const IMAGE_HOSTS = [
  "imgur.com",
  "images.hive.blog",
  "files.peakd.com",
  "i.ecency.com",
  "images.ecency.com",
  "steemitimages.com",
  "cdn.steemitimages.com",
  "media.giphy.com"
];

const IMAGE_EXT_RE = /\.(jpe?g|png|gif|webp|svg|bmp|avif)(\?|#|$)/i;
// Match absolute AND protocol-relative URLs ("//host/..."), so the check can't be
// evaded with `[promo](//shop.example)` (the renderer allows protocol-relative hrefs).
const URL_RE = /(?:https?:)?\/\/[^\s)<>"'\]]+/gi;
// URLs in prose are commonly followed by punctuation ("https://ecency.com, and...");
// strip it so the host parses correctly and internal links do not false-positive.
const TRAILING_PUNCT_RE = /[.,;:!?'"]+$/;

function hostOf(url: string): string {
  const m = /^(?:https?:)?\/\/([^/?#]+)/i.exec(url);
  return m ? m[1].toLowerCase().replace(/^www\./, "") : "";
}

function isExternalPromoLink(rawUrl: string): boolean {
  const url = rawUrl.replace(TRAILING_PUNCT_RE, "");
  if (IMAGE_EXT_RE.test(url)) {
    return false; // embedded image, not a backlink
  }
  const host = hostOf(url);
  if (!host.includes(".")) {
    return false; // not a real domain (e.g. a stray "//something")
  }
  const matches = (h: string) => host === h || host.endsWith("." + h);
  if (INTERNAL_HOSTS.some(matches) || IMAGE_HOSTS.some(matches)) {
    return false; // Hive/Ecency or image host
  }
  return true;
}

/** True if the post body contains an outbound (non-Hive, non-image) link. */
export function hasExternalLink(body: string | undefined | null): boolean {
  if (!body) {
    return false;
  }
  const matches = body.match(URL_RE);
  if (!matches) {
    return false;
  }
  return matches.some(isExternalPromoLink);
}
