import { readFileSync } from "fs";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";
import { beforeAll, describe, expect, it } from "vitest";
import { buildPushNotificationUrl } from "@/api/push-notification-link";
import { NotificationsWebSocket } from "@/api/notifications-ws-api";

/**
 * Adversarial checks on notification click routing.
 *
 * A wrong author here is not a cosmetic bug: it sends the user to a URL that
 * does not exist. Rather than restate the implementation's table, these tests
 * hold the three copies of it against each other and against the notification
 * service's own authorship rules, then attack them with payloads designed to
 * produce a bad route.
 */

type Payload = Record<string, unknown>;

const getLink = (data: Payload) =>
  (
    NotificationsWebSocket as unknown as {
      getLink(data: Payload): string | undefined;
    }
  ).getLink(data);

/** The shipped service worker's own copy, driven through its real listener. */
let swUrlFor: (data: Record<string, string>) => string;

beforeAll(() => {
  const specDir = dirname(fileURLToPath(import.meta.url));
  const source = readFileSync(resolve(specDir, "../../../public/firebase-messaging-sw.js"), "utf-8");

  const opened: string[] = [];
  const listeners: Record<string, (event: unknown) => void> = {};
  new Function(
    "importScripts",
    "firebase",
    "self",
    "clients",
    source
  )(
    () => {},
    { initializeApp: () => {}, messaging: () => ({ onBackgroundMessage: () => {} }) },
    {
      addEventListener: (type: string, listener: (event: unknown) => void) => {
        listeners[type] = listener;
      },
      registration: { showNotification: () => {} }
    },
    { openWindow: (url: string) => (opened.push(url), Promise.resolve(null)) }
  );

  swUrlFor = (data) => {
    opened.length = 0;
    listeners.notificationclick({ notification: { data }, waitUntil: () => {} });
    return opened[0];
  };
});

/**
 * Authorship as the notification service defines it, not as the app implements
 * it. enotify's converters set `source` and `target` per type (sync.py), and its
 * API serializer names the post's author from one of the two (api/endpoints.py).
 * That is the ground truth both click paths have to agree with.
 */
const AUTHORSHIP: {
  /** websocket / API type */
  ws: string;
  /** push payload type, which uses different spellings */
  push: string;
  /** which field the post's author is in */
  author: "source" | "target";
  /** whether the notification carries an entry at all */
  entry: boolean;
  /**
   * Whether the in-app path delivers this type. `unvote` has no getBody branch,
   * so the websocket message is dropped before a toast is ever queued.
   */
  inApp?: false;
}[] = [
  // enotify sync.py: source = voter, target = the post's author.
  { ws: "vote", push: "vote", author: "target", entry: true },
  { ws: "unvote", push: "unvote", author: "target", entry: true, inApp: false },
  // source = the account that reblogged, target = the post's author.
  { ws: "reblog", push: "reblog", author: "target", entry: true },
  // source = 'ecency', target = the author being paid.
  { ws: "payouts", push: "payout", author: "target", entry: true },
  // source = the author of the mentioning post, target = the mentioned account.
  { ws: "mention", push: "mention", author: "source", entry: true },
  // source = the replier, target = the parent author.
  { ws: "reply", push: "reply", author: "source", entry: true },
  // source = the favourited author who just published, target = the follower.
  { ws: "favorites", push: "favorite", author: "source", entry: true },
  // source = the replier, target = whoever bookmarked the parent.
  { ws: "bookmarks", push: "bookmark", author: "source", entry: true },
  // self-targeted: source === target.
  { ws: "scheduled_published", push: "scheduled_published", author: "source", entry: true },
  // source = the follower, target = the followed account.
  { ws: "follow", push: "follow", author: "source", entry: false }
];

