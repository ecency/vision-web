import { beforeEach, describe, expect, it, vi } from "vitest";
import { dedupeIntegration } from "@sentry/core";
import { clientIntegrations } from "@/utils/sentry-dedupe";
import type { Event } from "@sentry/core";

const sentry = vi.hoisted(() => ({ captureMessage: vi.fn() }));
vi.mock("@/core/sentry/lazy-sentry", () => ({ sentry }));

import { reportRcPrecheck, reportRcRejection } from "@/api/rc-shortfall-report";

const rcRejection = () =>
  new Error("Account: alice has 100 RC, needs 2000 RC. Please wait to transact or power up HIVE.");

/**
 * The event Sentry builds from each captureMessage(message, context) the
 * reporter made, run through the SDK's own Dedupe integration as the client
 * config installs it (clientIntegrations). Returns the messages that survive.
 */
function keptBySentryDedupe(): string[] {
  const dedupe = clientIntegrations([dedupeIntegration()]).find((i) => i.name === "Dedupe")!;
  return sentry.captureMessage.mock.calls
    .map(([message, context]) => ({ message, ...context }) as Event)
    .map((event) => dedupe.processEvent!(event, {}, {} as never) as Event | null)
    .filter((event): event is Event => !!event)
    .map((event) => event.message as string);
}

// #2196: Sentry's default Dedupe drops an event equal to the previous one by
// message, fingerprint and stacktrace (tags and user are ignored). The client
// config exempts RC telemetry from it, so every report the reporter sends is kept.
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

  it("keeps an identical rejection from the next account (same stage and op)", () => {
    reportRcRejection(rcRejection(), "post", "dedupe-c");
    reportRcRejection(rcRejection(), "post", "dedupe-e");

    expect(sentry.captureMessage).toHaveBeenCalledTimes(2);
    expect(keptBySentryDedupe()).toEqual(["rc-shortfall: rejected/post", "rc-shortfall: rejected/post"]);
  });

  it("keeps a second real failure of the same op by the same account", () => {
    reportRcRejection(rcRejection(), "post", "dedupe-f");
    reportRcRejection(rcRejection(), "post", "dedupe-f");

    expect(keptBySentryDedupe()).toHaveLength(2);
  });

  it("keeps the one grouping fingerprint on every event", () => {
    reportRcPrecheck("dedupe-d", "vote");
    reportRcRejection(rcRejection(), "transfer", "dedupe-d");

    for (const [, context] of sentry.captureMessage.mock.calls) {
      expect(context.fingerprint).toEqual(["rc-shortfall"]);
    }
  });
});
