import { Entry, FullAccount } from "@/entities";
import { Profile } from "@ecency/sdk";
import { postBodySummary } from "@ecency/render-helper";
import { accountReputation } from "@/utils/account-reputation";
import { isNsfwEntry } from "@/utils/nsfw-detection";
import defaults from "@/defaults";

/**
 * Single source of truth for "is this entry indexable" and "what URL should it
 * canonical to". Consumed by entry-canonical.ts and generate-entry-metadata.ts
 * so the sitemap/canonical/noindex decisions can never drift apart.
 *
 * Core principle: a comment is not its own indexable page — it canonicals to
 * the root of its discussion thread. The discussion root is the depth-0 post
 * for a normal thread, or the depth-1 wave/snap for a microblog container tree
 * (the thin depth-0 container is plumbing, never a target).
 */

// Accounts that publish thin "container" anchor posts whose depth-1 children
// are the actual short-form content (waves / snaps / threads / moments).
// hive.flow is pre-provisioned (does not exist yet — future account unifying
// waves+snaps); inert until it posts. Verify its depth-0/depth-1 shape at launch.
export const CONTAINER_ACCOUNTS = new Set<string>([
  "leothreads",
  "ecency.waves",
  "peak.snaps",
  "liketu.moments",
  "liketu.speak",
  "hive.flow",
]);

const NOINDEX_REPUTATION_THRESHOLD = 40;

// Wave/snap quality gate (depth-1 in a container tree). Deliberately
// conservative — index few, widen later from Search Console data.
export const WAVE_MIN_BODY_CHARS = 100; // stripped prose length
export const WAVE_MIN_CHILDREN = 3; // a real micro-thread
export const WAVE_MIN_VOTERS = 5; // beyond self + a 1-2 acct circle
export const WAVE_MIN_PAYOUT = 0.1; // dust floor (combined with voters)

// A depth-0 post BY a container account is the machine anchor only when its
// body is thin. Verified anchors are 24–119 chars; a real standalone post
// (rare, but these are not guaranteed never to publish one) is far longer.
// 400 separates them with wide margin in both directions, so anchors stay
// suppressed while a genuine post by the same account still gets indexed.
export const CONTAINER_ANCHOR_MAX_BODY = 400;

// "Effectively empty" = a normal top-level post with essentially no prose AND
// no media (one-line outbound-link / boilerplate). Deliberately tiny — far
// below WAVE_MIN_BODY_CHARS — so it only catches the truly contentless and
// never legitimate short text or any media post.
export const EFFECTIVELY_EMPTY_MAX_BODY = 20;

export type ReputationSource =
  | Pick<FullAccount, "reputation" | "post_count">
  | Profile
  | null;

export const shouldApplyNoIndex = (
  account: ReputationSource,
  fallbackReputation: number
): boolean => {
  const reputationScore = accountReputation(account?.reputation ?? fallbackReputation ?? 0);
  const postCount = typeof account?.post_count === "number" ? account.post_count : 0;

  const belowReputationThreshold = reputationScore < NOINDEX_REPUTATION_THRESHOLD;
  const lacksPostingHistory = postCount <= 3;

  // No-indexed when the author lacks reputation or meaningful posting history.
  return belowReputationThreshold || lacksPostingHistory;
};

type ThreadShape = Pick<
  Entry,
  | "author"
  | "permlink"
  | "depth"
  | "parent_author"
  | "parent_permlink"
  | "root_author"
  | "root_permlink"
>;

/** depth-0 author of the thread (a post is its own root). */
const rootAuthorOf = (entry: ThreadShape): string =>
  entry.root_author || entry.author;

export const isContainerTree = (entry: ThreadShape): boolean =>
  CONTAINER_ACCOUNTS.has(rootAuthorOf(entry)) ||
  // Bridge-fallback path omits root_*; for a depth-1 wave the immediate parent
  // IS the container account, so detect via parent_author too. Without this a
  // bridge-fed wave would be misread as a normal depth-1 reply and canonical
  // to the thin anchor post — strictly worse than the old self-canonical.
  (entry.depth === 1 && CONTAINER_ACCOUNTS.has(entry.parent_author ?? ""));

