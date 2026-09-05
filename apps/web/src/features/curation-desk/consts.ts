export const QUEUE_PAGE_SIZE = 25;
export const POLL_MS_CURATOR = 15_000;
export const POLL_MS_PUBLIC = 60_000;
/** One shared clock for every window badge; a countdown never re-renders a row. */
export const TICKER_MS = 60_000;
/** Snooze presets in hours, plus "tomorrow" (09:00 UTC). */
export const SNOOZE_PRESETS = [1, 3, 12, "tomorrow"] as const;
export type SnoozePreset = (typeof SNOOZE_PRESETS)[number];
/** No tick after this long without a curator action. */
export const IDLE_MS = 10 * 60_000;
/** A row materialized this long after `created` is "late" once it sits below the cursor. */
export const LATE_MS = 10 * 60_000;
/** Route 5 poll schedule after a recommend broadcast (seconds from the broadcast). */
export const RECOMMEND_POLL_AT_S = [5, 15, 30, 60] as const;
export const RECOMMEND_CONFIRM_DEADLINE_MS = 60_000;
/** Meta ping retry delays. */
export const META_RETRY_MS = [2_000, 10_000, 30_000] as const;
export const QUICK_VIEW_PREFETCH_DEBOUNCE_MS = 300;
export const UNDO_REVIEWED_MS = 5_000;
export const UNDO_CURSOR_MS = 30_000;
export const SORT_STORAGE_KEY = "curation-desk-sort";
export const SEED_STORAGE_KEY = "curation-desk-seed";
export const MY_MARKS_KEY_SUFFIX = "my-marks";
/** Word count presets, offered as both a minimum and a maximum. */
export const WORD_PRESETS = [300, 600, 1000] as const;
/** Vote is hidden under this payout scale-down factor (percent). */
export const LOCKED_VOTE_FLOOR_PCT = 25;
export const HOUR_MS = 3_600_000;
export const DAY_MS = 24 * HOUR_MS;
