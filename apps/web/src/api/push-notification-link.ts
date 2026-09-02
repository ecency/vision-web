/**
 * Where a push notification should open.
 *
 * Push payloads carry their own type vocabulary, produced by enotify's
 * push/format.py, and it is NOT the websocket/API vocabulary the in-app links
 * use: "favorite" not "favorites", "bookmark" not "bookmarks", "payout" not
 * "payouts", "delegation" not "delegations".
 *
 * `source` is the actor and `target` is the recipient (the signed-in user).
 * Which of the two authored the post a permlink belongs to depends on the type,
 * and getting it backwards opens /@<wrong-author>/<permlink>, which renders the
 * "couldn't load this post" screen.
 *
 * FCM delivers the same payload to the page (foreground, `api/firebase.ts`) and
 * to the service worker (background, `public/firebase-messaging-sw.js`). The
 * worker is a static public file with no bundler, so it cannot import this and
 * keeps its own copy of the table; `specs/api/push-notification-link-cases.ts`
 * is the shared fixture that holds the two to the same answers.
 */

const BASE = "https://ecency.com";

/** The permlink belongs to the recipient's own post. */
const ENTRY_BY_TARGET = ["vote", "unvote", "reblog", "payout"];
/**
 * The permlink belongs to the actor's post: a favourite author's new post, a
 * reply to a bookmarked post, a mention, a reply, one's own scheduled post.
 */
const ENTRY_BY_SOURCE = ["mention", "reply", "favorite", "bookmark", "scheduled_published"];
/** Profile of the actor. */
const PROFILE_BY_SOURCE = ["follow", "unfollow", "ignore"];
/** The recipient's own wallet, matching where the in-app link for these goes. */
const WALLET_BY_TARGET = ["transfer", "delegation"];
/**
 * A post carrying a followed tag. With a permlink it is one post by the actor;
 * without one it is an hourly bundle, which opens the tag's feed.
 */
const TAG_FEED_TYPES = ["tag"];
/** The shape of a tag on chain; anything else is not allowed into a URL. */
const TAG_SHAPE = /^[a-z0-9-]{1,32}$/;
/**
 * Allowlist target pages so a forged or misconfigured push can't route to an
 * arbitrary ecency.com path. Add new deep-link targets here as they're
 * introduced.
 */
const ALLOWED_TARGET_PAGES = ["perks"];

export interface PushNotificationData {
  type?: string;
  source?: string;
  target?: string;
  target_page?: string;
  permlink1?: string;
  permlink2?: string;
  permlink3?: string;
  tag?: string;
  [key: string]: unknown;
}

/**
 * A permlink over 100 characters arrives split across three fields, and a part
 * that carries no text arrives as "" (or as the string "None" when it was
 * serialized from a Python None). Filtering rather than concatenating keeps a
 * missing part from landing in the URL as the literal "undefined".
 */
function joinPermlink(data: PushNotificationData): string {
  return [data.permlink1, data.permlink2, data.permlink3]
    .filter((part): part is string => typeof part === "string" && part !== "None")
    .join("")
    .trim();
}

export function buildPushNotificationUrl(data: PushNotificationData | undefined | null): string {
  if (!data) {
    return BASE;
  }

  if (data.target_page && ALLOWED_TARGET_PAGES.includes(data.target_page)) {
    // e.g. the perks/quests reminder -> open the perks page directly
    return `${BASE}/${data.target_page}`;
  }

  const type = data.type ?? "";

  if (WALLET_BY_TARGET.includes(type)) {
    return data.target ? `${BASE}/@${data.target}/wallet` : BASE;
  }

  if (TAG_FEED_TYPES.includes(type)) {
    const permlink = joinPermlink(data);
    if (permlink && data.source) {
      return `${BASE}/@${data.source}/${permlink}`;
    }
    if (typeof data.tag === "string" && TAG_SHAPE.test(data.tag)) {
      return `${BASE}/created/${data.tag}`;
    }
    // A bundle naming no usable tag lands on the recipient's own profile, like
    // any other payload this table cannot place.
    return data.target ? `${BASE}/@${data.target}` : BASE;
  }

  const isEntryBySource = ENTRY_BY_SOURCE.includes(type);
  // Everything not authored by the actor resolves against the recipient. That
  // includes the informational types enotify sends with source 'ecency'
  // (inactive, checkin, monthly_posts, weekly_earnings, account_update) and any
  // type added later that isn't listed above: an unknown type lands on the
  // recipient's own profile rather than on a stranger's permlink.
  const author = isEntryBySource || PROFILE_BY_SOURCE.includes(type) ? data.source : data.target;

  if (!author) {
    return BASE;
  }

  const permlink = isEntryBySource || ENTRY_BY_TARGET.includes(type) ? joinPermlink(data) : "";

  return permlink ? `${BASE}/@${author}/${permlink}` : `${BASE}/@${author}`;
}
