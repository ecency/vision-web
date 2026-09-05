/**
 * Curation desk types.
 *
 * Shapes mirror the desk routes behind `/private-api/curation-desk/*`. Public
 * rows carry no curator identity; the roster feed and the tick add an `overlay`
 * with marks, signals and flags. The window state (full, half, eighth, locked,
 * paid) is never in a payload: clients derive it from `created` and `payout_at`.
 */

export const CURATION_REASONS = ["quality", "underrated", "newcomer", "other"] as const;
export type CurationReason = (typeof CURATION_REASONS)[number];

export const CURATION_SORTS = ["queue", "newest", "unique", "random"] as const;
export type CurationSort = (typeof CURATION_SORTS)[number];

export const CURATION_VIEWS = [
  "queue",
  "latest",
  "new-authors",
  "recommended",
  "curated",
  "all",
  "excluded",
] as const;
export type CurationView = (typeof CURATION_VIEWS)[number];

export const CURATION_APPS = ["all", "ecency", "peakd", "other"] as const;
export type CurationApp = (typeof CURATION_APPS)[number];

export const CURATION_WINDOWS = ["full", "half", "eighth", "locked", "all"] as const;
export type CurationWindow = (typeof CURATION_WINDOWS)[number];

export const CURATION_MARK_STATES = ["reviewed", "snoozed", "flagged", "noted"] as const;
export type CurationMarkState = (typeof CURATION_MARK_STATES)[number];

export const CURATION_FLAG_REASONS = [
  "plagiarism",
  "ai_slop",
  "recycled",
  "image_only",
  "tag_abuse",
  "farming",
  "nsfw_untagged",
  "other",
] as const;
export type CurationFlagReason = (typeof CURATION_FLAG_REASONS)[number];

export type CurationRole = "admin" | "mod" | "curator" | "trial";

/** Filters shared by the public feed (query params) and the roster feed (body). */
export interface CurationFeedParams {
  sort?: CurationSort;
  view?: CurationView;
  app?: CurationApp;
  community?: string;
  window?: CurationWindow;
  rep_min?: number;
  rep_max?: number;
  min_words?: number;
  max_words?: number;
  has_images?: boolean;
  new_authors?: boolean;
  recommended?: boolean;
  hide_curated?: boolean;
  limit?: number;
}

/** Roster-only additions: the random seed and the team-mark predicates. */
export interface CurationRosterFeedParams extends CurationFeedParams {
  seed?: string;
  flagged?: boolean;
  hide_reviewed?: boolean;
  hide_snoozed?: boolean;
}

export interface CurationTrailedBy {
  curator: string;
  at: string;
  weight: number;
  source: "erobot_push" | "history" | "inferred" | string;
  confirmed: boolean;
}

export interface CurationVotedBy {
  voter: string;
  weight: number;
  at: string;
}

/** Public row (route 1, 4 rows are narrower, route 5 adds recommenders). */
export interface CurationRow {
  post_id: number;
  author: string;
  permlink: string;
  title: string;
  created: string;
  app: string | null;
  is_ecency: boolean;
  community: string | null;
  community_title: string | null;
  tags: string[];
  rep: number | null;
  is_new_author: boolean;
  author_post_count: number | null;
  author_created?: string | null;
  word_count: number | null;
  image_count: number;
  first_image: string | null;
  summary: string | null;
  edited_at: string | null;
  edit_count: number;
  votes: number | null;
  pending_payout: number | null;
  pending_payout_est?: number | null;
  payout_at: string | null;
  is_declined?: boolean | null;
  is_gray?: boolean | null;
  rshares_total?: number | null;
  rshares_after_24h?: number | null;
  /** 0 open, 1 curated, 2 dropped */
  state: number;
  trailed_by: CurationTrailedBy | null;
  voted_by: CurationVotedBy[];
  author_trailed_at: string | null;
  /** Set on the hivewatchers unvote path. */
  unvoted_at?: string | null;
  /** Materialization time; with `created` it tells a late row. */
  inserted_at?: string | null;
  recommend_count: number;
  unique_recommenders: number;
  reco_no_meta_count: number;
  /** Opaque keyset cursor for the page that follows this row. */
  _cursor?: string;
}

export interface CurationMark {
  curator: string;
  state: CurationMarkState;
  reason?: string | null;
  note?: string | null;
  /**
   * Whether a note body exists. Tick deltas carry this instead of the body,
   * so a delta must never overwrite a note the client already holds.
   */
  has_note?: boolean;
  snooze_until?: string | null;
  updated_at: string;
}

export interface CurationSignals {
  formulaic?: number | null;
  images?: { on_hive?: number; total?: number } | null;
  engagement?: { replies_per_day?: number | null } | null;
  style?: { alert?: boolean; sigma?: number; feature?: string; sample?: number } | null;
  [key: string]: unknown;
}

export interface CurationFlags {
  low_rep?: boolean;
  ignorelist?: boolean;
  abuser?: boolean;
  spaminator?: boolean;
  blocked_tag?: boolean;
  patch_body?: boolean;
  deleted?: boolean;
  hivewatchers_downvote?: boolean;
  [key: string]: unknown;
}

/** Roster-only overlay shipped inline with the roster feed and in tick deltas. */
export interface CurationOverlay {
  signals: CurationSignals | null;
  flags: CurationFlags;
  excluded_reason: string | null;
  team_mark: CurationMarkState | null;
  team_mark_by: string | null;
  team_snooze_until?: string | null;
  resurfaced_at: string | null;
  /** Set when the roster dismissed the recommendations of this post. */
  reco_dismissed_at?: string | null;
  marks: CurationMark[];
  notes_count: number;
}

export type CurationRosterRow = CurationRow & { overlay: CurationOverlay | null };

