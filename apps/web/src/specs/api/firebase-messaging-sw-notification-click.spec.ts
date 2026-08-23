import { readFileSync } from "fs";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";
import { beforeAll, describe, expect, it } from "vitest";

/**
 * Exercises the shipped service worker (public/firebase-messaging-sw.js), which
 * is the click handler for background push. It cannot import from src, so its
 * routing table is a second copy of the one in notifications-ws-api.ts and has
 * to be tested against the same truth.
 *
 * Note the vocabularies differ: the push payload says "favorite"/"bookmark"/
 * "payout"/"delegation" where the websocket says "favorites"/"bookmarks"/
 * "payouts"/"delegations". Testing the real file is the only thing that keeps
 * that from drifting silently.
 */
describe("firebase-messaging-sw notificationclick", () => {
  let opened: string[];
  let click: (event: unknown) => void;

  beforeAll(() => {
    // Build the path from the spec file string, not `new URL(...)` — the jsdom
    // global URL isn't recognized by Node's fileURLToPath.
    const specDir = dirname(fileURLToPath(import.meta.url));
    const source = readFileSync(
      resolve(specDir, "../../../public/firebase-messaging-sw.js"),
      "utf-8"
    );

    opened = [];
    const listeners: Record<string, (event: unknown) => void> = {};
    const selfStub = {
      addEventListener: (type: string, listener: (event: unknown) => void) => {
        listeners[type] = listener;
      },
      registration: { showNotification: () => {} }
    };
    const firebaseStub = {
      initializeApp: () => {},
      messaging: () => ({ onBackgroundMessage: () => {} })
    };
    const clientsStub = {
      openWindow: (url: string) => {
        opened.push(url);
      }
    };

    // Run the worker body with the service-worker globals it expects. The two
    // importScripts calls at the top are what makes `firebase` exist in a real
    // worker, so they're a no-op here and the stub stands in.
    new Function(
      "importScripts",
      "firebase",
      "self",
      "clients",
      source
    )(() => {}, firebaseStub, selfStub, clientsStub);

    expect(listeners.notificationclick).toBeTypeOf("function");
    click = listeners.notificationclick;
  });

  const openedFor = (data: Record<string, unknown>) => {
    opened.length = 0;
    click({ notification: { data } });
    return opened[0];
  };

  const withPermlink = (type: string) => ({
    type,
    source: "actor",
    target: "recipient",
    permlink1: "a-permlink",
    permlink2: "",
    permlink3: ""
  });

  it.each([
    // The recipient's own post was voted on / reblogged / paid out.
    ["vote", "https://ecency.com/@recipient/a-permlink"],
    ["unvote", "https://ecency.com/@recipient/a-permlink"],
    ["reblog", "https://ecency.com/@recipient/a-permlink"],
    ["payout", "https://ecency.com/@recipient/a-permlink"],
    // The linked content belongs to the actor.
    ["mention", "https://ecency.com/@actor/a-permlink"],
    ["reply", "https://ecency.com/@actor/a-permlink"],
    ["favorite", "https://ecency.com/@actor/a-permlink"],
    ["bookmark", "https://ecency.com/@actor/a-permlink"],
    ["scheduled_published", "https://ecency.com/@actor/a-permlink"]
  ])("opens %s at %s", (type, expected) => {
    expect(openedFor(withPermlink(type))).toBe(expected);
  });

  it("opens a payout on the recipient's post, not on @ecency", () => {
    // Regression: payouts are sent with source 'ecency', and routing by source
    // opened /@ecency/<recipient's permlink>.
    expect(
      openedFor({
        type: "payout",
        source: "ecency",
        target: "recipient",
        permlink1: "my-paid-post",
        permlink2: "",
        permlink3: ""
      })
    ).toBe("https://ecency.com/@recipient/my-paid-post");
  });

  it("opens a reblog on the post's author, not on the account that reblogged", () => {
    expect(
      openedFor({
        type: "reblog",
        source: "reblogger",
        target: "author",
        permlink1: "my-post",
        permlink2: "",
        permlink3: ""
      })
    ).toBe("https://ecency.com/@author/my-post");
  });

  it("reassembles a permlink split across all three parts", () => {
    const long = "a".repeat(100) + "b".repeat(100) + "c".repeat(20);
    expect(
      openedFor({
        type: "favorite",
        source: "actor",
        target: "recipient",
        permlink1: long.slice(0, 100),
        permlink2: long.slice(100, 200),
        permlink3: long.slice(200, 300)
      })
    ).toBe(`https://ecency.com/@actor/${long}`);
  });

  it("does not concatenate a missing permlink part into the url", () => {
    expect(
      openedFor({ type: "favorite", source: "actor", target: "recipient", permlink1: "a-permlink" })
    ).toBe("https://ecency.com/@actor/a-permlink");
  });

  it.each(["follow", "unfollow", "ignore"])("opens %s on the actor's profile", (type) => {
    expect(openedFor({ type, source: "actor", target: "recipient" })).toBe(
      "https://ecency.com/@actor"
    );
  });

  it.each(["transfer", "delegation"])("opens %s on the recipient's wallet", (type) => {
    expect(openedFor({ type, source: "sender", target: "recipient", amount: "1.000 HIVE" })).toBe(
      "https://ecency.com/@recipient/wallet"
    );
  });

  it.each(["inactive", "checkin", "monthly_posts", "weekly_earnings", "account_update"])(
    "opens the recipient's own profile for %s, which is sent by @ecency",
    (type) => {
      expect(openedFor({ type, source: "ecency", target: "recipient" })).toBe(
        "https://ecency.com/@recipient"
      );
    }
  );

  it("routes the quests reminder to the allowlisted perks page", () => {
    expect(openedFor({ type: "spin", source: "ecency", target: "recipient", target_page: "perks" })).toBe(
      "https://ecency.com/perks"
    );
  });

  it("ignores a target_page that is not allowlisted", () => {
    expect(
      openedFor({ type: "spin", source: "ecency", target: "recipient", target_page: "../evil" })
    ).toBe("https://ecency.com/@recipient");
  });

  it("sends an unknown type to the recipient's profile rather than a stranger's permlink", () => {
    expect(
      openedFor({
        type: "some_future_type",
        source: "ecency",
        target: "recipient",
        permlink1: "not-mine"
      })
    ).toBe("https://ecency.com/@recipient");
  });

  it("falls back to the home page when the payload names no account", () => {
    expect(openedFor({ type: "favorite" })).toBe("https://ecency.com");
    expect(openedFor({} as Record<string, unknown>)).toBe("https://ecency.com");
  });
});
