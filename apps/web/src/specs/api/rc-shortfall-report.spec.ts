import { beforeEach, describe, expect, it, vi } from "vitest";

const sentry = vi.hoisted(() => ({ captureMessage: vi.fn() }));
vi.mock("@/core/sentry/lazy-sentry", () => ({ sentry }));

import { reportRcPrecheck, reportRcRejection } from "@/api/rc-shortfall-report";

const rcRejection = () => new Error("Account: alice has 100 RC, needs 2000 RC. Please wait to transact or power up HIVE.");

// #2196: out-of-RC events are counted in Sentry as one grouped info message.
describe("reportRcRejection", () => {
  beforeEach(() => {
    sentry.captureMessage.mockReset();
  });

  it("sends one info message with the shared shape", () => {
    reportRcRejection(rcRejection(), "post", "alice");

    expect(sentry.captureMessage).toHaveBeenCalledTimes(1);
    expect(sentry.captureMessage).toHaveBeenCalledWith("rc-shortfall", {
      level: "info",
      fingerprint: ["rc-shortfall"],
      tags: { "rc.stage": "rejected", "rc.op": "post" },
      user: { username: "alice" }
    });
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
  beforeEach(() => {
    sentry.captureMessage.mockReset();
  });

  it("reports once per account per page session", () => {
    reportRcPrecheck("carol", "vote");
    reportRcPrecheck("carol", "comment");
    reportRcPrecheck("dave", "post");

    expect(sentry.captureMessage).toHaveBeenCalledTimes(2);
    expect(sentry.captureMessage).toHaveBeenNthCalledWith(1, "rc-shortfall", {
      level: "info",
      fingerprint: ["rc-shortfall"],
      tags: { "rc.stage": "precheck", "rc.op": "vote" },
      user: { username: "carol" }
    });
  });

  it("sends nothing without an account", () => {
    reportRcPrecheck(undefined, "post");

    expect(sentry.captureMessage).not.toHaveBeenCalled();
  });

  it("never throws when Sentry does", () => {
    sentry.captureMessage.mockImplementation(() => {
      throw new Error("sentry down");
    });

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
