import i18next from "i18next";
import type { CurationHandoffEntry, CurationLane } from "@ecency/sdk";
import { DAY_MS } from "./consts";
import { parseChainDate } from "./curation-window";

/** A value that narrows nothing, so its presence must not count as a filter. */
const LANE_DEFAULTS: Partial<Record<keyof CurationLane, unknown>> = {
  sort: "queue",
  view: "queue",
  app: "all",
  window: "all",
  has_images: false,
  new_authors: false,
  recommended: false,
  hide_curated: true,
  hide_reviewed: true,
  hide_snoozed: true,
};

/** Every lane key the backend can write, so an unnamed narrowing is still counted. */
const LANE_KEYS: Array<keyof CurationLane> = [
  "sort",
  "view",
  "app",
  "community",
  "window",
  "rep_min",
  "rep_max",
  "min_words",
  "max_words",
  "has_images",
  "new_authors",
  "recommended",
  "flagged",
  "hide_curated",
  "hide_reviewed",
  "hide_snoozed",
];

/**
 * The lane in words, using the labels the refine panel already shows, so the
 * same filter never reads two different ways on one page.
 *
 * Every facet the backend can record is either named here or counted, so a
 * lane that narrows anything can never print as the whole queue: only the
 * literal `{}` does. That is the one property this text exists for, because
 * the hand-off's whole point is not to overstate what was covered.
 *
 * The order comes first when it is not the queue order, because it decides
 * whether the position is a watermark at all: a mark on newest-first says
 * nothing about the older posts.
 *
 * Null is unknown, a mark from before the desk sent lanes, and reads as
 * nothing rather than as a claim.
 */
export function describeLane(lane: CurationLane | null | undefined, communityTitle?: string | null): string {
  if (!lane) return "";
  const parts: string[] = [];
  const named = new Set<keyof CurationLane>();
  const push = (key: keyof CurationLane, text: string) => {
    parts.push(text);
    named.add(key);
  };

  if (lane.sort && lane.sort !== "queue") {
    push("sort", i18next.t(`curation-desk.handoff.order-${lane.sort}`));
  }
  if (lane.view && lane.view !== "queue") push("view", i18next.t(`curation-desk.filters.${lane.view}`));
  if (lane.community) push("community", communityTitle || lane.community);
  if (lane.app && lane.app !== "all") push("app", i18next.t(`curation-desk.filters.app-${lane.app}`));
  if (lane.window && lane.window !== "all") {
    push("window", i18next.t(`curation-desk.filters.window-${lane.window}`));
  }
  if (lane.rep_min != null || lane.rep_max != null) {
    push("rep_min", i18next.t("curation-desk.filters.rep", { min: lane.rep_min ?? 0, max: lane.rep_max ?? 100 }));
    named.add("rep_max");
  }
  if (lane.min_words != null) push("min_words", i18next.t("curation-desk.filters.words-min", { count: lane.min_words }));
  if (lane.max_words != null) push("max_words", i18next.t("curation-desk.filters.words-max", { count: lane.max_words }));
  if (lane.has_images) push("has_images", i18next.t("curation-desk.filters.has-images"));
  if (lane.new_authors) push("new_authors", i18next.t("curation-desk.filters.new-authors"));
  if (lane.recommended) push("recommended", i18next.t("curation-desk.filters.recommended"));
  if (lane.flagged === true) push("flagged", i18next.t("curation-desk.filters.flagged"));
  if (lane.flagged === false) push("flagged", i18next.t("curation-desk.handoff.lane-unflagged"));
  if (lane.hide_curated === false) push("hide_curated", i18next.t("curation-desk.handoff.lane-with-curated"));
  // Not hiding handled rows is a lane of its own: that curator is re-reading
  // rather than advancing, so their position says less than it looks like.
  if (lane.hide_reviewed === false || lane.hide_snoozed === false) {
    push("hide_reviewed", i18next.t("curation-desk.handoff.lane-rereading"));
    named.add("hide_snoozed");
  }

  // Anything present that the lines above did not name still narrows the
  // queue, so it is counted rather than allowed to vanish into "all posts".
  const unnamed = LANE_KEYS.filter(
    (key) => !named.has(key) && lane[key] != null && lane[key] !== LANE_DEFAULTS[key]
  ).length;

  if (parts.length === 0 && unnamed === 0) return i18next.t("curation-desk.handoff.lane-all");
  const shown = parts.slice(0, 2);
  const more = parts.length - shown.length + unnamed;
  if (shown.length === 0) return i18next.t("curation-desk.handoff.lane-narrowed", { count: more });
  if (more > 0) return i18next.t("curation-desk.handoff.lane-more", { lane: shown.join(", "), count: more });
  return shown.join(", ");
}

/**
 * The viewer first, then whoever marked most recently. A curator who only
 * curated has no mark time and sorts after everyone who marked. Their own line is the
 * one they check against, so it should not move down the list as colleagues
 * work. The order of the rest is decided here rather than trusted from the
 * wire: nothing in the response contract promises one.
 */
export function orderHandoff(
  entries: CurationHandoffEntry[] | null | undefined,
  username: string | undefined
): CurationHandoffEntry[] {
  if (!entries?.length) return [];
  const mine = username ? entries.filter((e) => e.username === username) : [];
  const others = entries
    .filter((e) => e.username !== username)
    .sort((a, b) => (parseChainDate(b.last_mark_at) ?? 0) - (parseChainDate(a.last_mark_at) ?? 0));
  return [...mine, ...others];
}

/**
 * A position from today can print the time alone; anything older has to carry
 * its date, or a curator reads a three day old hand-off as this morning.
 */
export function isSameUtcDay(value: string | null | undefined, now: number): boolean {
  const ms = parseChainDate(value);
  if (ms == null) return false;
  return Math.floor(ms / DAY_MS) === Math.floor(now / DAY_MS);
}
