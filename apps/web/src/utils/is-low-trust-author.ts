import { Entry } from "@/entities";
import { accountReputation } from "@/utils/account-reputation";

/**
 * Content-moderation signal for SEO/backlink-farm abuse.
 *
 * Low-reputation accounts that publish a post carrying an outbound (non-Hive) link
 * are the signature of free-faucet SEO spam. We do not block such posts — we
 * de-emphasize them and flag the outbound link as unverified so the promotional
 * payoff drops to zero (on top of the existing noindex), which is the
 * proportionate lever for content that is created *after* signup.
 *
 * NOTE: the only input is reputation. Account age is NOT part of this check, so a
 * years-old account that never earned reputation trips it exactly like a fresh one.
 * User-facing copy must say "low reputation", never "new account".
 */

// Reputation below this (on the human-readable 0-100 scale) is treated as
// low-trust. New Hive accounts start around 25.
export const LOW_TRUST_REPUTATION_THRESHOLD = 30;

// Hosts that are part of the Hive/Ecency ecosystem — links to these are normal
// on-platform references, not outbound promotion.
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

// Image/media hosts and file extensions — an embedded image is content, not a
// backlink, so it must not count as outbound promotion.
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
// strip it so the host parses correctly and we don't false-positive on internal links.
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

/**
 * True when a post should get the low-trust content treatment: authored by a
 * low-reputation account AND carrying an outbound promotional link.
 */
export function isLowTrustSeoPost(
  entry: Pick<Entry, "author_reputation" | "body">
): boolean {
  return (
    accountReputation(entry.author_reputation) < LOW_TRUST_REPUTATION_THRESHOLD &&
    hasExternalLink(entry.body)
  );
}
