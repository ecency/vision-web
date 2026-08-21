import { AiToolsMeta } from "./operations/metadata";

export interface EntryBeneficiaryRoute {
  account: string;
  weight: number;
}

export interface EntryVote {
  voter: string;
  rshares: number;
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
  // Publisher-supplied thumbnail (3Speak, Liketu). Preferred over `image` when a
  // card picks its thumbnail, since it is published for exactly that purpose.
  thumbnails?: string[];
  pinned_reply?: string; // author/permlink
  location?: { coordinates: { lat: number; lng: number }; address?: string };
  ai_tools?: AiToolsMeta;
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
  active_votes: EntryVote[];
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
  // Post-level upvote count. The waves private-api feeds return this but no
  // active_votes, so it is the vote-count source for those feeds.
  net_votes?: number;
  // Tip totals from the waves feed (esync), so a feed card can show a tip count
  // and an already-tipped state without a per-item /post-tips call. `tip_count`
  // is the number of tips the post received; `tipped_by_viewer` is true when the
  // requesting `observer` has already tipped it (present only on observer feeds).
  tip_count?: number;
  tipped_by_viewer?: boolean;
  parent_author?: string;
  parent_permlink?: string;
  root_author?: string;
  root_permlink?: string;
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
  /**
   * Present only on feed rows that went through the slim step
   * (`core/entries/slim-entry.ts`): the body is `""` and everything a card needs
   * has been derived into `json_metadata`. `ext_link` carries the one body fact
   * the SDK's moderation rules still need. Absent on full entries. `lang` is
   * the server-detected content language of the card summary (ISO-639-1, or
   * null when too short / undetermined); absent when the row was fetched by
   * the browser, which then detects on its own (core/entries/language-hint.ts).
   */
  slim?: { ext_link: boolean; lang?: string | null };
}

export interface EntryHeader {
  author: string;
  category: string;
  permlink: string;
  depth: number;
}

export interface EntryGroup {
  // filter(arg0: (entry: any) => boolean): EntryGroup;
  entries: Entry[];
  error: string | null;
  sid: string; //scroll_id for controversial/rising results
  loading: boolean;
  hasMore: boolean;
}

export interface Entries extends Record<string, EntryGroup> {}
