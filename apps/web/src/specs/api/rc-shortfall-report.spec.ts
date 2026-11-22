import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sentry = vi.hoisted(() => ({ captureMessage: vi.fn() }));
vi.mock("@/core/sentry/lazy-sentry", () => ({ sentry }));

import { reportRcRejection } from "@/api/rc-shortfall-report";

const rcRejection = () => new Error("Account: alice has 100 RC, needs 2000 RC. Please wait to transact or power up HIVE.");

// #2196: out-of-RC events are counted in Sentry as one grouped info message.
describe("reportRcRejection", () => {
  beforeEach(() => {
    sentry.captureMessage.mockReset();
  });

  it("sends one info message with the shared shape", () => {
    reportRcRejection(rcRejection(), "post", "alice");

    expect(sentry.captureMessage).toHaveBeenCalledTimes(1);
    expect(sentry.captureMessage).toHaveBeenCalledWith("rc-shortfall: rejected/post", {
      level: "info",
      fingerprint: ["rc-shortfall"],
      tags: { "rc.stage": "rejected", "rc.op": "post" },
      user: { username: "alice" }
    });
  });

  // Same classification as the SDK and the mobile app, not only the web toast's.
  it.each([
    "Account: alice has not enough RC mana for this operation",
    "Insufficient RC to broadcast",
    "rc mana check failed",
    "Not enough resource credits"
  ])("counts the SDK's RC wording: %s", (message) => {
    reportRcRejection(new Error(message), "other", "alice");

    expect(sentry.captureMessage).toHaveBeenCalledTimes(1);
  });

  it("counts one failure once, however many handlers report it", () => {
    const err = rcRejection();
    reportRcRejection(err, "comment", "alice");
    reportRcRejection(err, "comment", "alice");

    expect(sentry.captureMessage).toHaveBeenCalledTimes(1);
  });

  it("ignores errors that are not about RC", () => {
    reportRcRejection(new Error("Bandwidth limit exceeded. Please wait to vote"), "vote", "alice");
    reportRcRejection(new Error("Missing Active Authority alice"), "transfer", "alice");
    reportRcRejection(new Error("something else broke"), "post", "alice");
    reportRcRejection(null, "post", "alice");

    expect(sentry.captureMessage).not.toHaveBeenCalled();
  });

  it("never throws when Sentry does", () => {
    sentry.captureMessage.mockImplementation(() => {
      throw new Error("sentry down");
    });

    let thrown: unknown = null;
    try {
      reportRcRejection(rcRejection(), "post", "alice");
    } catch (e) {
      thrown = e;
    }

    expect(sentry.captureMessage).toHaveBeenCalledTimes(1);
    expect(thrown).toBeNull();
  });
});

describe("reportRcPrecheck", () => {
  // Each test starts a fresh page load: a new module instance, empty memory.
  async function freshPage() {
    vi.resetModules();
    return import("@/api/rc-shortfall-report");
  }

  beforeEach(() => {
    sentry.captureMessage.mockReset();
    window.localStorage.clear();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-22T10:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("reports once per account and op", async () => {
    const { reportRcPrecheck } = await freshPage();
    reportRcPrecheck("carol", "comment");
    reportRcPrecheck("carol", "comment");
    reportRcPrecheck("carol", "vote");
    reportRcPrecheck("dave", "comment");

    expect(sentry.captureMessage).toHaveBeenCalledTimes(3);
    expect(sentry.captureMessage).toHaveBeenNthCalledWith(2, "rc-shortfall: precheck/vote", {
      level: "info",
      fingerprint: ["rc-shortfall"],
      tags: { "rc.stage": "precheck", "rc.op": "vote" },
      user: { username: "carol" }
    });
  });

  it("does not report again after a reload on the same UTC day", async () => {
    (await freshPage()).reportRcPrecheck("carol", "post");
    (await freshPage()).reportRcPrecheck("carol", "post");

    expect(sentry.captureMessage).toHaveBeenCalledTimes(1);
  });

  it("reports again on the next UTC day", async () => {
    (await freshPage()).reportRcPrecheck("carol", "post");
    vi.setSystemTime(new Date("2026-11-23T00:00:01Z"));
    (await freshPage()).reportRcPrecheck("carol", "post");

    expect(sentry.captureMessage).toHaveBeenCalledTimes(2);
  });

  it("falls back to once per page load when storage throws", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    const { reportRcPrecheck } = await freshPage();

    expect(() => reportRcPrecheck("carol", "post")).not.toThrow();
    reportRcPrecheck("carol", "post");

    expect(sentry.captureMessage).toHaveBeenCalledTimes(1);
  });

  it("sends nothing without an account", async () => {
    (await freshPage()).reportRcPrecheck(undefined, "post");

    expect(sentry.captureMessage).not.toHaveBeenCalled();
  });

  it("never throws when Sentry does", async () => {
    sentry.captureMessage.mockImplementation(() => {
      throw new Error("sentry down");
    });
    const { reportRcPrecheck } = await freshPage();

    let thrown: unknown = null;
    try {
      reportRcPrecheck("erin", "post");
    } catch (e) {
      thrown = e;
    }

    expect(sentry.captureMessage).toHaveBeenCalledTimes(1);
    expect(thrown).toBeNull();
  });
});