describe("both click paths agree with the notification service's authorship", () => {
  it.each(AUTHORSHIP.map((row) => [row.ws, row] as const))(
    "%s resolves the entry author from the field enotify puts it in",
    (_type, row) => {
      const source = row.ws === "scheduled_published" ? "self" : "actor";
      const target = row.ws === "scheduled_published" ? "self" : "recipient";
      const expectedAuthor = row.author === "source" ? source : target;

      const push = swUrlFor({
        type: row.push,
        source,
        target,
        ...(row.entry ? { permlink1: "the-permlink", permlink2: "", permlink3: "" } : {})
      });
      const inApp = getLink({
        type: row.ws,
        source,
        target,
        extra: row.entry ? { permlink: "the-permlink" } : {}
      });

      const expectedPath = row.entry
        ? `/@${expectedAuthor}/the-permlink`
        : `/@${expectedAuthor}`;

      expect(push).toBe(`https://ecency.com${expectedPath}`);
      expect(inApp).toBe(row.inApp === false ? undefined : expectedPath);
    }
  );

  it("never points an entry link at the account that merely acted on it", () => {
    // The reported failure in one sentence: a favourite author's post opened
    // under the recipient's own blog.
    for (const row of AUTHORSHIP.filter((r) => r.entry && r.ws !== "scheduled_published")) {
      const wrongAccount = row.author === "source" ? "recipient" : "actor";

      expect(
        swUrlFor({ type: row.push, source: "actor", target: "recipient", permlink1: "p" })
      ).not.toContain(`/@${wrongAccount}/`);

      const inApp = getLink({
        type: row.ws,
        source: "actor",
        target: "recipient",
        extra: { permlink: "p" }
      });
      expect(inApp ?? "").not.toContain(`/@${wrongAccount}/`);
    }
  });
});

describe("the three copies of the table cannot drift apart", () => {
  function makeRandom(seed: number) {
    let state = seed >>> 0;
    return () => {
      state = (state * 1664525 + 1013904223) >>> 0;
      return state / 0x100000000;
    };
  }

  const KNOWN_PUSH_TYPES = [
    "vote", "unvote", "mention", "favorite", "bookmark", "follow", "unfollow", "ignore",
    "reply", "reblog", "transfer", "payout", "delegation", "spin", "inactive", "checkin",
    "monthly_posts", "weekly_earnings", "account_update", "scheduled_published"
  ];
  const ODD_TYPES = ["", "favorites", "payouts", "delegations", "VOTE", "future_type", "__proto__"];
  const ODD_ACCOUNTS = [
    "alice", "", "..", "../..", "//evil.com", "https://evil.com", "a b",
    "@doubled", "ünicode", "a".repeat(300), "x\ny", "%2e%2e", "__proto__"
  ];

  it("service worker and app answer identically on 1500 randomised payloads", () => {
    const random = makeRandom(823);
    const disagreements: unknown[] = [];

    for (let i = 0; i < 1500; i++) {
      const pool = random() < 0.8 ? KNOWN_PUSH_TYPES : ODD_TYPES;
      const pick = <T,>(list: T[]) => list[Math.floor(random() * list.length)];

      const data: Record<string, string> = { type: pick(pool) };
      if (random() < 0.9) data.source = pick(ODD_ACCOUNTS);
      if (random() < 0.9) data.target = pick(ODD_ACCOUNTS);
      if (random() < 0.6) data.permlink1 = pick(["a-post", "", "None", "x".repeat(100)]);
      if (random() < 0.4) data.permlink2 = pick(["", "tail", "None"]);
      if (random() < 0.3) data.permlink3 = pick(["", "end"]);
      if (random() < 0.15) data.target_page = pick(["perks", "../evil", "", "wallet"]);

      const fromWorker = swUrlFor(data);
      const fromApp = buildPushNotificationUrl(data);
      if (fromWorker !== fromApp) {
        disagreements.push({ i, data, fromWorker, fromApp });
      }
    }

    expect(disagreements).toEqual([]);
  });

  it("never leaves ecency.com, whatever the payload says", () => {
    // A push payload is attacker-influenceable in the sense that a compromised
    // or misconfigured sender picks these fields. Nothing in them may turn the
    // click into a navigation somewhere else.
    const random = makeRandom(1607);
    const offOrigin: unknown[] = [];

    for (let i = 0; i < 1500; i++) {
      const pick = <T,>(list: T[]) => list[Math.floor(random() * list.length)];
      const data: Record<string, string> = {
        type: pick([...KNOWN_PUSH_TYPES, ...ODD_TYPES]),
        source: pick(ODD_ACCOUNTS),
        target: pick(ODD_ACCOUNTS),
        permlink1: pick(["p", "//evil.com", "..", "\\evil", ""]),
        target_page: pick(["", "perks", "//evil.com", "..", "http://evil.com"])
      };

      const url = buildPushNotificationUrl(data);
      // Resolve the way a browser would, so path traversal and stray slashes
      // are normalised before the origin is checked.
      const resolved = new URL(url, "https://ecency.com");
      if (resolved.origin !== "https://ecency.com") {
        offOrigin.push({ i, data, url, origin: resolved.origin });
      }
    }

    expect(offOrigin).toEqual([]);
  });

  it("never emits the string undefined or null into a url", () => {
    const cases: Record<string, string | undefined>[] = [
      { type: "favorite", source: "alice", permlink1: "p", permlink2: undefined },
      { type: "favorite", source: "alice", permlink1: undefined, permlink2: "tail" },
      { type: "vote", target: "alice", permlink1: "p", permlink3: undefined },
      { type: "payout", target: "alice", permlink1: "None", permlink2: "None" },
      { type: undefined, source: "alice", target: "bob" }
    ];

    for (const data of cases) {
      const url = buildPushNotificationUrl(data as Record<string, string>);
      expect(url).not.toMatch(/undefined|null|NaN|None/);
      expect(swUrlFor(data as Record<string, string>)).toBe(url);
    }
  });
});