/** Plain-text (markdown/links/images stripped) body length. */
const plainBodyLen = (entry: Pick<Entry, "body">): number =>
  postBodySummary(entry.body || "", 1000).trim().length;

/**
 * A depth-0 post authored by a container account that is thin enough to be the
 * machine-generated anchor (not a rare real standalone post by that account).
 */
const isContainerAnchorPost = (entry: Entry): boolean =>
  (entry.depth ?? 0) === 0 &&
  isContainerTree(entry) &&
  plainBodyLen(entry) <= CONTAINER_ANCHOR_MAX_BODY;

/** Cheap media-presence check — any image/video signal ⇒ has media (pass). */
const hasMedia = (entry: Entry): boolean => {
  const img = entry.json_metadata?.image;
  if (Array.isArray(img) && img.length > 0) return true;
  const body = entry.body || "";
  return (
    /!\[[^\]]*\]\(/.test(body) || // markdown image
    /<(?:img|iframe|video)\b/i.test(body) || // html image / embed / video
    /(?:youtube\.com|youtu\.be|3speak|odysee\.com|rumble\.com|vimeo\.com|twitch\.tv|dtube|ipfs)/i.test(
      body
    ) ||
    /https?:\/\/\S+\.(?:jpe?g|png|gif|webp|mp4|webm|mov)\b/i.test(body) // bare media URL
  );
};

/**
 * A normal top-level post that is truly contentless: essentially no prose AND
 * no media. Multimodal-safe — any media signal makes it pass, protecting
 * photo/art/recipe/video posts.
 */
const isEffectivelyEmpty = (entry: Entry): boolean =>
  plainBodyLen(entry) < EFFECTIVELY_EMPTY_MAX_BODY && !hasMedia(entry);

/**
 * The canonical URL for an entry, or null when it has no canonical target and
 * should be noindexed (thin container post, or a deep wave sub-reply whose
 * depth-1 wave isn't resolvable from the entry without tree-walking).
 *
 * Honors an explicit json_metadata.canonical_url first (syndication intent).
 *
 * `ignoreDeclaredCanonical` (sitemap-only): the sitemap must NEVER consult the
 * declared canonical at all — it may list only URLs on its own host, and it is
 * purely a *discovery* hint (Google decides canonicalization from the page's
 * rel=canonical, not from sitemap membership). inLeo/PeakD/hive.blog are just
 * other frontends over the same on-chain post we also render at
 * `${baseUrl}/@author/permlink`. With this flag set the declared-canonical
 * branch is skipped entirely, so resolution is purely structural and can only
 * ever yield `${baseUrl}/…` or null — no third-party URL can reach a sitemap
 * by any path, now or from future cross-frontend canonical conventions. The
 * entry *page* still calls this with the flag off, so it keeps emitting
 * rel=canonical to the declared URL and Google attributes the content itself.
 */
export function canonicalTarget(
  entry: Entry,
  baseUrl: string = defaults.base,
  ignoreDeclaredCanonical = false
): string | null {
  // Sitemap mode never looks at json_metadata.canonical_url — see doc above.
  const declared = ignoreDeclaredCanonical
    ? undefined
    : entry.json_metadata?.canonical_url;
  if (declared) {
    return declared.replace("https://www.", "https://");
  }

  if (!entry.author || !entry.permlink) {
    return null;
  }

  const self = `${baseUrl}/@${entry.author}/${entry.permlink}`;
  const depth = entry.depth ?? 0;

  if (isContainerTree(entry)) {
    if (depth === 0) {
      // Thin body = machine anchor (no canonical → noindex). A substantive
      // body = a rare real standalone post by the account → treat as normal
      // post (self), so we don't silently suppress a valid page.
      return isContainerAnchorPost(entry) ? null : self;
    }
    if (depth === 1) return self; // the wave/snap is the content unit
    if (depth === 2 && entry.parent_author && entry.parent_permlink) {
      // reply to a wave → the wave (its immediate parent). Known seam: the
      // wave may itself fail the quality gate (noindex); we don't fetch it to
      // check (no SSR fan-out). Same accepted trade-off as the normal
      // reply→possibly-noindexed-root seam — see spec §5.
      return `${baseUrl}/@${entry.parent_author}/${entry.parent_permlink}`;
    }
    return null; // depth >= 3 in a container tree — unresolvable, noindex
  }

  if (depth === 0) return self; // normal top-level post → self

  // normal reply → the depth-0 root post
  if (entry.root_author && entry.root_permlink) {
    return `${baseUrl}/@${entry.root_author}/${entry.root_permlink}`;
  }
  if (depth === 1 && entry.parent_author && entry.parent_permlink) {
    // depth-1 reply: parent IS the root (covers bridge-fed entries lacking root_*)
    return `${baseUrl}/@${entry.parent_author}/${entry.parent_permlink}`;
  }
  return null; // deep reply with no resolvable root — noindex
}

