import { afterEach, describe, expect, it, vi } from "vitest";

const renew = vi.hoisted(() => ({ impl: (() => new Promise(() => {})) as (rt: string) => Promise<any> }));
vi.mock("@ecency/sdk", () => ({ hsTokenRenew: (rt: string) => renew.impl(rt) }));
vi.unmock("@/utils/user-token");

import * as ls from "@/utils/local-storage";
import { encodeObj } from "@/utils/encoder";
import { ensureValidTokenWithin } from "@/utils/user-token";

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

  it("gives up after the limit when renewal stalls, with the stored token", async () => {
    vi.useFakeTimers();
    storeExpired("alice");
    renew.impl = () => new Promise(() => {});
    const result = ensureValidTokenWithin("alice", 5000);
    await vi.advanceTimersByTimeAsync(5000);
    await expect(result).resolves.toBe("cached");
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
