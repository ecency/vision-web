// Web socket notification _types
import { NotificationFilter } from "../enums";

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
    // Image of the newly published post.
    img_url: string | null;
  };
}

export interface WsBookmarkNotification extends BaseWsNotification {
  type: "bookmarks";
  extra: {
    permlink: string;
    is_post: 0 | 1;
    title: string | null;
    // Image of the bookmarked post that was commented on, not of the comment.
    parent_img_url: string | null;
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

export interface WsPayoutsNotification extends BaseWsNotification {
  type: "payouts";
  extra: {
    permlink: string;
    title: string | null;
    amount: string | null;
    amount_usd: string | null;
    payout_at: string | null;
    // Image of the post that paid out.
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

export interface WsSpinNotification extends BaseWsNotification {
  type: "spin";
}

export interface WsInactiveNotification extends BaseWsNotification {
  type: "inactive";
}

export interface WsReferralNotification extends BaseWsNotification {
  type: "referral";
}

/**
 * A post carrying a hashtag the user follows (enotify `tags`, main type 23).
 * Two shapes share the type, told apart by `permlink` (a single post, whose
 * author is `source`) versus `count` (an hourly bundle for a busy tag, sent
 * with `source` "ecency"). A post carries every followed tag it matched in
 * `tags`; `tag` is the one to show, the first of them.
 */
export interface WsTagsPostExtra {
  /** Normalised (lowercase, no `#`). */
  tag: string;
  tags: string[];
  permlink: string;
  title: string | null;
  img_url: string | null;
  count?: undefined;
}

export interface WsTagsBundleExtra {
  tag: string;
  count: number;
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
  | WsPayoutsNotification
  | WsTransferNotification
  | WsSpinNotification
  | WsInactiveNotification
  | WsReferralNotification
  | WsDelegationsNotification
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
  deck?: boolean;
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

export interface ApiPayoutsNotification extends BaseAPiNotification {
  type: "payouts";
  author: string;
  permlink: string;
  title: string | null;
  amount: string | null;
  amount_usd: string | null;
  payout_at: string | null;
  // Image of the post that paid out.
  img_url: string | null;
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
  // Image of the newly published post.
  img_url: string | null;
}

export interface ApiBookmarkNotification extends BaseAPiNotification {
  type: "bookmarks";
  author: string;
  account: string;
  permlink: string;
  post: boolean;
  title: string | null;
  // Image of the bookmarked post that was commented on, not of the comment.
  parent_img_url: string | null;
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
  title: string | null;
  img_url: string | null;
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
 * `latest`, with `source` "ecency". `tag` is the one to show on both.
 */
interface ApiTagsNotificationBase extends BaseAPiNotification {
  type: "tags";
  /** Normalised (lowercase, no `#`). */
  tag: string;
}

export interface ApiTagsPostNotification extends ApiTagsNotificationBase {
  tags: string[];
  author: string;
  permlink: string;
  title: string | null;
  img_url: string | null;
  count?: undefined;
  latest?: undefined;
}

export interface ApiTagsBundleNotification extends ApiTagsNotificationBase {
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
  | ApiPayoutsNotification
  | ApiReplyNotification
  | ApiTransferNotification
  | ApiSpinNotification
  | ApiInactiveNotification
  | ApiReferralNotification
  | ApiDelegationsNotification
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
