import { describe, expect, it } from "vitest";
import { makeOverlay, makeRow } from "./curation-test-utils";
import { rowHiddenByFeed } from "@/features/curation-desk/curation-feed-rules";

const open = (mark: "reviewed" | "snoozed" | "flagged" | null = null, extra: Partial<ReturnType<typeof makeOverlay>> = {}) =>
  makeRow({ post_id: 1, state: 0, overlay: makeOverlay({ team_mark: mark, team_mark_by: mark ? "riyat" : null, ...extra }) });

describe("rowHiddenByFeed", () => {
  it("mirrors the roster feed's defaults: any team mark leaves, a note stays", () => {
    expect(rowHiddenByFeed(open(), {})).toBe(false);
    expect(rowHiddenByFeed(open("reviewed"), {})).toBe(true);
    expect(rowHiddenByFeed(open("snoozed"), {})).toBe(true);
    // Unreviewed only is the server's `team_mark IS NULL`: a flag is handled
    // too, and lives on the flagged lens.
    expect(rowHiddenByFeed(open("flagged"), {})).toBe(true);
    // A note never becomes a team mark, so a noted row reads as unmarked here.
    expect(rowHiddenByFeed(open(null, { notes_count: 2 }), {})).toBe(false);
  });

  it("reads the filters off either the request (booleans) or the query key (strings)", () => {
    expect(rowHiddenByFeed(open("reviewed"), { hide_reviewed: false })).toBe(false);
    expect(rowHiddenByFeed(open("reviewed"), { hide_reviewed: "0" })).toBe(false);
    expect(rowHiddenByFeed(open("snoozed"), { hide_snoozed: "0" })).toBe(false);
    expect(rowHiddenByFeed(open("snoozed"), { hide_reviewed: "0" })).toBe(true);
    // With one of the two off the server keeps everything but the hidden
    // kind, flagged rows included.
    expect(rowHiddenByFeed(open("flagged"), { hide_reviewed: "0" })).toBe(false);
    expect(rowHiddenByFeed(open("flagged"), { hide_snoozed: "0" })).toBe(false);
  });

  it("keeps curated rows out unless the feed shows them", () => {
    const curated = makeRow({ post_id: 2, state: 1, overlay: makeOverlay() });
    expect(rowHiddenByFeed(curated, {})).toBe(true);
    expect(rowHiddenByFeed(curated, { hide_curated: false })).toBe(false);
    expect(rowHiddenByFeed(curated, { hide_curated: "0" })).toBe(false);
    // The recommended lens and the unique order pin open rows whatever the toggle says.
    expect(rowHiddenByFeed(curated, { hide_curated: false, recommended: true })).toBe(true);
    expect(rowHiddenByFeed(curated, { hide_curated: false, sort: "unique" })).toBe(true);
    expect(rowHiddenByFeed(curated, { view: "all" })).toBe(false);
    expect(rowHiddenByFeed(curated, { view: "curated" })).toBe(false);
    expect(rowHiddenByFeed(open(), { view: "curated" })).toBe(true);
  });

  /**
   * The recommendations tab reads the roster feed's recommended view for
   * curators, so a dismissal applied to the cache has to take the row off it
   * at once, the way the server's recommendation predicate stops serving it.
   */
  it("drops a dismissed or no longer recommended row from the recommended feeds", () => {
    const recommended = makeRow({ post_id: 4, state: 0, recommend_count: 2, overlay: makeOverlay() });
    const dismissed = makeRow({ post_id: 5, state: 0, recommend_count: 2, overlay: makeOverlay({ reco_dismissed_at: "2026-09-15T08:00:00" }) });
    const withdrawn = makeRow({ post_id: 6, state: 0, recommend_count: 0, overlay: makeOverlay() });
    for (const feed of [{ view: "recommended" }, { recommended: true }, { sort: "unique" }]) {
      expect(rowHiddenByFeed(recommended, feed)).toBe(false);
      expect(rowHiddenByFeed(dismissed, feed)).toBe(true);
      expect(rowHiddenByFeed(withdrawn, feed)).toBe(true);
    }
    // Every other feed keeps them: a dismissal only ends the recommendation.
    expect(rowHiddenByFeed(dismissed, {})).toBe(false);
    expect(rowHiddenByFeed(withdrawn, {})).toBe(false);
    // The recommended view serves open posts whatever the curated toggle says.
    const curated = makeRow({ post_id: 7, state: 1, recommend_count: 2, overlay: makeOverlay() });
    expect(rowHiddenByFeed(curated, { view: "recommended", hide_curated: false })).toBe(true);
  });

  it("follows the flagged lens and the excluded view", () => {
    expect(rowHiddenByFeed(open("flagged"), { flagged: true })).toBe(false);
    expect(rowHiddenByFeed(open("reviewed"), { flagged: "1" })).toBe(true);
    expect(rowHiddenByFeed(open(), { flagged: true })).toBe(true);
    const excluded = open(null, { excluded_reason: "abuser" });
    expect(rowHiddenByFeed(excluded, {})).toBe(true);
    expect(rowHiddenByFeed(excluded, { view: "excluded" })).toBe(false);
    // rep_low is served on every public view, so it is not a reason to leave.
    expect(rowHiddenByFeed(open(null, { excluded_reason: "rep_low" }), {})).toBe(false);
    // The team mark rules run on every roster view, the excluded lens too,
    // and a row that stops being excluded leaves that lens.
    expect(rowHiddenByFeed(open("reviewed", { excluded_reason: "abuser" }), { view: "excluded" })).toBe(true);
    expect(rowHiddenByFeed(open("reviewed", { excluded_reason: "abuser" }), { view: "excluded", hide_reviewed: "0" })).toBe(false);
    expect(rowHiddenByFeed(open(), { view: "excluded" })).toBe(true);
    expect(rowHiddenByFeed(makeRow({ post_id: 3, state: 1, overlay: makeOverlay({ team_mark: "reviewed" }) }), { view: "curated" })).toBe(true);
  });

  it("drops an nsfw or negative-reputation row live, the way the server stopped serving it", () => {
    // Both are excluded reasons the desk derives itself and neither is in the
    // public allow list, so the tick delta that carries one is what takes the
    // row off an open desk without waiting for a refetch. rep_low is the only
    // reason that stays, which is why this is a mirror and not a boolean.
    for (const reason of ["nsfw", "rep_negative"]) {
      const row = open(null, { excluded_reason: reason });
      expect(rowHiddenByFeed(row, {})).toBe(true);
      expect(rowHiddenByFeed(row, { view: "all" })).toBe(true);
      expect(rowHiddenByFeed(row, { view: "excluded" })).toBe(false);
    }
  });
});
