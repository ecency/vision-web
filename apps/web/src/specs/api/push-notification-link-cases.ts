/**
 * The one routing table for push notification clicks.
 *
 * FCM hands the same payload to two places: the page, when the tab is in the
 * foreground (`api/firebase.ts`), and the service worker, when it is not
 * (`public/firebase-messaging-sw.js`). The worker is a static public file with
 * no bundler, so it cannot import the app's implementation and carries its own
 * copy. Both specs run these cases, so a change to one copy that is not made to
 * the other fails.
 */
export interface PushLinkCase {
  name: string;
  data: Record<string, string>;
  expected: string;
}

const actorAndRecipient = { source: "actor", target: "recipient" };
const permlinkParts = { permlink1: "a-permlink", permlink2: "", permlink3: "" };

export const PUSH_LINK_CASES: PushLinkCase[] = [
  // The recipient's own post was voted on, reblogged or paid out.
  {
    name: "vote opens the recipient's post",
    data: { type: "vote", ...actorAndRecipient, ...permlinkParts },
    expected: "https://ecency.com/@recipient/a-permlink"
  },
  {
    name: "unvote opens the recipient's post",
    data: { type: "unvote", ...actorAndRecipient, ...permlinkParts },
    expected: "https://ecency.com/@recipient/a-permlink"
  },
  {
    name: "reblog opens the post's author, not the account that reblogged",
    data: { type: "reblog", source: "reblogger", target: "author", ...permlinkParts },
    expected: "https://ecency.com/@author/a-permlink"
  },
  {
    name: "payout opens the recipient's post, not @ecency",
    // Payouts are sent with source 'ecency'; routing by source opened
    // /@ecency/<the recipient's permlink>.
    data: { type: "payout", source: "ecency", target: "recipient", ...permlinkParts },
    expected: "https://ecency.com/@recipient/a-permlink"
  },

  // The linked content belongs to the actor.
  {
    name: "mention opens the mentioning post",
    data: { type: "mention", ...actorAndRecipient, ...permlinkParts },
    expected: "https://ecency.com/@actor/a-permlink"
  },
  {
    name: "reply opens the reply",
    data: { type: "reply", ...actorAndRecipient, ...permlinkParts },
    expected: "https://ecency.com/@actor/a-permlink"
  },
  {
    name: "favorite opens the favourite author's new post",
    data: { type: "favorite", source: "sagarkothari88", target: "ecency", ...permlinkParts },
    expected: "https://ecency.com/@sagarkothari88/a-permlink"
  },
  {
    name: "bookmark opens the reply to the bookmarked post",
    data: { type: "bookmark", source: "replier", target: "bookmarker", ...permlinkParts },
    expected: "https://ecency.com/@replier/a-permlink"
  },
  {
    name: "scheduled_published opens one's own post",
    data: { type: "scheduled_published", source: "author", target: "author", ...permlinkParts },
    expected: "https://ecency.com/@author/a-permlink"
  },

  // A followed tag: one post by the actor, or an hourly bundle that opens the tag feed.
  {
    name: "tag opens the new post by its author",
    data: { type: "tag", source: "alice", target: "recipient", tag: "photography", ...permlinkParts },
    expected: "https://ecency.com/@alice/a-permlink"
  },
  {
    name: "a tag bundle opens the tag's feed",
    data: { type: "tag", source: "ecency", target: "recipient", tag: "photography", count: "12" },
    expected: "https://ecency.com/created/photography"
  },
  {
    name: "a tag bundle with a forged tag opens the recipient's profile, not the forged path",
    data: { type: "tag", source: "ecency", target: "recipient", tag: "../evil", count: "12" },
    expected: "https://ecency.com/@recipient"
  },
  {
    name: "a tag bundle with a slash in the tag opens the recipient's profile",
    data: { type: "tag", source: "ecency", target: "recipient", tag: "a/b", count: "3" },
    expected: "https://ecency.com/@recipient"
  },
  {
    name: "a tag bundle naming no tag opens the recipient's profile",
    data: { type: "tag", source: "ecency", target: "recipient", count: "3" },
    expected: "https://ecency.com/@recipient"
  },

  // Profiles and wallets.
  {
    name: "follow opens the follower's profile",
    data: { type: "follow", ...actorAndRecipient },
    expected: "https://ecency.com/@actor"
  },
  {
    name: "unfollow opens the actor's profile",
    data: { type: "unfollow", ...actorAndRecipient },
    expected: "https://ecency.com/@actor"
  },
  {
    name: "ignore opens the actor's profile",
    data: { type: "ignore", ...actorAndRecipient },
    expected: "https://ecency.com/@actor"
  },
  {
    name: "transfer opens the recipient's wallet",
    data: { type: "transfer", source: "sender", target: "recipient", amount: "1.000 HIVE" },
    expected: "https://ecency.com/@recipient/wallet"
  },
  {
    name: "delegation opens the recipient's wallet",
    data: { type: "delegation", source: "delegator", target: "recipient", amount: "1.000 HP" },
    expected: "https://ecency.com/@recipient/wallet"
  },

  // Informational types, all sent with source 'ecency' and no permlink.
  ...["inactive", "checkin", "monthly_posts", "weekly_earnings", "account_update"].map(
    (type) => ({
      name: `${type} opens the recipient's own profile, not @ecency`,
      data: { type, source: "ecency", target: "recipient" },
      expected: "https://ecency.com/@recipient"
    })
  ),

  // Deep-link target pages.
  {
    name: "the quests reminder opens the allowlisted perks page",
    data: { type: "spin", source: "ecency", target: "recipient", target_page: "perks" },
    expected: "https://ecency.com/perks"
  },
  {
    name: "a target_page outside the allowlist is ignored",
    data: { type: "spin", source: "ecency", target: "recipient", target_page: "../evil" },
    expected: "https://ecency.com/@recipient"
  },

  // Payload shapes that must not produce a broken route.
  {
    name: "a permlink split across all three parts is reassembled",
    data: {
      type: "favorite",
      ...actorAndRecipient,
      permlink1: "a".repeat(100),
      permlink2: "b".repeat(100),
      permlink3: "c".repeat(20)
    },
    expected: `https://ecency.com/@actor/${"a".repeat(100)}${"b".repeat(100)}${"c".repeat(20)}`
  },
  {
    name: "a missing permlink part is not concatenated into the url",
    data: { type: "favorite", ...actorAndRecipient, permlink1: "a-permlink" },
    expected: "https://ecency.com/@actor/a-permlink"
  },
  {
    name: "an unknown type opens the recipient's profile, not a stranger's permlink",
    data: {
      type: "some_future_type",
      source: "ecency",
      target: "recipient",
      permlink1: "not-mine"
    },
    expected: "https://ecency.com/@recipient"
  },
  {
    name: "a payload naming no account falls back to the home page",
    data: { type: "favorite" },
    expected: "https://ecency.com"
  },
  {
    name: "an empty payload falls back to the home page",
    data: {},
    expected: "https://ecency.com"
  }
];
