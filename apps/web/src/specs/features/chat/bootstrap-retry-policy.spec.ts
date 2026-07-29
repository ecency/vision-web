import { describe, it, expect } from "vitest";
import {
  isBootstrapBanError,
  shouldRefetchBootstrapOnFocus,
  shouldRetryBootstrap
} from "@/features/chat/mattermost-api";

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

// Suppressing focus refetches outright would leave an open chat page dead for
// good: the ban expiring and a moderator lifting it early both only change the
// answer server-side, so the page has to look again to notice either.
describe("bootstrap focus-refetch policy — a ban must not be permanent", () => {
  const NOW = 1_800_000_000_000;

  function banError(bannedUntil?: number) {
    return Object.assign(new Error("@spammer is banned from chat until ..."), {
      status: 403,
      bannedUntil
    });
  }

  it("resumes as soon as the ban expires", () => {
    const error = banError(NOW - 1);
    expect(shouldRefetchBootstrapOnFocus(error, NOW - 1000, NOW)).toBe(true);
  });

  it("stays quiet on repeated focus while the ban is live", () => {
    const error = banError(NOW + 3_600_000);
    expect(shouldRefetchBootstrapOnFocus(error, NOW - 30_000, NOW)).toBe(false);
  });

  // Covers the moderator lifting a ban early: the client still holds the old
  // expiry, so only an occasional recheck can discover it.
  it("looks again occasionally so an early unban is picked up", () => {
    const error = banError(NOW + 3_600_000);
    expect(shouldRefetchBootstrapOnFocus(error, NOW - 5 * 60_000, NOW)).toBe(true);
  });

  it("throttles a 403 that carries no expiry rather than blocking it forever", () => {
    const error = banError(undefined);
    expect(shouldRefetchBootstrapOnFocus(error, NOW - 30_000, NOW)).toBe(false);
    expect(shouldRefetchBootstrapOnFocus(error, NOW - 5 * 60_000, NOW)).toBe(true);
  });

  it("never throttles ordinary errors", () => {
    const outage = Object.assign(new Error("chat service unavailable"), { status: 503 });
    expect(shouldRefetchBootstrapOnFocus(outage, NOW, NOW)).toBe(true);
    expect(shouldRefetchBootstrapOnFocus(null, NOW, NOW)).toBe(true);
  });
});
