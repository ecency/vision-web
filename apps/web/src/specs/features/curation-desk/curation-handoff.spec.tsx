import React from "react";
import "@testing-library/jest-dom";
import { screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { CurationHandoffEntry } from "@ecency/sdk";
import { renderWithQueryClient } from "@/specs/test-utils";

vi.mock("@ecency/sdk", async () => ({ ...(await vi.importActual<Record<string, unknown>>("@ecency/sdk")) }));
vi.mock("@/utils", async () => ({
  ...(await vi.importActual<Record<string, unknown>>("@/utils")),
  dateToRelative: () => "2 hours ago",
}));
vi.mock("@/features/shared/user-avatar", () => ({ UserAvatar: () => <span /> }));

import { CurationHandoffBar } from "@/features/curation-desk/curation-handoff-bar";
import { describeLane, isSameUtcDay, orderHandoff } from "@/features/curation-desk/curation-handoff";

const NOW = Date.parse("2026-09-07T12:00:00.000Z");

function entry(over: Partial<CurationHandoffEntry> = {}): CurationHandoffEntry {
  return {
    username: "melinda010100",
    reviewed_to: "2026-09-07T08:14:00",
    reviewed_to_post_id: 42,
    last_mark_at: "2026-09-07T10:00:00",
    marks_24h: 14,
    ...over,
  };
}

describe("describeLane", () => {
  it("names the whole queue when nothing narrows it", () => {
    expect(describeLane({})).toBe("curation-desk.handoff.lane-all");
  });

  it("reuses the refine panel's own labels, so one filter never reads two ways", () => {
    expect(describeLane({ app: "peakd" })).toBe("curation-desk.filters.app-peakd");
    expect(describeLane({ window: "12h" })).toBe("curation-desk.filters.window-12h");
    expect(describeLane({ new_authors: true })).toBe("curation-desk.filters.new-authors");
  });

  /**
   * A curator who is not hiding handled rows is re-reading rather than
   * advancing, so their position claims less than it looks like.
   */
  it("says so when the curator is re-reading handled posts", () => {
    expect(describeLane({ hide_reviewed: false })).toBe("curation-desk.handoff.lane-rereading");
  });

  it("keeps the line short by naming two facets and counting the rest", () => {
    expect(
      describeLane({ app: "peakd", window: "full", new_authors: true, recommended: true })
    ).toBe("curation-desk.handoff.lane-more");
  });

  it("prefers the community's title over its id, and says nothing without a lane", () => {
    expect(describeLane({ community: "hive-125125" }, "Photography")).toBe("Photography");
    expect(describeLane(undefined)).toBe("");
    // Null is a mark from before the desk sent lanes: unknown, never a claim.
    expect(describeLane(null)).toBe("");
  });

  /**
   * The one property this text exists for: a lane that narrows anything can
   * never print as the whole queue. Every facet the backend can record is
   * either named or counted.
   */
  it.each([
    ["min_words", { min_words: 500 }],
    ["max_words", { max_words: 300 }],
    ["rep range", { rep_min: 40, rep_max: 100 }],
    ["has_images", { has_images: true }],
    ["excluded view", { view: "excluded" }],
    ["curated included", { hide_curated: false }],
    ["snoozed shown", { hide_snoozed: false }],
    ["not flagged", { flagged: false }],
  ] as const)("never reads %s as the whole queue", (_name, lane) => {
    const text = describeLane(lane);
    expect(text).not.toBe("curation-desk.handoff.lane-all");
    expect(text).not.toBe("");
  });

  /**
   * The order decides whether a position is a watermark at all: a mark on
   * newest-first says nothing about the older posts. It comes first, and it is
   * never the whole queue either.
   */
  it("names any order but the queue order, first", () => {
    expect(describeLane({ sort: "newest" })).toBe("curation-desk.handoff.order-newest");
    expect(describeLane({ sort: "random", app: "peakd" })).toBe(
      "curation-desk.handoff.order-random, curation-desk.filters.app-peakd"
    );
    expect(describeLane({ sort: "queue" })).toBe("curation-desk.handoff.lane-all");
  });
});

describe("orderHandoff", () => {
  it("puts the viewer first, then whoever marked most recently, whatever order arrived", () => {
    const rows = orderHandoff(
      [
        entry({ username: "seckorama", last_mark_at: "2026-09-07T06:00:00" }),
        entry({ username: "me", last_mark_at: "2026-09-07T05:00:00" }),
        entry({ username: "dunsky", last_mark_at: "2026-09-07T09:40:00" }),
      ],
      "me"
    );
    expect(rows.map((r) => r.username)).toEqual(["me", "dunsky", "seckorama"]);
  });

  it("is empty for nothing at all", () => {
    expect(orderHandoff(undefined, "me")).toEqual([]);
    expect(orderHandoff([], "me")).toEqual([]);
  });
});

describe("isSameUtcDay", () => {
  it("separates today from an earlier date, which is what a bare HH:MM cannot", () => {
    expect(isSameUtcDay("2026-09-07T08:14:00", NOW)).toBe(true);
    expect(isSameUtcDay("2026-09-05T23:59:00", NOW)).toBe(false);
    expect(isSameUtcDay(null, NOW)).toBe(false);
  });
});

describe("CurationHandoffBar", () => {
  it("shows one line per curator, the viewer first and named as themselves", () => {
    renderWithQueryClient(
      <CurationHandoffBar
        entries={[entry({ username: "seckorama", marks_24h: 3 }), entry({ username: "me" })]}
        username="me"
        updatedAt={NOW}
        now={NOW}
        communities={[]}
        queueStartsAtOldestUnhandled
      />
    );
    const rows = screen.getAllByRole("listitem");
    expect(rows).toHaveLength(2);
    expect(within(rows[0]).getByText("curation-desk.handoff.you")).toBeInTheDocument();
    expect(within(rows[1]).getByText("@seckorama")).toBeInTheDocument();
  });

  /**
   * A hand-off is exactly the case where this morning and three days ago differ,
   * and a bare HH:MM cannot tell them apart.
   */
  it("prints a date on a position that is not from today", () => {
    renderWithQueryClient(
      <CurationHandoffBar entries={[entry()]} username="me" updatedAt={NOW} now={NOW} communities={[]} queueStartsAtOldestUnhandled />
    );
    expect(screen.getByText("curation-desk.handoff.to-time")).toBeInTheDocument();

    renderWithQueryClient(
      <CurationHandoffBar
        entries={[entry({ reviewed_to: "2026-09-04T08:14:00" })]}
        username="me"
        updatedAt={NOW}
        now={NOW}
        communities={[]}
        queueStartsAtOldestUnhandled
      />
    );
    expect(screen.getAllByText("curation-desk.handoff.to-date").length).toBeGreaterThan(0);
  });

  it("says the queue is untouched rather than rendering nothing", () => {
    renderWithQueryClient(<CurationHandoffBar entries={[]} username="me" updatedAt={NOW} now={NOW} communities={[]} queueStartsAtOldestUnhandled />);
    expect(screen.getByText("curation-desk.handoff.empty")).toBeInTheDocument();
  });

  /**
   * Null is "not known": no tick has answered yet, or the backend does not
   * send hand-offs. That is not "nobody has marked", and must not read as it.
   */
  it("claims nothing while the hand-off is not known", () => {
    renderWithQueryClient(<CurationHandoffBar entries={null} username="me" updatedAt={null} now={NOW} communities={[]} queueStartsAtOldestUnhandled />);
    expect(screen.queryByText("curation-desk.handoff.empty")).toBeNull();
    expect(screen.queryByRole("list")).toBeNull();
    expect(screen.getByText("curation-desk.handoff.title")).toBeInTheDocument();
  });

  /**
   * The tick stops on its own when the tab is idle or hidden, and on a failure,
   * so freshness is read off the clock rather than off a flag only one of those
   * paths sets. Two missed ticks and the bar says when it last heard anything.
   */
  it("shows when it was last updated, and flags it once two ticks are missed", () => {
    const fresh = renderWithQueryClient(
      <CurationHandoffBar entries={[entry()]} username="me" updatedAt={NOW - 10_000} now={NOW} communities={[]} queueStartsAtOldestUnhandled />
    );
    expect(screen.getByText("curation-desk.handoff.updated")).not.toHaveClass("text-warning-ink");
    fresh.unmount();
    renderWithQueryClient(
      <CurationHandoffBar entries={[entry()]} username="me" updatedAt={NOW - 5 * 60_000} now={NOW} communities={[]} queueStartsAtOldestUnhandled />
    );
    expect(screen.getByText("curation-desk.handoff.updated")).toHaveClass("text-warning-ink");
  });

  /**
   * "Your queue starts at the oldest post nobody has handled" is true of the
   * queue order with handled rows hidden and of nothing else, so it is said
   * only then.
   */
  it("says where the queue starts only when that is actually true", () => {
    const first = renderWithQueryClient(
      <CurationHandoffBar entries={[]} username="me" updatedAt={NOW} now={NOW} communities={[]} queueStartsAtOldestUnhandled />
    );
    expect(screen.getByText("curation-desk.handoff.where-you-start")).toBeInTheDocument();
    first.unmount();
    renderWithQueryClient(
      <CurationHandoffBar entries={[]} username="me" updatedAt={NOW} now={NOW} communities={[]} queueStartsAtOldestUnhandled={false} />
    );
    expect(screen.queryByText("curation-desk.handoff.where-you-start")).toBeNull();
  });

  it("names the community by its title when the queue knows it", () => {
    renderWithQueryClient(
      <CurationHandoffBar
        entries={[entry({ lane: { community: "hive-125125" } })]}
        username="me"
        updatedAt={NOW}
        now={NOW}
        communities={[{ community: "hive-125125", title: "Photography" }]}
        queueStartsAtOldestUnhandled
      />
    );
    expect(screen.getByText("Photography")).toBeInTheDocument();
  });

  /** A trial viewer gets positions but no count for anyone but themselves. */
  it("renders a curator whose count the backend withheld", () => {
    renderWithQueryClient(
      <CurationHandoffBar
        entries={[entry({ username: "seckorama", marks_24h: undefined })]}
        username="trial1"
        updatedAt={NOW}
        now={NOW}
        communities={[]}
        queueStartsAtOldestUnhandled
      />
    );
    expect(screen.getByText("@seckorama")).toBeInTheDocument();
    expect(screen.queryByText("curation-desk.handoff.marks")).toBeNull();
    expect(screen.queryByText("curation-desk.handoff.curations")).toBeNull();
  });

  it("shows how many posts each curator got curated next to their marks", () => {
    renderWithQueryClient(
      <CurationHandoffBar
        entries={[entry({ username: "seckorama", curations_24h: 4 })]}
        username="me"
        updatedAt={NOW}
        now={NOW}
        communities={[]}
        queueStartsAtOldestUnhandled
      />
    );
    const row = screen.getByRole("listitem");
    expect(within(row).getByText("curation-desk.handoff.marks")).toBeInTheDocument();
    expect(within(row).getByText("curation-desk.handoff.curations")).toBeInTheDocument();
  });

  /** A curator who only voted has no position and no mark time. */
  it("renders a curator who curated without marking, after everyone who marked", () => {
    renderWithQueryClient(
      <CurationHandoffBar
        entries={[
          entry({
            username: "voteronly",
            reviewed_to: null,
            reviewed_to_post_id: null,
            last_mark_at: null,
            marks_24h: 0,
            lane: null,
            curations_24h: 2,
          }),
          entry({ username: "seckorama" }),
        ]}
        username="me"
        updatedAt={NOW}
        now={NOW}
        communities={[]}
        queueStartsAtOldestUnhandled
      />
    );
    const rows = screen.getAllByRole("listitem");
    expect(within(rows[0]).getByText("@seckorama")).toBeInTheDocument();
    expect(within(rows[1]).getByText("@voteronly")).toBeInTheDocument();
    expect(within(rows[1]).getByText("curation-desk.handoff.curations")).toBeInTheDocument();
    // no position and no "2 hours ago" for a mark that never happened
    expect(within(rows[1]).queryByText("2 hours ago")).toBeNull();
    expect(within(rows[1]).queryByText(/curation-desk\.handoff\.to-/)).toBeNull();
  });

  it("renders a position whose lane is unknown, without claiming the whole queue", () => {
    // null is the shape the backend actually sends for a mark from before lanes.
    renderWithQueryClient(
      <CurationHandoffBar entries={[entry({ lane: null })]} username="me" updatedAt={NOW} now={NOW} communities={[]} queueStartsAtOldestUnhandled />
    );
    expect(screen.getByRole("listitem")).toBeInTheDocument();
    expect(screen.queryByText("curation-desk.handoff.lane-all")).toBeNull();
  });
});
