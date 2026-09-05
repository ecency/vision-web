import { describe, expect, it, vi } from "vitest";
import { makeOverlay, makeRow, NOW } from "./curation-test-utils";

vi.mock("@ecency/sdk", async () => ({ ...(await vi.importActual<Record<string, unknown>>("@ecency/sdk")) }));

import { buildQueueDisplay } from "@/features/curation-desk/curation-queue-display";
import type { QueueDisplayItem } from "@/features/curation-desk/types";

const CURSOR = { post_id: 500, created: new Date(NOW - 30 * 60_000).toISOString(), set_by: "seckorama" };
// Every group expanded, so a row that fell into a collapsed group is still
// reachable and its flags can be asserted.
const EXPANDED = { half: true, eighth: true, olderReviewed: true };

function build(
  rows: Parameters<typeof buildQueueDisplay>[0]["rows"],
  teamCursor: Parameters<typeof buildQueueDisplay>[0]["teamCursor"] = CURSOR
) {
  return buildQueueDisplay({ rows, teamCursor, sort: "queue", now: NOW, window: "all", expanded: EXPANDED });
}

function rowItem(items: QueueDisplayItem[], postId: number) {
  const item = items.find((i) => i.type === "row" && i.row.post_id === postId);
  return item && item.type === "row" ? item : undefined;
}

/** Below the cursor by created time, so only a pin can bring it back up. */
function belowCursorRow(postId: number, extra = {}) {
  return makeRow({
    post_id: postId,
    created: new Date(NOW - 90 * 60_000).toISOString(),
    overlay: makeOverlay(),
    ...extra,
  });
}

describe("late and resurfaced pinning", () => {
  it("pins a row the desk materialized more than 10 minutes after it was created", () => {
    const late = belowCursorRow(101, { inserted_at: new Date(NOW - 60 * 60_000).toISOString() });
    const display = build([late]);
    const item = rowItem(display.items, 101)!;
    expect(item.late).toBe(true);
    expect(item.section).toBe("pinned");
    expect(display.counts.pinned).toBe(1);
    // Pinned rows lead the list, ahead of the working queue.
    expect(display.items[0]).toBe(item);
  });

  it("pins a resurfaced row that carries no inserted_at at all", () => {
    const resurfaced = belowCursorRow(102, {
      overlay: makeOverlay({ resurfaced_at: new Date(NOW - 5 * 60_000).toISOString() }),
    });
    expect(resurfaced.inserted_at).toBeUndefined();
    const item = rowItem(build([resurfaced]).items, 102)!;
    expect(item.resurfaced).toBe(true);
    expect(item.late).toBe(false);
    expect(item.section).toBe("pinned");
  });

  it("leaves an ordinary below-cursor row in the collapsed older group", () => {
    const plain = belowCursorRow(103, { inserted_at: new Date(NOW - 89 * 60_000).toISOString() });
    const display = build([plain]);
    const item = rowItem(display.items, 103)!;
    expect(item.late).toBe(false);
    expect(item.section).toBe("below-cursor");
    expect(display.counts.olderReviewed).toBe(1);
    expect(display.items.some((i) => i.type === "older-reviewed")).toBe(true);
  });

  it("never pins a row a curator already marked", () => {
    const marked = belowCursorRow(104, {
      inserted_at: new Date(NOW - 60 * 60_000).toISOString(),
      overlay: makeOverlay({ team_mark: "reviewed", team_mark_by: "riyat", resurfaced_at: new Date(NOW).toISOString() }),
    });
    const item = rowItem(build([marked]).items, 104)!;
    expect(item.late).toBe(false);
    expect(item.resurfaced).toBe(false);
    expect(item.section).toBe("below-cursor");
  });

  it("carries the window state so the row never reads the clock itself", () => {
    const fresh = makeRow({
      post_id: 105,
      created: new Date(NOW - 60 * 60_000).toISOString(),
      payout_at: new Date(NOW + 6 * 24 * 3_600_000).toISOString(),
    });
    const locked = makeRow({
      post_id: 106,
      created: new Date(NOW - 6.9 * 24 * 3_600_000).toISOString(),
      payout_at: new Date(NOW + 2 * 3_600_000).toISOString(),
    });
    // No cursor here: this is about the window, not about the hand-off.
    const items = build([fresh, locked], null).items;
    expect(rowItem(items, 105)).toMatchObject({ windowKind: "full", locked: false, voteHidden: false, scalePct: 100 });
    expect(rowItem(items, 106)).toMatchObject({ windowKind: "locked", locked: true, voteHidden: true, scalePct: 17 });
  });
});
