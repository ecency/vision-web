import type { CurationApp, CurationWindow } from "@ecency/sdk";
import * as ls from "@/utils/local-storage";
import { CURATION_APPS, CURATION_WINDOWS, FILTERS_STORAGE_KEY, SAVED_FILTERS_VERSION, WORD_PRESETS } from "./consts";
import type { QueueFilters, SavedFiltersStore, SavedQueueFilters } from "./types";

/**
 * The refine fields worth carrying between visits. Three are deliberately out:
 *
 * - `sort` keeps its own key, SORT_STORAGE_KEY.
 * - `seed` is session scoped: a stored one would freeze Random forever, and
 *   restoring `sort: random` before the seed exists sends `seed=""`, which the
 *   backend rejects.
 * - `flagged` and `excluded` are moderation lenses, not a lane; `excluded`
 *   lists rows the public feed never serves.
 *
 * `window` was left out at first, because a remembered "under 24 h" also
 * switches off the half and eighth weight tails. Curators asked for it back
 * the first day: resetting it on every reload was the thing they noticed
 * most, and Reset is on screen whenever any filter is on, which is the way
 * back the original reasoning said was missing.
 */
export const SAVED_FILTER_FIELDS = [
  "app",
  "community",
  "newAuthors",
  "recommended",
  "hideCurated",
  "unreviewedOnly",
  "window",
  "minWords",
  "maxWords",
  "hasImages",
  "repMin",
  "repMax",
] as const;

/** Communities the backend accepts, so a restored value cannot 400 the feed. */
const COMMUNITY_RE = /^hive-\d{5,6}$/;

function isBool(value: unknown): value is boolean {
  return typeof value === "boolean";
}

function isRep(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 100;
}

function isWordPreset(value: unknown): value is number {
  return typeof value === "number" && (WORD_PRESETS as readonly number[]).includes(value);
}

/**
 * Narrow one untrusted record. A bad field is dropped on its own, never the
 * whole set: a curator with one stale value keeps the rest of their lane.
 */
export function sanitizeSavedFilters(raw: unknown): SavedQueueFilters {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const input = raw as Record<string, unknown>;
  const out: SavedQueueFilters = {};

  if (typeof input.app === "string" && (CURATION_APPS as readonly string[]).includes(input.app)) {
    out.app = input.app as CurationApp;
  }
  if (typeof input.community === "string" && COMMUNITY_RE.test(input.community)) {
    out.community = input.community;
  }
  if (typeof input.window === "string" && (CURATION_WINDOWS as readonly string[]).includes(input.window)) {
    out.window = input.window as CurationWindow;
  }
  if (isBool(input.newAuthors)) out.newAuthors = input.newAuthors;
  if (isBool(input.recommended)) out.recommended = input.recommended;
  if (isBool(input.hideCurated)) out.hideCurated = input.hideCurated;
  if (isBool(input.unreviewedOnly)) out.unreviewedOnly = input.unreviewedOnly;
  if (isBool(input.hasImages)) out.hasImages = input.hasImages;

  // The two word selects do not clamp each other, so an inverted pair is
  // reachable. It matches nothing on the server, so it is dropped whole
  // rather than persisted as a queue that is always empty.
  const min = isWordPreset(input.minWords) ? input.minWords : null;
  const max = isWordPreset(input.maxWords) ? input.maxWords : null;
  if (!(min != null && max != null && min > max)) {
    if (min != null) out.minWords = min;
    if (max != null) out.maxWords = max;
  }

  // The reputation range is one control, so it restores as a pair or not at all.
  if (isRep(input.repMin) && isRep(input.repMax) && input.repMin <= input.repMax) {
    out.repMin = input.repMin;
    out.repMax = input.repMax;
  }
  return out;
}

/**
 * The account the saved set belongs to. `useActiveUsername` is undefined until
 * the store's own mount effect runs, so the same value the store reads is read
 * here directly; otherwise the first restore would miss and the desk would
 * fetch page one twice.
 */