export interface CurationTeamCursor {
  post_id: number | null;
  created: string | null;
  set_by?: string;
  set_at?: string;
}

export interface CurationActiveCurator {
  username: string;
  last_action_at: string;
}

export interface CurationFeedPage {
  items: CurationRow[];
  next_cursor: string | null;
  team_cursor: CurationTeamCursor;
  head_lag_seconds: number;
  feed_version: string | null;
  generated_at: string;
}

export interface CurationRosterFeedPage {
  items: CurationRosterRow[];
  next_cursor: string | null;
  team_cursor: CurationTeamCursor;
  active_curators: CurationActiveCurator[];
  facets: { communities: Array<{ community: string; title?: string | null; count?: number }> };
  total_estimate: number | null;
  head_lag_seconds: number;
  generated_at: string;
}

export interface CurationManaSpent {
  equiv: number;
  trail: number;
  other: number;
  crosscheck: number | null;
  since: string;
}

export interface CurationVp {
  account: string;
  percent: number;
  live_percent: number;
  implied_weight: number;
  at: string;
  sustainable_votes_per_day: number;
  regen_votes_per_hour: number;
  reward_fund?: {
    recent_claims: string | number;
    reward_balance: number;
    median_price: number;
    at: string;
  } | null;
}

export interface CurationStatus {
  team_cursor: CurationTeamCursor;
  behind_seconds: number | null;
  counts: {
    unreviewed: number;
    curated_24h: number;
    trail_votes_today: { posts: number; comments: number };
    recommended_posts: number;
  };
  mana_spent_today: CurationManaSpent | null;
  vp: CurationVp | null;
  head_lag_seconds: number;
  reco_lag_blocks: number | null;
  feed_version: string | null;
  latest_post_id: number | null;
  worker_tick_age_seconds: number | null;
}

export interface CurationRosterEntry {
  username: string;
  role: CurationRole;
  active: boolean;
  rules?: Record<string, unknown> | null;
}

export interface CurationRoster {
  curators: CurationRosterEntry[];
  updated_at: string;
}

export interface CurationRecommender {
  username: string;
  rep: number | null;
  reason: CurationReason | null;
  at: string;
  has_meta: boolean;
  is_self?: boolean;
}

export type CurationReasonsHistogram = Partial<Record<CurationReason, number>>;

export interface CurationRecommendationItem {
  author: string;
  permlink: string;
  title: string;
  created: string;
  recommend_count: number;
  unique_recommenders: number;
  no_meta_count: number;
  reasons: CurationReasonsHistogram;
  recommenders: CurationRecommender[];
  _cursor?: string;
}

export interface CurationRecommendationsPage {
  items: CurationRecommendationItem[];
  next_cursor: string | null;
}

export type CurationRecommendationsSort = "unique" | "newest";

export interface CurationRecommendationsParams {
  sort?: CurationRecommendationsSort;
  limit?: number;
}

/** Route 5: the public row plus the recommender list, self row included. */
export interface CurationPost extends CurationRow {
  recommenders: CurationRecommender[];
  no_meta_count: number;
  reasons: CurationReasonsHistogram;
}

export interface CurationTickRequest {
  /** `generated_at` echoed verbatim from the previous response. */
  since: string | null;
  /** Loaded rows that have no overlay yet (at most 100). */
  need: number[];
  /** Visible rows (at most 100). */
  visible: number[];
}

/**
 * Tick answer. `truncated` says the delta window was too wide to answer in
 * full; it only means something when the request carried a `since`, since a
 * first tick with `since: null` asks for a snapshot, not a window.
 */
export interface CurationTickResponse {
  overlay: Array<{ post_id: number } & CurationOverlay>;
  deltas: {
    marks: Array<{ post_id: number } & CurationMark>;
    flags: Array<{ post_id: number; flags: CurationFlags; excluded_reason: string | null }>;
    signals: Array<{ post_id: number; signals: CurationSignals | null }>;
  };
  team_cursor: CurationTeamCursor;
  active_curators: CurationActiveCurator[];
  trail_alerts: unknown[];
  generated_at: string;
  truncated: boolean;
}

export interface CurationMarkInput {
  author: string;
  permlink: string;
  state: CurationMarkState;
  reason?: string;
  note?: string;
  snooze_until?: string;
}

export interface CurationMarkResponse {
  mark: CurationMark | null;
  row: CurationRosterRow;
}

export interface CurationMarkClearResponse {
  ok: boolean;
  row: CurationRosterRow;
}

export interface CurationMyMarksParams {
  state?: CurationMarkState;
  cursor?: string;
  limit?: number;
}

export interface CurationMyMark extends CurationMark {
  post_id: number;
  author: string;
  permlink: string;
  title: string;
  created: string;
  row?: CurationRosterRow | null;
}

export interface CurationMyMarksResponse {
  items: CurationMyMark[];
  next_cursor: string | null;
}

export type CurationCursorAction = "advance" | "rewind";

export interface CurationCursorInput {
  post_id: number;
  action: CurationCursorAction;
  reason?: string;
}

export interface CurationCursorResponse {
  team_cursor: CurationTeamCursor;
  moved: boolean;
  swept_count: number | null;
}

export type CurationUaClass = "web" | "mobile";

export interface CurationRecommendMetaInput {
  author: string;
  permlink: string;
  /** 40 hex chars when the broadcast path returned one; omitted otherwise. */
  trx_id?: string | null;
  ua_class: CurationUaClass;
}

export type CurationDismissAction = "dismiss" | "restore";

export interface CurationDismissRecoInput {
  author: string;
  permlink: string;
  action: CurationDismissAction;
}

export interface CurationDismissRecoResponse {
  row: CurationRosterRow;
}
