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

export const CURATION_WINDOWS = ["12h", "full", "half", "eighth", "locked", "all"] as const;
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
  /** Whole percents (0-100) as the signals service sends them, never a 0-1 fraction. */
  formulaic?: number | null;
  images?: { hive_hosted?: number; external?: number; total?: number } | null;
  engagement?: { replies_per_day?: number | null } | null;
  /** `n` is how many of the author's own past posts the baseline holds, `driver` the feature that moved most. */
  style?: { alert?: boolean; sigma?: number | null; driver?: string; n?: number } | null;
  /**
   * The detector's read of the post's FIRST image, which is the one rendered as the
   * thumbnail. `over` is the only field to act on; `score` and `classes` are for tuning.
   * A null score means unknown (no image, or the check could not run), never "clean".
   */
  nsfw?: {
    score?: number | null;
    class?: string | null;
    over?: boolean;
    classes?: string[];
    note?: string;
  } | null;
  [key: string]: unknown;
}

export interface CurationFlags {
  low_rep?: boolean;
  /** The author's reputation has gone negative, which is not the same line as low_rep. */
  negative_rep?: boolean;
  ignorelist?: boolean;
  abuser?: boolean;
  spaminator?: boolean;
  blocked_tag?: boolean;
  /** The post carries Hive's own `nsfw` tag. */
  nsfw?: boolean;
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

/**
 * The narrowing facets a curator was working when they made a mark. Empty means
 * the whole queue. The keys are the roster feed's own params, so a value here has
 * already been through the allow lists the query runs on.
 */
export type CurationLane = Partial<{
  /** Present only when it is not the queue order, under which alone a position is a watermark. */
  sort: CurationSort;
  view: string;
  app: CurationApp;
  community: string;
  window: CurationWindow;
  rep_min: number;
  rep_max: number;
  min_words: number;
  max_words: number;
  has_images: boolean;
  new_authors: boolean;
  recommended: boolean;
  flagged: boolean;
  hide_curated: boolean;
  hide_reviewed: boolean;
  hide_snoozed: boolean;
}>;

/**
 * How far one curator has got, derived from their marks so nobody types it. This
 * is the hand-off curators used to post in Discord.
 *
 * `reviewed_to` is a progress claim rather than a contiguous reviewed prefix: a
 * mark is any of the four states and marks are not made in queue order. It is
 * read, never used to aim anything. `lane` travels with the mark that set the
 * position, so the two always describe the same moment. Roster-only: the public
 * payloads carry no per-curator activity at all.
 */
export interface CurationHandoffEntry {
  username: string;
  reviewed_to: string | null;
  reviewed_to_post_id: number | null;
  last_mark_at: string;
  /** Absent for a trial viewer looking at somebody else. */
  marks_24h?: number;
  /**
   * Null is UNKNOWN: a mark from before the desk sent lanes, or one that said
   * nothing. It is never the whole queue, which is `{}`. Absent until the
   * backend that records it is deployed.
   */
  lane?: CurationLane | null;
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
  /** Roster only, and absent until the backend that derives it is deployed. */
  handoff?: CurationHandoffEntry[];
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
  /**
   * The application window, carried on status so no page needs a second call to
   * find out whether it may invite anyone. Older desks do not send it.
   */
  applications?: CurationApplicationWindow;
  mana_spent_today: CurationManaSpent | null;
  vp: CurationVp | null;
  head_lag_seconds: number;
  reco_lag_blocks: number | null;
  feed_version: string | null;
  latest_post_id: number | null;
  worker_tick_age_seconds: number | null;
}

/**
 * The per-curator conditions erobot applies before trailing a vote. The three
 * weights are Hive vote weights (100 = 1%); `trail` overrides the per-role
 * default, and is what `config.followAccounts` used to be.
 */
export interface CurationRosterRules {
  min_weight?: number;
  max_weight?: number;
  waves_only_below?: number;
  trail?: boolean;
}

export interface CurationRosterEntry {
  username: string;
  role: CurationRole;
  active: boolean;
  rules?: CurationRosterRules | null;
  /** Resolved by the backend, so no client re-implements the per-role default. */
  trail?: boolean;
}

/**
 * The admin view of a row. These fields are private, so they arrive from the
 * roster-list POST and never from the edge-cached roster GET.
 */
export interface CurationRosterAdminEntry extends CurationRosterEntry {
  added_by: string | null;
  added_at: string | null;
  removed_at: string | null;
  note: string | null;
  /** When a guest seat runs out. Null means permanent, which every hand-set seat is. */
  term_ends?: string | null;
}

export interface CurationRoster {
  curators: CurationRosterEntry[];
  updated_at: string;
}

export interface CurationRosterAdminList {
  curators: CurationRosterAdminEntry[];
}

/** Open or closed, with the line shown to a reader while it is closed. */
export interface CurationApplicationWindow {
  open: boolean;
  message: string | null;
  /** Only the admin routes return this; status carries the two fields above. */
  updated_at?: string | null;
}

export type CurationApplicationState =
  | "open"
  | "shortlisted"
  | "accepted"
  | "declined"
  | "withdrawn";

/** The three questions the apply form asks, as the desk stores them. */
export interface CurationApplicationAnswers {
  motivation: string;
  availability: string;
  pick: string;
}

/** What an applicant sees of their own application. */
export interface CurationApplication {
  id: number;
  username: string;
  answers: CurationApplicationAnswers;
  state: CurationApplicationState;
  created: string;
  updated_at: string;
  decided_at: string | null;
}

/**
 * How a reviewer answered. An objection stops the automatic grant; it never declines,
 * and `abstain` is how a stop is lifted without turning into a vote in favour.
 */
export type CurationApplicationVoteValue = "endorse" | "object" | "abstain";

/** One reviewer's line on one application. Private to the review queue. */
export interface CurationApplicationVote {
  voter: string;
  vote: CurationApplicationVoteValue;
  note: string | null;
  created: string;
  updated_at: string;
  /**
   * Whether that voter is still on the bench. A vote from somebody since retired or
   * demoted stops counting toward the quorum, and the desk sends the line anyway so a
   * total one short has a visible reason.
   */
  standing: boolean;
}

export interface CurationApplicationTally {
  endorsed: number;
  objected: number;
}

/**
 * The reviewer's view. `snapshot` is the applicant's recommendation record as it
 * stood when they applied, frozen because the live record keeps moving.
 */
export interface CurationApplicationAdminEntry extends CurationApplication {
  snapshot: CurationRecommenderStats | null;
  decided_by: string | null;
  admin_note: string | null;
  votes: CurationApplicationVote[];
  tally: CurationApplicationTally;
  /** This viewer's own line, so the queue does not walk the list to find it. */
  my_vote: CurationApplicationVoteValue | null;
}

export interface CurationApplicationMine {
  application: CurationApplication | null;
  window: CurationApplicationWindow;
  /** The viewer's roster role, so the page can say "you are already a curator". */
  role: CurationRole | null;
}

export interface CurationApplicationList {
  applications: CurationApplicationAdminEntry[];
  counts: Partial<Record<CurationApplicationState, number>>;
  window: CurationApplicationWindow;
  /** Endorsements that grant a seat, and how long that seat lasts. Never public. */
  quorum: number;
  term_days: number;
}

export interface CurationApplicationVoteInput {
  applicant: string;
  vote: CurationApplicationVoteValue;
  note?: string;
}

export interface CurationApplicationVoteResult {
  application: CurationApplicationAdminEntry;
  votes: CurationApplicationVote[];
  tally: CurationApplicationTally;
  quorum: number;
  /** True when this vote reached the quorum and the seat was granted. */
  elected: boolean;
}

export interface CurationApplicationDecideInput {
  applicant: string;
  /** Only the three a reviewer may set; `open` and `withdrawn` are not decisions. */
  state: "shortlisted" | "accepted" | "declined";
  /** Accepting only. Defaults to `curator` upstream, which IS trailed, with a term. */
  role?: Extract<CurationRole, "curator" | "mod">;
  note?: string;
}

export interface CurationRosterSetInput {
  curator: string;
  role: CurationRole;
  rules?: CurationRosterRules;
  note?: string;
  /**
   * Tri-state upstream: leave it out to KEEP the seat's term, 0 to make the seat
   * permanent, n to restart the clock. Leaving it out is deliberately not "make
   * permanent", so editing a note cannot quietly turn a guest seat into a standing one.
   */
  term_days?: number;
}

export interface CurationRecommender {
  username: string;
  rep: number | null;
  reason: CurationReason | null;
  at: string;
  has_meta: boolean;
  is_self?: boolean;
  /**
   * Ordering weight of this recommender, 0.5 to 1.5 with 1.0 neutral. Above
   * 1.0 means curators curated their picks more often than they dismissed
   * them over the window. It changes ordering only, never what is shown.
   */
  precision?: number;
  /** At least 10 recommendations and a precision of 1.2 or more. */
  trusted?: boolean;
}

/**
 * Route 14: one recommender's 90-day scorecard. An unknown username answers
 * zeros with a neutral precision and `trusted: false`, never a 404, so a name
 * that never recommended anything is not an error state.
 */
export interface CurationRecommenderStats {
  username: string;
  window_days: number;
  recommended: number;
  curated: number;
  dismissed: number;
  withdrawn: number;
  precision: number;
  trusted: boolean;
  computed_at: string | null;
}

export type CurationReasonsHistogram = Partial<Record<CurationReason, number>>;

export interface CurationRecommendationItem {
  author: string;
  permlink: string;
  title: string;
  created: string;
  /**
   * The post's cover, the same column the feed row carries. Optional because a
   * desk older than the field answers without it; absent and null both mean no
   * cover, and the caller proxifies before rendering.
   */
  first_image?: string | null;
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
    /**
     * Rows whose curation state moved since the client's own `generated_at`.
     * The overlay carries no state, so without these a page the client keeps
     * holding would render a curated post as open and votable. Optional: a
     * backend that predates it simply sends nothing.
     */
    rows?: Array<
      Pick<CurationRow, "post_id" | "state" | "trailed_by" | "voted_by" | "unvoted_at">
    >;
  };
  team_cursor: CurationTeamCursor;
  active_curators: CurationActiveCurator[];
  /** Roster only, and absent until the backend that derives it is deployed. */
  handoff?: CurationHandoffEntry[];
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
  /**
   * The feed params the desk was showing when it made this mark. The hand-off
   * reads a position and its lane off the same mark, so a desk with two tabs on
   * different filters stamps each mark with its own. Paging keys are dropped by
   * the gateway; absent means the lane is unknown, never the whole queue.
   */
  lane?: CurationRosterFeedParams;
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