describe("in-app links never produce a route that cannot resolve", () => {
  const BAD_PERMLINKS = [undefined, null, "", "   ", "undefined", 0, false, {}, []];

  it.each(BAD_PERMLINKS.map((p, i) => [i, p] as const))(
    "returns no link rather than a broken one for permlink %o",
    (_i, permlink) => {
      for (const type of ["favorites", "bookmarks", "vote", "reblog", "payouts", "mention", "reply"]) {
        const link = getLink({
          type,
          source: "actor",
          target: "recipient",
          extra: { permlink }
        });
        // Either no destination at all, or a two-segment entry route. Never
        // "/@alice/" or "/@alice/undefined".
        if (link !== undefined) {
          expect(link).toMatch(/^\/@[^/]+\/[^/]+$/);
        }
      }
    }
  );

  it.each(["favorites", "bookmarks", "vote", "reblog", "payouts", "mention", "reply", "follow"])(
    "returns no link for %s when the account it needs is missing",
    (type) => {
      expect(getLink({ type, extra: { permlink: "p" } })).toBeUndefined();
    }
  );

  it("does not throw on a message with no extra, a null extra or no fields at all", () => {
    for (const data of [{ type: "favorites" }, { type: "favorites", extra: null }, {}]) {
      expect(() => getLink(data)).not.toThrow();
    }
  });

  it("agrees with the push path wherever it gives a destination", () => {
    // The in-app toast and the push notification for the same event must not
    // send the user to two different places.
    const PAIRS: [string, string][] = [
      ["vote", "vote"],
      ["reblog", "reblog"],
      ["payouts", "payout"],
      ["mention", "mention"],
      ["reply", "reply"],
      ["favorites", "favorite"],
      ["bookmarks", "bookmark"],
      ["scheduled_published", "scheduled_published"],
      ["follow", "follow"],
      ["transfer", "transfer"],
      ["delegations", "delegation"]
    ];

    for (const [ws, push] of PAIRS) {
      const inApp = getLink({
        type: ws,
        source: "actor",
        target: "recipient",
        extra: { permlink: "the-permlink", amount: "1.000 HIVE" }
      });
      if (inApp === undefined) continue;

      expect(buildPushNotificationUrl({
        type: push,
        source: "actor",
        target: "recipient",
        permlink1: "the-permlink"
      })).toBe(`https://ecency.com${inApp}`);
    }
  });
});