const parsePayout = (v: unknown): number => {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  if (typeof v === "string") {
    const n = parseFloat(v.replace(/[^0-9.]/g, ""));
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
};

/**
 * Source-agnostic effective payout. condenser_api.get_content omits
 * is_paidout/author_payout_value (bridge-shape fields), so read whatever is
 * present and take the max of the numeric `payout` and the summed *_value
 * strings. The §gate floor is coarse — precision is not required.
 */
const effectivePayout = (entry: Entry): number => {
  const summed =
    parsePayout(entry.pending_payout_value) +
    parsePayout(entry.author_payout_value) +
    parsePayout(entry.curator_payout_value);
  return Math.max(parsePayout(entry.payout), summed);
};

/** Tier 0 (content floor) + Tier 1 (engagement) gate for depth-1 waves. */
const passesWaveQualityGate = (entry: Entry): boolean => {
  // Tier 0: intrinsic content floor (NSFW + reputation already checked upstream).
  if (plainBodyLen(entry) < WAVE_MIN_BODY_CHARS) return false;

  // Tier 1: engagement corroboration.
  const children = typeof entry.children === "number" ? entry.children : 0;
  if (children >= WAVE_MIN_CHILDREN) return true;

  const voters =
    entry.stats?.total_votes ?? (Array.isArray(entry.active_votes) ? entry.active_votes.length : 0);
  return voters >= WAVE_MIN_VOTERS && effectivePayout(entry) >= WAVE_MIN_PAYOUT;
};

/**
 * Whether the entry should be indexed (true) or emit robots noindex (false).
 * The reputation gate needs the fetched author account; callers pass it plus
 * whether that fetch failed (failure => don't punish, skip the rep gate).
 */
export function isIndexable(
  entry: Entry,
  account: ReputationSource,
  accountFetchFailed: boolean,
  // Forwarded to the internal canonicalTarget so this filter and the sitemap
  // writer's canonicalTarget(e, BASE, true) never disagree (see below).
  ignoreDeclaredCanonical = false
): boolean {
  // No third-party abuse list is consulted here — see #1524. Indexability is
  // decided entirely by signals we own: reputation, posting history, NSFW,
  // thin/empty content and canonical resolvability.
  //
  // Abuse is still handled, just through a signal we read directly: downvotes
  // lower reputation, so an author caught plagiarising falls below
  // NOINDEX_REPUTATION_THRESHOLD and leaves the index on the next render. The
  // same community that curates the external list drives that number, without
  // us handing an outside feed unreviewable veto over what Google sees.
  if (isNsfwEntry(entry)) return false;

  const reputationNoIndex =
    !accountFetchFailed && shouldApplyNoIndex(account, entry.author_reputation ?? 0);
  if (reputationNoIndex) return false;

  const depth = entry.depth ?? 0;

  if (isContainerTree(entry)) {
    if (depth === 0) return !isContainerAnchorPost(entry); // anchor → noindex; real post → index
    if (depth === 1) return passesWaveQualityGate(entry); // the wave/snap
    if (depth === 2) return true; // reply to a wave (canonicals to the wave)
    return false; // depth >= 3 in a container tree
  }

  if (depth === 0) return !isEffectivelyEmpty(entry); // normal top-level post

  // normal reply: indexable only if its discussion root is resolvable. Forward
  // ignoreDeclaredCanonical so this matches the sitemap writer exactly — else a
  // depth>=2 reply carrying only an external declared canonical and no
  // resolvable on-domain root would pass here yet be discarded by the writer's
  // same-host guard, drifting the indexable count from posts.xml silently.
  return canonicalTarget(entry, defaults.base, ignoreDeclaredCanonical) !== null;
}