export function readStoredUsername(): string | null {
  const stored = ls.get("active_user");
  return typeof stored === "string" && stored ? stored : null;
}

/**
 * Version 1 was written while "All windows" was the default, so a stored window
 * there is a choice made against a default that no longer exists. It is dropped
 * so every account opens under 24 h once; the rest of the lane is kept.
 */
function withoutWindow(users: SavedFiltersStore["users"]): SavedFiltersStore["users"] {
  const out: SavedFiltersStore["users"] = {};
  for (const [owner, entry] of Object.entries(users)) {
    const filters = entry?.filters;
    if (!filters || typeof filters !== "object" || Array.isArray(filters)) {
      out[owner] = entry;
      continue;
    }
    const kept = { ...filters };
    delete kept.window;
    out[owner] = { filters: kept };
  }
  return out;
}

function readStore(): SavedFiltersStore {
  const raw = ls.get(FILTERS_STORAGE_KEY);
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { v: SAVED_FILTERS_VERSION, users: {} };
  const store = raw as Partial<SavedFiltersStore>;
  if (store.v !== SAVED_FILTERS_VERSION && store.v !== 1) return { v: SAVED_FILTERS_VERSION, users: {} };
  const users = store.users;
  if (!users || typeof users !== "object" || Array.isArray(users)) {
    return { v: SAVED_FILTERS_VERSION, users: {} };
  }
  const current = users as SavedFiltersStore["users"];
  return { v: SAVED_FILTERS_VERSION, users: store.v === 1 ? withoutWindow(current) : current };
}

export function readSavedFilters(owner: string | null): SavedQueueFilters {
  if (!owner) return {};
  try {
    return sanitizeSavedFilters(readStore().users[owner]?.filters);
  } catch {
    // Storage may be unavailable; the desk simply opens on the defaults.
    return {};
  }
}

/**
 * Only the fields that differ from the role's own defaults are stored, so the
 * `unreviewedOnly: null` sentinel survives as an absent key. A member later
 * added to the roster therefore still resolves the roster defaults instead of
 * a value frozen from when they were not on it.
 */
export function pickSavedFilters(
  filters: QueueFilters,
  defaults: QueueFilters,
  isRoster: boolean
): SavedQueueFilters {
  const out: SavedQueueFilters = {};
  for (const key of SAVED_FILTER_FIELDS) {
    if (key === "unreviewedOnly") continue;
    const value = filters[key];
    if (value !== defaults[key] && value != null) {
      (out as Record<string, unknown>)[key] = value;
    }
  }
  // `unreviewedOnly` is nullable and resolves from the role, so it is compared
  // the way resolveFilters and countActiveFilters compare it. Toggling the chip
  // off and on again lands on `true`, which is the roster default: without this
  // the desk would report a saved filter that nothing else counts.
  const resolved = filters.unreviewedOnly ?? isRoster;
  if (resolved !== (defaults.unreviewedOnly ?? isRoster)) out.unreviewedOnly = resolved;
  // The range is one filter in the badge and in Reset, so it is one here too.
  if (out.repMin != null || out.repMax != null) {
    out.repMin = filters.repMin;
    out.repMax = filters.repMax;
  }
  return out;
}

/** Writes the account's set, and removes the entry (and the key) when empty. */
export function saveFilters(owner: string | null, filters: SavedQueueFilters): void {
  if (!owner) return;
  try {
    const store = readStore();
    if (Object.keys(filters).length === 0) {
      if (!store.users[owner]) return;
      delete store.users[owner];
      if (Object.keys(store.users).length === 0) ls.remove(FILTERS_STORAGE_KEY);
      else ls.set(FILTERS_STORAGE_KEY, store);
      return;
    }
    store.users[owner] = { filters };
    ls.set(FILTERS_STORAGE_KEY, store);
  } catch {
    // Quota or private mode: the choice still applies for this visit.
  }
}
