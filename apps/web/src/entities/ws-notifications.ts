// Web socket notification _types
import { NotificationFilter } from "@/enums";

interface BaseWsNotification {
  source: string;
  target: string;
  timestamp: string;
}

export interface WsVoteNotification extends BaseWsNotification {
  type: "vote";
  extra: {
    permlink: string;
    weight: number;
    title: string | null;
    img_url: string | null;
  };
}

export interface WsMentionNotification extends BaseWsNotification {
  type: "mention";
  extra: {
    permlink: string;
    is_post: 0 | 1;
    title: string | null;
    img_url: string | null;
  };
}

export interface WsFavoriteNotification extends BaseWsNotification {
  type: "favorites";
  extra: {
    permlink: string;
    is_post: 0 | 1;
    title: string | null;
  };
}

export interface WsBookmarkNotification extends BaseWsNotification {
  type: "bookmarks";
  extra: {
    permlink: string;
    is_post: 0 | 1;
    title: string | null;
  };
}

export interface WsFollowNotification extends BaseWsNotification {
  // The websocket carries the whole follow family, not just "follow": enotify's
  // str_activity_type() emits unfollow / ignore / blacklist too, and they all share
  // ACTIVITY_MAIN_TYPE_FOLLOW. Narrowing this to "follow" is what left the other three
  // without a body, a link or a toggle mapping.
  type: "follow" | "unfollow" | "ignore" | "blacklist";
  extra: {
    what: string[];
  };
}

export interface WsReplyNotification extends BaseWsNotification {
  type: "reply";
  extra: {
    title: string;
    body: string;
    json_metadata: string;
    permlink: string;
    parent_author: string;
    parent_permlink: string;
    parent_title: string | null;
    parent_img_url: string | null;
  };
}

export interface WsReblogNotification extends BaseWsNotification {
  type: "reblog";
  extra: {
    permlink: string;
    title: string | null;
    img_url: string | null;
  };
}

export interface WsTransferNotification extends BaseWsNotification {
  type: "transfer";
  extra: {
    amount: string;
    memo: string;
  };
}

export interface WsDelegationsNotification extends BaseWsNotification {
  type: "delegations";
  extra: {
    amount: string;
  };
}

export interface WsCheckinsNotification extends BaseWsNotification {
  type: "checkins";
  extra?: {
    count?: number;
  };
}

export interface WsCheckinNotification extends BaseWsNotification {
  type: "checkin";
  extra?: {
    count?: number;
  };
}

export interface WsPayoutsNotification extends BaseWsNotification {
  type: "payouts";
  extra?: {
    amount?: string;
    amount_usd?: string;
    title?: string | null;
    permlink?: string;
    // Image of the post that paid out.
    img_url?: string | null;
  };
}

export interface WsMonthlyPostsNotification extends BaseWsNotification {
  type: "monthly-posts";
  extra?: {
    count?: number;
    title?: string | null;
  };
}

export interface WsMonthlyPostsUnderscoreNotification extends BaseWsNotification {
  type: "monthly_posts";
  extra?: {
    count?: number;
    title?: string | null;
  };
}

export interface WsSpinNotification extends BaseWsNotification {
  type: "spin";
}

export interface WsInactiveNotification extends BaseWsNotification {
  type: "inactive";
}

export interface WsReferralNotification extends BaseWsNotification {
  type: "referral";
}

export interface WsWeeklyEarningsNotification extends BaseWsNotification {
  type: "weekly_earnings";
  extra?: {
    total_usd?: string;
    author_usd?: string;
    curation_usd?: string;
  };
}

export interface WsAccountUpdateNotification extends BaseWsNotification {
  type: "account_update";
  extra?: {
    keys_changed?: string[];
    accounts_granted?: { authority: string; account: string }[];
  };
}

export interface WsScheduledPublishedNotification extends BaseWsNotification {
  type: "scheduled_published";
  extra: {
    permlink: string;
    title: string | null;
    img_url?: string | null;
  };
}

