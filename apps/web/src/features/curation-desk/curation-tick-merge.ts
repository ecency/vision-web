import type { InfiniteData } from "@tanstack/react-query";
import type {
  CurationMark,
  CurationOverlay,
  CurationRosterFeedPage,
  CurationTickResponse,
} from "@ecency/sdk";
import type { DeskRow } from "./types";

function emptyOverlay(): CurationOverlay {
  return {
    signals: null,
    flags: {},
    excluded_reason: null,
    team_mark: null,
    team_mark_by: null,
    resurfaced_at: null,
    marks: [],
    notes_count: 0,
  };
}

function upsertMark(marks: CurationMark[], mark: CurationMark): CurationMark[] {
  const index = marks.findIndex((m) => m.curator === mark.curator);
  if (index === -1) return [...marks, mark];
  const existing = marks[index];
  if (existing.updated_at >= mark.updated_at) return marks;
  const next = marks.slice();
  next[index] = mark;
  return next;
}

/** Team level = the newest mark on the row. */
function teamLevel(marks: CurationMark[]): Pick<CurationOverlay, "team_mark" | "team_mark_by" | "team_snooze_until"> {
  const newest = marks
    .filter((m) => m.state !== "noted")
    .sort((a, b) => (a.updated_at < b.updated_at ? 1 : -1))[0];
  return {
    team_mark: newest?.state ?? null,
    team_mark_by: newest?.curator ?? null,
    team_snooze_until: newest?.state === "snoozed" ? newest.snooze_until ?? null : null,
  };
}

/**
 * Apply one tick response to the loaded roster pages. Rows the tick did not
 * touch are returned as the SAME object, so memoized row components skip their
 * render; pages with no changed row keep their identity too.
 */
export function mergeTickIntoPages(
  data: InfiniteData<CurationRosterFeedPage, unknown> | undefined,
  tick: CurationTickResponse
): InfiniteData<CurationRosterFeedPage, unknown> | undefined {
  if (!data) return data;

  const overlayById = new Map<number, CurationOverlay>();
  for (const item of tick.overlay ?? []) {
    const { post_id, ...overlay } = item;
    overlayById.set(post_id, overlay);
  }
  const marksById = new Map<number, CurationMark[]>();
  for (const item of tick.deltas?.marks ?? []) {
    const { post_id, ...mark } = item;
    const list = marksById.get(post_id) ?? [];
    list.push(mark);
    marksById.set(post_id, list);
  }
  const flagsById = new Map(
    (tick.deltas?.flags ?? []).map((f) => [f.post_id, f] as const)
  );
  const signalsById = new Map(
    (tick.deltas?.signals ?? []).map((s) => [s.post_id, s.signals] as const)
  );

  if (!overlayById.size && !marksById.size && !flagsById.size && !signalsById.size) {
    return data;
  }

  let anyPageChanged = false;
  const pages = data.pages.map((page) => {
    let pageChanged = false;
    const items = page.items.map((row): DeskRow => {
      const id = row.post_id;
      const fullOverlay = overlayById.get(id);
      const marks = marksById.get(id);
      const flags = flagsById.get(id);
      const signals = signalsById.get(id);
      if (!fullOverlay && !marks && !flags && signals === undefined) return row;

      let overlay: CurationOverlay = fullOverlay ?? row.overlay ?? emptyOverlay();
      if (marks) {
        let list = overlay.marks;
        for (const mark of marks) list = upsertMark(list, mark);
        overlay = {
          ...overlay,
          marks: list,
          ...teamLevel(list),
          notes_count: list.filter((m) => m.state === "noted" || !!m.note).length,
        };
      }
      if (flags) {
        overlay = { ...overlay, flags: flags.flags, excluded_reason: flags.excluded_reason };
      }
      if (signals !== undefined) {
        overlay = { ...overlay, signals };
      }
      pageChanged = true;
      return { ...row, overlay };
    });
    if (!pageChanged) return page;
    anyPageChanged = true;
    return { ...page, items };
  });

  return anyPageChanged ? { ...data, pages } : data;
}

/** Replace one row (by post_id) across the loaded pages, keeping every other object. */
export function replaceRowInPages<TPage extends { items: DeskRow[] }>(
  data: InfiniteData<TPage, unknown> | undefined,
  next: DeskRow
): InfiniteData<TPage, unknown> | undefined {
  if (!data) return data;
  let changed = false;
  const pages = data.pages.map((page) => {
    const index = page.items.findIndex((r) => r.post_id === next.post_id);
    if (index === -1) return page;
    changed = true;
    const items = page.items.slice();
    // Server rows may omit the overlay on a public shape; keep what we had.
    items[index] = { ...items[index], ...next, overlay: next.overlay ?? items[index].overlay };
    return { ...page, items };
  });
  return changed ? { ...data, pages } : data;
}
