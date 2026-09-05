import type { CurationSort, CurationTeamCursor, CurationWindow } from "@ecency/sdk";
import { LATE_MS } from "./consts";
import { computeWindow, parseChainDate } from "./curation-window";
import type { DeskRow, QueueDisplayItem, RowSection } from "./types";

export interface QueueDisplayOptions {
  rows: DeskRow[];
  teamCursor: CurationTeamCursor | null | undefined;
  sort: CurationSort;
  now: number;
  window: CurationWindow;
  expanded: { half: boolean; eighth: boolean; olderReviewed: boolean };
}

export interface QueueDisplay {
  items: QueueDisplayItem[];
  counts: { pinned: number; queue: number; half: number; eighth: number; olderReviewed: number };
  chronological: boolean;
}

export function isChronological(sort: CurationSort): boolean {
  return sort === "queue" || sort === "newest";
}

/** Row-wise comparison `(created, post_id) <= (cursor.created, cursor.post_id)`. */
export function isAtOrBelowCursor(row: DeskRow, cursor: CurationTeamCursor | null | undefined): boolean {
  if (!cursor || !cursor.created || cursor.post_id == null) return false;
  const rowMs = parseChainDate(row.created);
  const cursorMs = parseChainDate(cursor.created);
  if (rowMs == null || cursorMs == null) return false;
  if (rowMs !== cursorMs) return rowMs < cursorMs;
  return row.post_id <= cursor.post_id;
}

export function rowKey(row: DeskRow): string {
  return `${row.author}/${row.permlink}`;
}

/**
 * Turns the loaded pages into what the list renders: pinned late and
 * resurfaced rows, the working queue, the half and eighth weight tails, the
 * team cursor divider and the collapsed older reviewed rows. Only a display
 * boundary: every row below the divider is still served by the server; no row
 * is ever filtered out (a client filter would make endReached walk forever).
 */
export function buildQueueDisplay(options: QueueDisplayOptions): QueueDisplay {
  const { rows, teamCursor, sort, now, window, expanded } = options;
  const chronological = isChronological(sort);

  const pinned: QueueDisplayItem[] = [];
  const queue: QueueDisplayItem[] = [];
  const half: QueueDisplayItem[] = [];
  const eighth: QueueDisplayItem[] = [];
  const older: QueueDisplayItem[] = [];

  for (const row of rows) {
    const key = rowKey(row);
    const overlay = row.overlay;
    const belowCursor = isAtOrBelowCursor(row, teamCursor);
    const unmarked = !overlay?.team_mark;
    const open = row.state === 0;
    const reviewedByCursor = belowCursor && unmarked && open;

    // A row the desk materialized well after it was created reached the queue
    // late, so it is pinned even though the cursor already passed its time.
    // `resurfaced_at` says the same thing on its own: a row whose snooze ended
    // pins with no inserted_at at all.
    const insertedMs = parseChainDate(row.inserted_at);
    const createdMs = parseChainDate(row.created);
    const late =
      belowCursor && unmarked && open && insertedMs != null && createdMs != null && insertedMs - createdMs > LATE_MS;
    const resurfaced = belowCursor && unmarked && open && !!overlay?.resurfaced_at;

    const state = computeWindow(row.created, row.payout_at, now);
    let section: RowSection = "queue";
    if (chronological) {
      if (late || resurfaced) {
        section = "pinned";
      } else if (belowCursor) {
        section = "below-cursor";
      } else if (unmarked && open && window === "all") {
        if (state.kind === "half") section = "tail-half";
        else if (state.kind === "eighth" || state.kind === "locked") section = "tail-eighth";
      }
    }

    const item: QueueDisplayItem = {
      type: "row",
      key,
      row,
      section,
      late,
      resurfaced,
      belowCursor,
      reviewedByCursor,
      windowKind: state.kind,
      locked: state.kind === "locked",
      voteHidden: state.kind === "locked" && state.voteHidden,
      scalePct: state.kind === "locked" ? state.scalePct : 100,
    };
    switch (section) {
      case "pinned":
        pinned.push(item);
        break;
      case "below-cursor":
        older.push(item);
        break;
      case "tail-half":
        half.push(item);
        break;
      case "tail-eighth":
        eighth.push(item);
        break;
      default:
        queue.push(item);
    }
  }

  const items: QueueDisplayItem[] = [...pinned, ...queue];
  if (half.length) {
    items.push({ type: "tail", key: "tail-half", window: "half", count: half.length, expanded: expanded.half });
    if (expanded.half) items.push(...half);
  }
  if (eighth.length) {
    items.push({ type: "tail", key: "tail-eighth", window: "eighth", count: eighth.length, expanded: expanded.eighth });
    if (expanded.eighth) items.push(...eighth);
  }
  if (chronological && teamCursor?.created) {
    items.push({ type: "divider", key: "team-cursor" });
  }
  if (older.length) {
    items.push({
      type: "older-reviewed",
      key: "older-reviewed",
      count: older.length,
      expanded: expanded.olderReviewed,
    });
    if (expanded.olderReviewed) items.push(...older);
  }

  return {
    items,
    counts: {
      pinned: pinned.length,
      queue: queue.length,
      half: half.length,
      eighth: eighth.length,
      olderReviewed: older.length,
    },
    chronological,
  };
}

/** Rows in display order, used for j/k navigation. */
export function navigableRows(items: QueueDisplayItem[]): DeskRow[] {
  const out: DeskRow[] = [];
  for (const item of items) if (item.type === "row") out.push(item.row);
  return out;
}