/**
 * A post carrying a hashtag the user follows (enotify `tags`, main type 23).
 * Two shapes share the type, told apart by `permlink` (a single post, whose
 * author is `source`) versus `count` (an hourly bundle for a busy tag, sent
 * with `source` "ecency"). A post carries every followed tag it matched in
 * `tags`, normalised (lowercase, no `#`); the first is the one to show. A
 * bundle names its one tag in `tag`.
 */
export interface WsTagsPostExtra {
  author: string;
  tags: string[];
  permlink: string;
  title: string | null;
  img_url: string | null;
  tag?: undefined;
  count?: undefined;
}

export interface WsTagsBundleExtra {
  tag: string;
  count: number;
  author?: undefined;
  tags?: undefined;
  permlink?: undefined;
  title?: undefined;
  img_url?: undefined;
}

export interface WsTagsNotification extends BaseWsNotification {
  type: "tags";
  extra: WsTagsPostExtra | WsTagsBundleExtra;
}

export type WsNotification =
  | WsVoteNotification
  | WsMentionNotification
  | WsFavoriteNotification
  | WsBookmarkNotification
  | WsFollowNotification
  | WsReplyNotification
  | WsReblogNotification
  | WsTransferNotification
  | WsSpinNotification
  | WsInactiveNotification
  | WsReferralNotification
  | WsDelegationsNotification
  | WsCheckinNotification
  | WsCheckinsNotification
  | WsPayoutsNotification
  | WsMonthlyPostsNotification
  | WsMonthlyPostsUnderscoreNotification
  | WsWeeklyEarningsNotification
  | WsAccountUpdateNotification
  | WsScheduledPublishedNotification
  | WsTagsNotification;

// HTTP api notification _types

interface BaseAPiNotification {
  id: string;
  source: string;
  read: 0 | 1;
  timestamp: string; // iso formatted date
  ts: number; // unix timestamp
  gk: string; // group key
  gkf: boolean; // group key flag. true when a new group started
}

export interface ApiVoteNotification extends BaseAPiNotification {
  type: "vote" | "unvote";
  voter: string;
  weight: number;
  author: string;
  permlink: string;
  title: string | null;
  img_url: string | null;
}

export interface ApiMentionNotification extends BaseAPiNotification {
  type: "mention";
  author: string;
  account: string;
  permlink: string;
  post: boolean;
  title: string | null;
  img_url: string | null;
}

export interface ApiFollowNotification extends BaseAPiNotification {
  type: "follow" | "unfollow" | "ignore" | "blacklist";
  follower: string;
  following: string;
  blog: boolean;
}

export interface ApiReblogNotification extends BaseAPiNotification {
  type: "reblog";
  account: string;
  author: string;
  permlink: string;
  title: string | null;
  img_url: string | null;
}

export interface ApiReplyNotification extends BaseAPiNotification {
  type: "reply";
  author: string;
  permlink: string;
  title: string;
  body: string;
  json_metadata: string;
  metadata: any;
  parent_author: string;
  parent_permlink: string;
  parent_title: string | null;
  parent_img_url: string | null;
}

export interface ApiTransferNotification extends BaseAPiNotification {
  type: "transfer";
  to: string;
  amount: string;
  memo: string | null;
}

export interface ApiFavoriteNotification extends BaseAPiNotification {
  type: "favorites";
  author: string;
  account: string;
  permlink: string;
  post: boolean;
  title: string | null;
  // Image of the newly published post. Optional so this stays structurally
  // compatible with the published @ecency/sdk types, which do not declare it yet.
  img_url?: string | null;
}

export interface ApiBookmarkNotification extends BaseAPiNotification {
  type: "bookmarks";
  author: string;
  account: string;
  permlink: string;
  post: boolean;
  title: string | null;
  // Image of the bookmarked post that was commented on, not of the comment.
  // Optional so this stays structurally compatible with the published
  // @ecency/sdk types, which do not declare it yet.
  parent_img_url?: string | null;
}

export interface ApiSpinNotification extends BaseAPiNotification {
  type: "spin";
}

export interface ApiInactiveNotification extends BaseAPiNotification {
  type: "inactive";
}

