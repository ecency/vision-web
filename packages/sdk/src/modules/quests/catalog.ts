/**
 * Shared quest catalog — the single source of truth for which quests exist, their
 * encouraging goals, copy keys and icon hints. Lives in the SDK so the web and mobile
 * clients render an identical, harmonized set. The backend (`/private-api/quests`)
 * returns raw progress + the reward `cap`; this catalog layers the presentation.
 *
 * `goal` is an *encouraging, reachable* daily target and is intentionally independent of
 * the backend reward `cap` (the point at which the existing reward decays to ~0). It is
 * tunable here without any backend change.
 */

export type QuestTier = "daily" | "weekly" | "monthly";

export interface QuestCatalogEntry {
  id: string;
  tier: QuestTier;
  /** encouraging, reachable target for the period (tunable, not the reward cap) */
  goal: number;
  /** i18n key suffix; clients resolve e.g. `quests.<i18nKey>.title` / `.desc` */
  i18nKey: string;
  /** semantic icon hint; each client maps it to its own icon set */
  icon: string;
}

export const QUEST_CATALOG: QuestCatalogEntry[] = [
  // Daily
  { id: "checkin", tier: "daily", goal: 1, i18nKey: "checkin", icon: "check-circle" },
  { id: "post", tier: "daily", goal: 1, i18nKey: "post", icon: "pencil" },
  { id: "comment", tier: "daily", goal: 3, i18nKey: "comment", icon: "comment" },
  { id: "vote", tier: "daily", goal: 10, i18nKey: "vote", icon: "chevron-up-circle" },
  { id: "reblog", tier: "daily", goal: 1, i18nKey: "reblog", icon: "repeat" },
  { id: "spin", tier: "daily", goal: 1, i18nKey: "spin", icon: "gift" },
  // Weekly
  { id: "post", tier: "weekly", goal: 5, i18nKey: "post", icon: "pencil" },
  { id: "comment", tier: "weekly", goal: 15, i18nKey: "comment", icon: "comment" },
  { id: "vote", tier: "weekly", goal: 50, i18nKey: "vote", icon: "chevron-up-circle" },
  { id: "reblog", tier: "weekly", goal: 5, i18nKey: "reblog", icon: "repeat" },
  // Monthly
  { id: "post", tier: "monthly", goal: 20, i18nKey: "post", icon: "pencil" },
];

export function getQuestCatalogEntry(tier: QuestTier, id: string) {
  return QUEST_CATALOG.find((q) => q.tier === tier && q.id === id);
}

/**
 * Shortest body that earns points and counts toward the post/comment quests.
 *
 * MIRRORS the ePoints `CONTENT_MIN_LENGTH` - the backend is the source of truth and
 * rejects anything at or below it, silently. This exists so a client can say so in the
 * composer instead of leaving the user to wonder why their reply never counted.
 */
export const QUEST_MIN_CONTENT_LENGTH = 25;

/**
 * The length the backend actually measures. URLs are stripped first, so a reply that is
 * nothing but an image link measures as empty however long it looks. Mirrors the
 * `http(s)://\S+` strip in the ePoints verifier, including the absence of any trimming.
 *
 * Counts code points, not UTF-16 code units, because the backend measures with Python's
 * `len` on a str. `String.length` would score an astral character (most emoji) as 2,
 * so a reply of 13 emoji would look like 26 here and 13 there: the client would promise
 * points the backend then refuses, which is the exact confusion this is meant to end.
 */
export function measureQuestContentLength(body: string | null | undefined): number {
  return Array.from((body ?? "").replace(/https?:\/\/\S+/g, "")).length;
}

/**
 * Whether a post or comment body is long enough to earn points and quest credit.
 * Strictly greater than the minimum, matching the backend comparison.
 */
export function earnsQuestContentCredit(body: string | null | undefined): boolean {
  return measureQuestContentLength(body) > QUEST_MIN_CONTENT_LENGTH;
}

// Streak Freeze display config. MIRRORS the ePoints constants
// (STREAK_FREEZE_PRICE / STREAK_FREEZE_MAX_OWNED) — the server is the source of truth
// and validates every purchase; these drive the label + button state only, so a drift
// here never over-charges (the buy is priced server-side).
export const STREAK_FREEZE_PRICE = 300;
export const STREAK_FREEZE_MAX_OWNED = 2;
