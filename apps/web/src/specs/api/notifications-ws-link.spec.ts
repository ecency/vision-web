import { describe, expect, it } from "vitest";
import { NotificationsWebSocket } from "@/api/notifications-ws-api";

/**
 * The websocket notification payload names two accounts: `source` is the actor
 * and `target` is the recipient (the signed-in user). Which of the two authored
 * the post a `permlink` belongs to depends on the type, and resolving it from
 * the wrong one produces /@<wrong-author>/<permlink> — a URL that renders the
 * "couldn't load this post" screen instead of the post.
 *
 * The truth table below is the notification service's own converters
 * (enotify sync.py) and its API serializer, which is what the notification
 * panel rows already follow.
 */
// getLink is a private static; reach it through a narrow structural type
// rather than `any`, and take a loose payload so malformed messages can be
// exercised too.
type LinkPayload = Record<string, unknown>;
const getLink = (data: LinkPayload) =>
  (
    NotificationsWebSocket as unknown as {
      getLink(data: LinkPayload): string | undefined;
    }
  ).getLink(data);

const entry = (type: string, permlink = "a-permlink") => ({
  type,
  source: "actor",
  target: "recipient",
  extra: { permlink }
});

describe("NotificationsWebSocket.getLink follow family", () => {
  // The whole family points at the actor's profile. None of them carry a permlink, so
  // resolving one as an entry would build a URL that cannot exist.
  it.each(["follow", "unfollow", "ignore", "blacklist"])("links %s to the actor", (type) => {
    expect(getLink({ type, source: "actor", target: "recipient" })).toBe("/@actor");
  });
});

describe("NotificationsWebSocket.getLink entry authorship", () => {
  it.each([
    // The recipient's own post was acted on.
    ["vote", "/@recipient/a-permlink"],
    ["reblog", "/@recipient/a-permlink"],
    ["payouts", "/@recipient/a-permlink"],
    // Self-targeted, so source and target name the same account; read from
    // source to match the push table exactly.
    ["scheduled_published", "/@actor/a-permlink"],
    // The linked content belongs to the actor.
    ["mention", "/@actor/a-permlink"],
    ["reply", "/@actor/a-permlink"],
    ["favorites", "/@actor/a-permlink"],
    ["bookmarks", "/@actor/a-permlink"],
    // A post carrying a followed tag belongs to the actor too.
    ["tags", "/@actor/a-permlink"]
  ])("links %s to %s", (type, expected) => {
    expect(getLink(entry(type))).toBe(expected);
  });

  it("links a tag bundle to the tag's feed and refuses a forged tag", () => {
    const bundle = (tag: unknown) => ({
      type: "tags",
      source: "ecency",
      target: "recipient",
      extra: { tag, count: 12 }
    });
    expect(getLink(bundle("photography"))).toBe("/created/photography");
    // Not a tag shape: a path segment, a query, whitespace, a community name is
    // fine (it is a tag shape) but the others must not reach the URL.
    expect(getLink(bundle("../evil"))).toBeUndefined();
    expect(getLink(bundle("a/b"))).toBeUndefined();
    expect(getLink(bundle("a?x=1"))).toBeUndefined();
    expect(getLink(bundle(undefined))).toBeUndefined();
    expect(getLink(bundle(12))).toBeUndefined();
  });

  it("links a favourite author's new post to the author, not to the recipient", () => {
    // Regression: a favourites notification resolved from `target`, so the
    // popup opened the signed-in user's own blog with someone else's permlink.
    expect(
      getLink({
        type: "favorites",
        source: "sagarkothari88",
        target: "ecency",
        extra: { permlink: "hivesuite-hive-inbox-dev-update", is_post: 1 }
      })
    ).toBe("/@sagarkothari88/hivesuite-hive-inbox-dev-update");
  });

  it("links a reply to a bookmarked post to the replier", () => {
    expect(
      getLink({
        type: "bookmarks",
        source: "replier",
        target: "bookmarker",
        extra: { permlink: "re-something", parent_author: "original", is_post: 0 }
      })
    ).toBe("/@replier/re-something");
  });
});

describe("NotificationsWebSocket.getLink non-entry destinations", () => {
  it("sends follow to the follower's profile", () => {
    expect(getLink({ type: "follow", source: "actor", target: "recipient", extra: {} })).toBe(
      "/@actor"
    );
  });

  it.each(["transfer", "delegations"])("sends %s to the recipient's wallet", (type) => {
    expect(getLink({ type, source: "actor", target: "recipient", extra: { amount: "1.000 HIVE" } })).toBe(
      "/@recipient/wallet"
    );
  });

  it.each(["checkins", "monthly_posts", "weekly_earnings", "account_update"])(
    "leaves %s without a destination so the click opens the panel",
    (type) => {
      expect(getLink({ type, source: "ecency", target: "recipient", extra: {} })).toBeUndefined();
    }
  );
});

describe("NotificationsWebSocket.getLink malformed payloads", () => {
  it.each([undefined, "", "   ", "undefined"])(
    "returns no link for the permlink %o rather than a broken route",
    (permlink) => {
      expect(getLink({ ...entry("favorites"), extra: { permlink } })).toBeUndefined();
    }
  );

  it("returns no link when the author field is missing", () => {
    expect(getLink({ type: "favorites", target: "recipient", extra: { permlink: "p" } })).toBeUndefined();
  });

  it("does not throw when extra is absent", () => {
    expect(getLink({ type: "favorites", source: "actor", target: "recipient" })).toBeUndefined();
  });
});