export interface ApiReferralNotification extends BaseAPiNotification {
  type: "referral";
}

export interface ApiDelegationsNotification extends BaseAPiNotification {
  type: "delegations";
  to: string;
  amount: string;
}

export interface ApiCheckinsNotification extends BaseAPiNotification {
  type: "checkins";
  count?: number;
}

export interface ApiCheckinNotification extends BaseAPiNotification {
  type: "checkin";
  count?: number;
}

export interface ApiPayoutsNotification extends BaseAPiNotification {
  type: "payouts";
  // The api builds these with .get(), so they can come back null, not just absent.
  amount?: string | null;
  amount_usd?: string | null;
  payout_at?: string | null;
  title?: string | null;
  author: string;
  permlink: string;
  // Image of the post that paid out.
  img_url?: string | null;
}

export interface ApiMonthlyPostsNotification extends BaseAPiNotification {
  type: "monthly-posts" | "monthly_posts";
  count?: number;
  title?: string | null;
}

export interface ApiAccountUpdateNotification extends BaseAPiNotification {
  type: "account_update";
  account: string;
  changes?: string[];
  keys_changed?: string[];
  accounts_granted?: { authority: string; account: string }[];
}

export interface ApiWeeklyEarningsNotification extends BaseAPiNotification {
  type: "weekly_earnings";
  total_usd?: string;
  author_usd?: string;
  curation_usd?: string;
}

export interface ApiScheduledPublishedNotification extends BaseAPiNotification {
  type: "scheduled_published";
  author: string;
  permlink: string;
  title?: string | null;
  img_url?: string | null;
}

export interface ApiNotificationSetting {
  system: string; //"web" | "desktop"
  allows_notify: number; //0|1
  notify_types: number[] | null; //vote:1,mention:2,follow:3,reply:4,reblog:5,transfers:6,delegations:10,engine-transfers:12
  status: number; //0|1
}

/**
 * A post carrying a hashtag the user follows. A single post names its author in
 * `source` and carries the post plus every followed tag it matched; a bundle
 * (busy tag, one row an hour) carries `count` and up to three of the posts in
 * `latest`, with `source` "ecency". Tags are normalised (lowercase, no `#`);
 * a post shows the first of its `tags`, a bundle its one `tag`.
 */
interface ApiTagsNotificationBase extends BaseAPiNotification {
  type: "tags";
}

export interface ApiTagsPostNotification extends ApiTagsNotificationBase {
  tags: string[];
  author: string;
  permlink: string;
  title: string | null;
  img_url: string | null;
  tag?: undefined;
  count?: undefined;
  latest?: undefined;
}

export interface ApiTagsBundleNotification extends ApiTagsNotificationBase {
  tag: string;
  count: number;
  latest: { author: string; permlink: string; title: string | null }[];
  tags?: undefined;
  author?: undefined;
  permlink?: undefined;
  title?: undefined;
  img_url?: undefined;
}

export type ApiTagsNotification = ApiTagsPostNotification | ApiTagsBundleNotification;

export type ApiNotification =
  | ApiVoteNotification
  | ApiMentionNotification
  | ApiFavoriteNotification
  | ApiBookmarkNotification
  | ApiFollowNotification
  | ApiReblogNotification
  | ApiReplyNotification
  | ApiTransferNotification
  | ApiSpinNotification
  | ApiInactiveNotification
  | ApiReferralNotification
  | ApiDelegationsNotification
  | ApiCheckinNotification
  | ApiCheckinsNotification
  | ApiPayoutsNotification
  | ApiMonthlyPostsNotification
  | ApiAccountUpdateNotification
  | ApiWeeklyEarningsNotification
  | ApiScheduledPublishedNotification
  | ApiTagsNotification;

export interface Notifications {
  filter: NotificationFilter | null;
  unread: number;
  list: ApiNotification[];
  loading: boolean;
  hasMore: boolean;
  unreadFetchFlag: boolean;
  settings?: ApiNotificationSetting;
  fbSupport: "pending" | "granted" | "denied";
}
