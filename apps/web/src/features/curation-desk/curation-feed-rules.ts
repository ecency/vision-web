import type { DeskRow } from "./types";

/**
 * The filters of a roster feed as they decide which rows the server serves.
 * Read off either the raw request params (booleans) or the normalized query
 * key (strings, defaults dropped): both name the same feed.
 */
export type FeedFilters = Partial<
  Record<"view" | "sort" | "flagged" | "recommended" | "hide_curated" | "hide_reviewed" | "hide_snoozed", string | boolean | undefined>
>;

function flag(value: string | boolean | undefined, fallback: boolean): boolean {
  if (value === undefined || value === null || value === "") return fallback;
  return value !== false && value !== "0";
}

/**
 * The recommended view, the Recommended chip and the unique sort serve active
 * recommendations only, so a recommendation made or withdrawn changes which
 * posts they hold.
 */
export function feedServesRecommendationsOnly(feed: FeedFilters): boolean {
  return feed.view === "recommended" || flag(feed.recommended, false) || feed.sort === "unique";
}

/**
 * Would the roster feed behind `feed` still serve this row? A mirror of the
 * server's own predicate over state, exclusion and the team mark, and the ONE
 * place the client decides that a row it holds has moved outside its feed:
 * a post another curator reviewed leaves an unreviewed-only queue at once, a
 * post that got curated leaves a queue hiding curated posts, and a note keeps
 * a row where it is, because a note is not a team mark.
 *
 * Nothing here touches the predicates the client cannot follow live (age,
 * payout, words, images, app, community): the server serves those.
 */
export function rowHiddenByFeed(row: DeskRow, feed: FeedFilters): boolean {
  const view = typeof feed.view === "string" && feed.view ? feed.view : "queue";
  const excluded = row.overlay?.excluded_reason ?? null;
  if (view === "excluded") {
    // The excluded lens is the one place an excluded row is served, whatever
    // its state; a row that stops being excluded leaves it.
    if (!excluded) return true;
  } else {
    if (excluded && excluded !== "rep_low") return true;
    if (view === "curated") {
      if (row.state !== 1) return true;
    } else if (view !== "all") {
      const openOnly =
        view === "recommended" || flag(feed.hide_curated, true) || flag(feed.recommended, false) || feed.sort === "unique";
      if (openOnly && row.state !== 0) return true;
    }
  }
  // The recommended view, the Recommended chip and the unique sort serve active
  // recommendations only, on every view: a dismissed post leaves them, and so
  // does one whose last recommendation was withdrawn.
  if (feedServesRecommendationsOnly(feed)) {
    if (row.overlay?.reco_dismissed_at) return true;
    if (typeof row.recommend_count === "number" && row.recommend_count <= 0) return true;
  }
  // The team mark rules apply on every roster view, the way the server adds
  // them to every roster query.
  const mark = row.overlay?.team_mark ?? null;
  if (flag(feed.flagged, false)) return mark !== "flagged";
  const hideReviewed = flag(feed.hide_reviewed, true);
  const hideSnoozed = flag(feed.hide_snoozed, true);
  // Both on is the server's "unhandled" test, `team_mark IS NULL`: a flag is a
  // team mark too, so a flagged row is handled and lives on the flagged lens.
  if (hideReviewed && hideSnoozed) return mark !== null;
  if (hideReviewed && mark === "reviewed") return true;
  if (hideSnoozed && mark === "snoozed") return true;
  return false;
}
