import { beforeEach, describe, expect, it, vi } from "vitest";
import { dedupeIntegration } from "@sentry/core";
import type { Event } from "@sentry/core";

const sentry = vi.hoisted(() => ({ captureMessage: vi.fn() }));
vi.mock("@/core/sentry/lazy-sentry", () => ({ sentry }));

import { reportRcPrecheck, reportRcRejection } from "@/api/rc-shortfall-report";

const rcRejection = () =>
  new Error("Account: alice has 100 RC, needs 2000 RC. Please wait to transact or power up HIVE.");

/**
 * The event Sentry builds from each captureMessage(message, context) the
 * reporter made, run through the SDK's own Dedupe integration (a default
 * integration the client config keeps). Returns the messages that survive.
 */
function keptBySentryDedupe(): string[] {
  const dedupe = dedupeIntegration();
  return sentry.captureMessage.mock.calls
    .map(([message, context]) => ({ message, ...context }) as Event)
    .map((event) => dedupe.processEvent!(event, {}, {} as never) as Event | null)
    .filter((event): event is Event => !!event)
    .map((event) => event.message as string);
}

// #2196: Dedupe drops an event equal to the previous one by message,
// fingerprint and stacktrace (tags and user are ignored). Every report shares
// one fingerprint, so the message carries stage and op to keep them apart.
describe("rc-shortfall events through Sentry's Dedupe integration", () => {
  beforeEach(() => {
    sentry.captureMessage.mockReset();
    window.localStorage.clear();
  });

  it("keeps a rejection that follows a pre-check warning on the same op", () => {
    reportRcPrecheck("dedupe-a", "comment");
    reportRcRejection(rcRejection(), "comment", "dedupe-a");

    expect(keptBySentryDedupe()).toEqual([
      "rc-shortfall: precheck/comment",
      "rc-shortfall: rejected/comment"
    ]);
  });

  it("keeps rejections on different ops back to back", () => {
    reportRcRejection(rcRejection(), "vote", "dedupe-b");
    reportRcRejection(rcRejection(), "post", "dedupe-b");

    expect(keptBySentryDedupe()).toEqual([
      "rc-shortfall: rejected/vote",
      "rc-shortfall: rejected/post"
    ]);
  });

  // Accepted: the same failure repeated in a row by one tab counts once, which
  // is what the daily unique-user count needs anyway.
  it("drops an identical rejection that directly follows the first", () => {
    reportRcRejection(rcRejection(), "post", "dedupe-c");
    reportRcRejection(rcRejection(), "post", "dedupe-c");

    expect(sentry.captureMessage).toHaveBeenCalledTimes(2);
    expect(keptBySentryDedupe()).toEqual(["rc-shortfall: rejected/post"]);
  });

  it("keeps the one grouping fingerprint on every event", () => {
    reportRcPrecheck("dedupe-d", "vote");
    reportRcRejection(rcRejection(), "transfer", "dedupe-d");

    for (const [, context] of sentry.captureMessage.mock.calls) {
      expect(context.fingerprint).toEqual(["rc-shortfall"]);
    }
  });
});
