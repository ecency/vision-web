import { accountReputation } from "./account-reputation";
import {
  HIDDEN_POST_MIN_VOTES,
  HIDDEN_POST_RSHARES_THRESHOLD,
  LOW_TRUST_REPUTATION_THRESHOLD
} from "./constants";
import { hasExternalLink } from "./external-links";

/**
 * Why a piece of content gets the moderation treatment. Clients render their own
 * copy per reason; the rules that pick the reason live here so web and mobile
 * always agree on which one fired.
 */
export enum ContentModerationReason {
  /**
   * `stats.gray` / `stats.hide` from hivemind: community moderator mutes, mutes
   * applied by the observer account, and authors hivemind itself grays out.
   */
  MOD_MUTED = "mod_muted",
  /** Heavily downvoted by enough distinct accounts to be conclusive. */
  DOWNVOTED = "downvoted",
  /** Low-reputation author whose post carries an outbound promotional link. */
  LOW_TRUST = "low_trust"
}

/**
 * The fields of a post or comment the rules read. Deliberately structural: web
 * passes an `Entry`, mobile passes a raw bridge post, and neither has to convert.
 */
export interface ModerationCandidate {
  author?: string;
  author_reputation?: string | number;
  body?: string | null;
  net_rshares?: number;
  active_votes?: unknown[] | null;
  stats?: {
    gray?: boolean;
    hide?: boolean;
    total_votes?: number;
  } | null;
}

/**
 * hivemind's `total_votes` is the authoritative count when present; `active_votes`
 * is the fallback for the feeds that omit stats.
 */
function countVotes(content: ModerationCandidate): number {
  return content?.stats?.total_votes ?? content?.active_votes?.length ?? 0;
}

/** Heavily downvoted: strongly negative rshares from more than a handful of voters. */
export function isHiddenPost(
  netRshares: number | undefined,
  activeVotesLength: number
): boolean {
  return (
    (netRshares ?? 0) < HIDDEN_POST_RSHARES_THRESHOLD &&
    activeVotesLength >= HIDDEN_POST_MIN_VOTES
  );
}

/**
 * Content-moderation signal for SEO/backlink-farm abuse: low-reputation accounts
 * publishing an outbound link are the signature of free-faucet SEO spam.
 *
 * Such posts are not blocked, they are de-emphasized and their outbound link is
 * flagged as unverified, so the promotional payoff drops to zero. Low reputation
 * on its own is NOT a moderation signal: plenty of small accounts post ordinary
 * content, and dimming all of them punishes newcomers for existing.
 */
export function isLowTrustSeoPost(
  content: Pick<ModerationCandidate, "author_reputation" | "body">
): boolean {
  const reputation = content?.author_reputation;
  // Some feeds omit reputation entirely. An unknown value is not evidence of
  // anything, so it must not be read as "brand new account" (raw 0 scales to 25,
  // which is below the threshold and would flag every post carrying a link).
  if (reputation === undefined || reputation === null) {
    return false;
  }
  return (
    accountReputation(reputation) < LOW_TRUST_REPUTATION_THRESHOLD &&
    hasExternalLink(content?.body)
  );
}

/** True when the viewer has personally muted this author. */
export function isAuthorMuted(
  author: string | undefined,
  mutedAuthors: string[] | undefined | null
): boolean {
  return !!author && !!mutedAuthors?.includes(author);
}

/**
 * The reason a post or comment should be de-emphasized, or null when it is fine.
 *
 * Precedence, most authoritative first: an explicit moderation action outranks
 * the vote heuristic, which outranks the spam heuristic. Order matters because a
 * heavily downvoted post usually also has a battered reputation, and labelling
 * that "low trust" would hide why the content was actually flagged.
 *
 * A viewer's personal mute list is NOT an input here. Muting an author removes
 * their content from the viewer's lists entirely (see `isAuthorMuted`), rather
 * than labelling it.
 */
export function getContentModerationReason(
  content: ModerationCandidate | undefined | null
): ContentModerationReason | null {
  if (!content) {
    return null;
  }
  if (content.stats?.gray || content.stats?.hide) {
    return ContentModerationReason.MOD_MUTED;
  }
  if (isHiddenPost(content.net_rshares, countVotes(content))) {
    return ContentModerationReason.DOWNVOTED;
  }
  if (isLowTrustSeoPost(content)) {
    return ContentModerationReason.LOW_TRUST;
  }
  return null;
}
