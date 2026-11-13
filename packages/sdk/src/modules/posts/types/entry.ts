export interface EntryBeneficiaryRoute {
  account: string;
  weight: number;
}

export interface EntryVote {
  voter: string;
  rshares: number;
}

/**
 * One account's vote on an entry, as bridge v2 `observer_vote` reports it.
 * `percent` is the vote weight in basis points (10000 = 100%, negative for a
 * downvote); null when the source did not say (a v1 bridge `active_votes` row
 * carries only rshares). Percent 0 is a removed vote: the account voted, then
 * set the weight to 0. Hivemind keeps that row and still counts it in
 * `stats.total_votes`, so it is kept, but it is not a cast vote. Test "has
 * voted" with `isCastVote`, never by null checks.
 */
export interface ObserverVote {
  /**
   * Null for a vote this client just cast: the node computes rshares only
   * once the vote is in a block, so an optimistic vote never invents them.
   */
  rshares: number | null;
  percent: number | null;
}

/**
 * A row of `top_votes`: from bridge v2 when requested, or derived from a v1
 * voter list by `normalizeEntry` (percent null when the row had none).
 */
export interface EntryTopVote {
  voter: string;
  rshares: number;
  percent: number | null;
}

export interface EntryStat {
  flag_weight: number;
  gray: boolean;
  hide: boolean;
  total_votes: number;
  is_pinned?: boolean;
}

export interface JsonMetadata {
  tags?: string[];
  description?: string | null;
  app?: any;
  canonical_url?: string;
  format?: string;
  original_author?: string;
  original_permlink?: string;
  image?: string[];
  pinned_reply?: string; // author/permlink
  location?: { coordinates: { lat: number; lng: number }; address?: string };
}

export interface JsonPollMetadata {
  content_type: "poll";
  version: number;
  question: string;
  choices: string[];
  preferred_interpretation: string;
  token: string;
  vote_change: boolean;
  hide_votes: boolean;
  filters: { account_age: number };
  end_time: number;
  max_choices_voted?: number;
}

export interface Entry {
  last_update?: string;
  // No `active_votes`: entries carry no voter list (bridge v2; removed from
  // every other source by normalizeEntry). Count with `stats.total_votes`,
  // read a user's own vote with `entryVoteOf` / `getEntryVoteQueryOptions`,
  // and load the full list on demand with `getEntryActiveVotesQueryOptions`.
  /**
   * Vote of the account in `observer_vote_for`: the vote; a percent-0 row when
   * that account voted, then removed the vote (not cast, see `isCastVote`);
   * or null when it never voted. Meaningless when `observer_vote_for` is null.
   */
  observer_vote?: ObserverVote | null;
  /**
   * The account `observer_vote` belongs to; null when unknown (see the
   * `normalizeEntry` contract). Never show the vote as another user's.
   */
  observer_vote_for?: string | null;
  /** Bridge v2 `top_votes`, when the read asked for them. */
  top_votes?: EntryTopVote[];
  author: string;
  author_payout_value: string;
  author_reputation: number;
  author_role?: string;
  author_title?: string;
  beneficiaries: EntryBeneficiaryRoute[];
  blacklists: string[];
  body: string;
  category: string;
  children: number;
  community?: string;
  community_title?: string;
  created: string;
  total_votes?: number;
  curator_payout_value: string;
  depth: number;
  is_paidout: boolean;
  json_metadata: JsonMetadata | null;
  max_accepted_payout: string;
  net_rshares: number;
  // Post-level upvote count. The waves private-api feeds (esync) return this but
  // no active_votes, so it is the vote-count source for those feeds.
  net_votes?: number;
  // Tip totals from the waves feed (esync), so a feed card can show a tip count
  // and an already-tipped state without a per-item /post-tips call. `tip_count`
  // is the number of tips the post received; `tipped_by_viewer` is true when the
  // requesting `observer` has already tipped it (present only on observer feeds).
  tip_count?: number;
  tipped_by_viewer?: boolean;
  parent_author?: string;
  parent_permlink?: string;
  payout: number;
  payout_at: string;
  pending_payout_value: string;
  percent_hbd: number;
  permlink: string;
  post_id: any;
  id?: number;
  num?: number;
  promoted: string;
  reblogs?: number;
  reblogged_by?: string[] | any;
  replies: any[];
  stats: EntryStat | null;
  title: string;
  updated: string;
  url: string;
  original_entry?: Entry;
  is_optimistic?: boolean;
}

export interface EntryHeader {
  author: string;
  category: string;
  permlink: string;
  depth: number;
}

/**
 * One vote in a voter list (`getEntryVotes`). `reputation` is absent on rows
 * read through `database_api.list_votes` (nodes without bridge.list_votes).
 */
export interface Vote {
  percent: number;
  reputation?: number;
  rshares: string | number;
  time: string;
  timestamp?: number;
  voter: string;
  weight: number;
}
