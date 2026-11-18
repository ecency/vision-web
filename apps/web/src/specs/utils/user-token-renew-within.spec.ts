import { afterEach, describe, expect, it, vi } from "vitest";

const renew = vi.hoisted(() => ({ impl: (() => new Promise(() => {})) as (rt: string) => Promise<any> }));
vi.mock("@ecency/sdk", () => ({ hsTokenRenew: (rt: string) => renew.impl(rt) }));
vi.unmock("@/utils/user-token");

import * as ls from "@/utils/local-storage";
import { encodeObj } from "@/utils/encoder";
import { ensureValidTokenWithin, getAccessToken } from "@/utils/user-token";

// A renewal that never answers must not hold up the request that needs the
// token: after the limit the helper returns the stored token as it is.
const storeExpired = (username: string) =>
  ls.set(
    `user_${username}`,
    encodeObj({
      username,
      accessToken: "cached",
      refreshToken: "refresh",
      expiresIn: 60,
      tokenObtainedAt: Date.now() - 10 * 24 * 3600 * 1000
    })
  );

describe("ensureValidTokenWithin", () => {
  afterEach(() => {
    vi.useRealTimers();
    localStorage.clear();
  });

  it("waits the whole limit for a stalled renewal, then gives the stored token", async () => {
    vi.useFakeTimers();
    storeExpired("alice");
    let answer: (v: unknown) => void = () => {};
    renew.impl = () => new Promise((r) => (answer = r));
    let settled: string | undefined | null = null;
    void ensureValidTokenWithin("alice", 5000).then((t) => (settled = t));

    await vi.advanceTimersByTimeAsync(4999);
    expect(settled).toBeNull();
    await vi.advanceTimersByTimeAsync(1);
    expect(settled).toBe("cached");

    // The renewal finishes later and stores its token for the next call.
    answer({ username: "alice", access_token: "fresh", refresh_token: "r2", expires_in: 604800 });
    await vi.advanceTimersByTimeAsync(0);
    await expect(ensureValidTokenWithin("alice", 5000)).resolves.toBe("fresh");
  });

  it("re-reads storage when a background renewal it joined fails", async () => {
    storeExpired("dave");
    let fail: (e: Error) => void = () => {};
    renew.impl = () => new Promise((_, reject) => (fail = reject));
    // A plain read starts a background renewal...
    expect(getAccessToken("dave")).toBe("cached");
    const result = ensureValidTokenWithin("dave", 5000);
    // ...another tab stores a fresh token meanwhile, then the renewal fails.
    ls.set(
      "user_dave",
      encodeObj({
        username: "dave",
        accessToken: "other-tab",
        refreshToken: "refresh2",
        expiresIn: 604800,
        tokenObtainedAt: Date.now()
      })
    );
    fail(new Error("down"));
    await expect(result).resolves.toBe("other-tab");
  });

  it("returns the stored token when renewal fails, starting no second renewal", async () => {
    storeExpired("carol");
    let calls = 0;
    renew.impl = async () => {
      calls++;
      throw new Error("down");
    };
    await expect(ensureValidTokenWithin("carol", 5000)).resolves.toBe("cached");
    await Promise.resolve();
    expect(calls).toBe(1);
  });

  it("returns the renewed token when renewal answers in time", async () => {
    storeExpired("bob");
    renew.impl = async () => ({ username: "bob", access_token: "fresh", refresh_token: "r2", expires_in: 604800 });
    await expect(ensureValidTokenWithin("bob", 5000)).resolves.toBe("fresh");
  });
});
