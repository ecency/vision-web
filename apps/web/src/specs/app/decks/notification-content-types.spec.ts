import { describe, expect, it } from "vitest";
import {
  NOTIFICATION_CONTENT_TYPES,
  notificationContentTypesFor,
  SELF_ONLY_NOTIFICATION_CONTENT_TYPES
} from "@/app/decks/_components/consts";

/**
 * A Decks notifications column can be built for any account, because notifications are
 * largely public data. The exception is Ecency-only activity: vision-api downgrades a
 * cross-account request to scope=public and enotify then withholds those types, so a
 * column built for someone else with one of them renders permanently empty.
 *
 * This pins which types that is. It has to stay in step with
 * PUBLIC_ACTIVITY_MAIN_TYPES in enotify (constants.py); the two live in different
 * repositories, so drift here is silent and shows up only as an empty column.
 */
describe("Decks self-only notification content types", () => {
  it("withholds exactly the Ecency-only types", () => {
    expect([...SELF_ONLY_NOTIFICATION_CONTENT_TYPES].sort()).toEqual([
      "nbookmarks",
      "nfavorites",
      "scheduled_published"
    ]);
  });

  it("keeps every chain-derived type available cross-account", () => {
    // These map to main types enotify serves under scope=public.
    for (const type of [
      "rvotes",
      "mentions",
      "follows",
      "replies",
      "reblogs",
      "payouts",
      "delegations"
    ]) {
      expect(SELF_ONLY_NOTIFICATION_CONTENT_TYPES).not.toContain(type);
    }
  });

  it("keeps `all` and `transfers` available, since both still return a subset", () => {
    // Neither is withheld wholesale: `all` returns the public types and `transfers`
    // returns chain transfers while enotify drops the Ecency Points rows from it.
    expect(SELF_ONLY_NOTIFICATION_CONTENT_TYPES).not.toContain("all");
    expect(SELF_ONLY_NOTIFICATION_CONTENT_TYPES).not.toContain("transfers");
  });

  it("only names types the picker actually offers", () => {
    // A stale entry here would silently protect nothing.
    const offered = NOTIFICATION_CONTENT_TYPES.map(({ type }) => type);
    const unknown = SELF_ONLY_NOTIFICATION_CONTENT_TYPES.filter((t) => !offered.includes(t));
    expect(unknown).toEqual([]);
  });
});

/**
 * Both the add-column picker and an existing column's settings resolve their options
 * through this, so a cross-account column cannot be switched onto a restricted type
 * after the fact.
 */
describe("notificationContentTypesFor", () => {
  const names = (list: { type: string }[]) => list.map(({ type }) => type);

  it("offers everything for your own account, case-insensitively", () => {
    for (const target of ["good-karma", "Good-Karma", "GOOD-KARMA"]) {
      expect(names(notificationContentTypesFor(target, "good-karma"))).toEqual(
        names(NOTIFICATION_CONTENT_TYPES)
      );
    }
  });

  it("withholds the self-only types for another account", () => {
    const offered = names(notificationContentTypesFor("someone-else", "good-karma"));

    for (const type of SELF_ONLY_NOTIFICATION_CONTENT_TYPES) {
      expect(offered).not.toContain(type);
    }
    expect(offered).toContain("all");
    expect(offered).toContain("transfers");
  });

  it("withholds them when signed out or with no target chosen", () => {
    // Neither an unknown viewer nor an unset target can be shown to be self.
    for (const [target, active] of [
      ["someone", undefined],
      [undefined, "good-karma"],
      ["", "good-karma"],
      [undefined, undefined]
    ] as [string | undefined, string | undefined][]) {
      const offered = names(notificationContentTypesFor(target, active));
      expect(offered).not.toContain("nfavorites");
    }
  });
});
