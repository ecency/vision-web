import { describe, it, expect } from "vitest";
import { isBootstrapBanError, shouldRetryBootstrap } from "@/features/chat/mattermost-api";

// Bootstrap answers 403 for an account whose chat ban is still live. React
// Query must treat that as final: the retry predicate only suppressed auth
// errors, so a ban would otherwise be retried three times and re-run on every
// window focus, re-verifying the token and re-fetching subscriptions each time
// for an answer that cannot change until the ban expires.

describe("bootstrap retry policy — a ban is final, not a fault", () => {
  it("does not retry a 403", () => {
    const banned = Object.assign(new Error("@spammer is banned from chat until ..."), {
      status: 403
    });

    expect(isBootstrapBanError(banned)).toBe(true);
    expect(shouldRetryBootstrap(0, banned)).toBe(false);
  });

  it("still retries transient failures, still capped at 3", () => {
    const outage = Object.assign(new Error("chat service unavailable"), { status: 503 });

    expect(isBootstrapBanError(outage)).toBe(false);
    expect(shouldRetryBootstrap(0, outage)).toBe(true);
    expect(shouldRetryBootstrap(3, outage)).toBe(false);
  });

  it("still refuses to retry auth errors", () => {
    const unauthorized = Object.assign(new Error("unauthorized"), { status: 401 });

    expect(shouldRetryBootstrap(0, unauthorized)).toBe(false);
  });

  it("treats a bare error as retryable", () => {
    expect(isBootstrapBanError(new Error("network down"))).toBe(false);
    expect(isBootstrapBanError(null)).toBe(false);
    expect(shouldRetryBootstrap(0, new Error("network down"))).toBe(true);
  });
});
