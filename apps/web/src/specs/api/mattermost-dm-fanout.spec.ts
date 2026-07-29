import { describe, it, expect, beforeEach } from "vitest";
import {
  checkDmFanout,
  dmFanoutLimitFor,
  DM_FANOUT_MAX,
  DM_FANOUT_MAX_NEW,
  DM_FANOUT_NEW_ACCOUNT_MS,
  DM_FANOUT_WINDOW_MS
} from "@/server/chat-dm-fanout";

// The limiter is the only thing standing between a freshly created account and
// a mass-DM spray, so these exercise the real code path against an in-memory
// stand-in for the sorted set it keeps, rather than mocking the decision away.

type Entry = { member: string; score: number };

/**
 * Stands in for the sorted-set state the reserve script operates on. `eval`
 * reimplements that script's semantics: trim by score, look up membership,
 * count, and insert only when under the cap. Crucially it runs to completion
 * without interleaving, which is the property the real script buys and the
 * reason the parallel-spray test below is meaningful.
 */
class FakeRedis {
  sets = new Map<string, Entry[]>();
  ttls = new Map<string, number>();
  failOn: string | null = null;

  private entries(key: string) {
    let e = this.sets.get(key);
    if (!e) {
      e = [];
      this.sets.set(key, e);
    }
    return e;
  }

  async eval(_script: string, _numKeys: number, key: string, ...args: string[]) {
    if (this.failOn === "eval") throw new Error("redis down");
    const [now, windowMs, limit, member] = [
      Number(args[0]),
      Number(args[1]),
      Number(args[2]),
      args[3]
    ];

    this.sets.set(
      key,
      this.entries(key).filter((e) => e.score > now - windowMs)
    );

    const list = this.entries(key);
    const known = list.find((e) => e.member === member);
    const count = list.length;

    if (!known && count >= limit) {
      const sorted = [...list].sort((a, b) => a.score - b.score);
      return [0, count, sorted.length ? sorted[0].score : -1];
    }

    if (known) {
      known.score = now;
    } else {
      list.push({ member, score: now });
    }
    this.ttls.set(key, windowMs);

    return known ? [1, count, -1] : [1, count + 1, -1];
  }

}

const NOW = 1_800_000_000_000;

function send(redis: FakeRedis, channelId: string, opts: { at?: number; createdAt?: number } = {}) {
  return checkDmFanout(
    {
      userId: "u-1",
      channelId,
      accountCreatedAt: opts.createdAt ?? NOW - DM_FANOUT_NEW_ACCOUNT_MS - 1, // established
      now: opts.at ?? NOW
    },
    redis as never
  );
}

const NEW_ACCOUNT = NOW - 60_000;

describe("dmFanoutLimitFor", () => {
  it("gives an account new to chat the tighter cap", () => {
    expect(dmFanoutLimitFor(NOW - 60_000, NOW)).toBe(DM_FANOUT_MAX_NEW);
  });

  it("gives an established account the normal cap", () => {
    expect(dmFanoutLimitFor(NOW - DM_FANOUT_NEW_ACCOUNT_MS - 1, NOW)).toBe(DM_FANOUT_MAX);
  });

  // Treating "unknown" as new would throttle every user to the tight cap if
  // Mattermost ever stopped returning create_at.
  it("treats a missing or impossible creation time as established", () => {
    expect(dmFanoutLimitFor(undefined, NOW)).toBe(DM_FANOUT_MAX);
    expect(dmFanoutLimitFor(0, NOW)).toBe(DM_FANOUT_MAX);
    expect(dmFanoutLimitFor(NaN, NOW)).toBe(DM_FANOUT_MAX);
    expect(dmFanoutLimitFor(NOW + 60_000, NOW)).toBe(DM_FANOUT_MAX);
  });
});

describe("checkDmFanout", () => {
  let redis: FakeRedis;

  beforeEach(() => {
    redis = new FakeRedis();
  });

  it("blocks a new account once it passes the distinct-recipient cap", async () => {
    for (let i = 0; i < DM_FANOUT_MAX_NEW; i++) {
      const ok = await send(redis, `dm-${i}`, { createdAt: NEW_ACCOUNT });
      expect(ok.allowed).toBe(true);
    }

    const blocked = await send(redis, "dm-overflow", { createdAt: NEW_ACCOUNT });

    expect(blocked.allowed).toBe(false);
    expect(blocked.limit).toBe(DM_FANOUT_MAX_NEW);
    expect(blocked.recipients).toBe(DM_FANOUT_MAX_NEW);
  });

  it("does not record the recipient it rejected", async () => {
    for (let i = 0; i < DM_FANOUT_MAX_NEW; i++) {
      await send(redis, `dm-${i}`, { createdAt: NEW_ACCOUNT });
    }
    await send(redis, "dm-overflow", { createdAt: NEW_ACCOUNT });

    // A blocked attempt must not consume a slot or extend the window, or a
    // spammer would push their own earlier recipients out and reset the cap.
    expect(redis.sets.get("chat:dmfanout:u-1")).toHaveLength(DM_FANOUT_MAX_NEW);
  });

  // The cap is on how many people you reach, not how much you say to them.
  it("keeps letting a capped account reply to people it already messaged", async () => {
    for (let i = 0; i < DM_FANOUT_MAX_NEW; i++) {
      await send(redis, `dm-${i}`, { createdAt: NEW_ACCOUNT });
    }

    const reply = await send(redis, "dm-0", { createdAt: NEW_ACCOUNT });

    expect(reply.allowed).toBe(true);
    expect(reply.recipients).toBe(DM_FANOUT_MAX_NEW); // not counted twice
  });

  it("lets an established account reach further than a new one", async () => {
    for (let i = 0; i < DM_FANOUT_MAX_NEW + 1; i++) {
      const res = await send(redis, `dm-${i}`);
      expect(res.allowed).toBe(true);
      expect(res.limit).toBe(DM_FANOUT_MAX);
    }
  });

  it("frees a slot once a recipient ages out of the window", async () => {
    for (let i = 0; i < DM_FANOUT_MAX_NEW; i++) {
      await send(redis, `dm-${i}`, { createdAt: NEW_ACCOUNT, at: NOW });
    }

    const later = NOW + DM_FANOUT_WINDOW_MS + 1;
    const res = await send(redis, "dm-fresh", { createdAt: NEW_ACCOUNT, at: later });

    expect(res.allowed).toBe(true);
    expect(res.recipients).toBe(1);
  });

  it("reports how long the block lasts", async () => {
    for (let i = 0; i < DM_FANOUT_MAX_NEW; i++) {
      await send(redis, `dm-${i}`, { createdAt: NEW_ACCOUNT, at: NOW + i * 1000 });
    }

    const at = NOW + 10_000;
    const blocked = await send(redis, "dm-overflow", { createdAt: NEW_ACCOUNT, at });

    // Oldest entry was written at NOW, so it ages out one window after that.
    expect(blocked.retryAfterSeconds).toBe(Math.ceil((NOW + DM_FANOUT_WINDOW_MS - at) / 1000));
  });

  // Redis is a spam control, not a dependency of the product. Losing it must
  // never stop people from talking; the out-of-band monitor is the backstop.
  it("allows the send when redis is unavailable", async () => {
    const res = await checkDmFanout(
      { userId: "u-1", channelId: "dm-1", accountCreatedAt: NEW_ACCOUNT, now: NOW },
      null
    );
    expect(res.allowed).toBe(true);
  });

  it("allows the send when a redis command fails", async () => {
    redis.failOn = "eval";
    const res = await send(redis, "dm-1", { createdAt: NEW_ACCOUNT });
    expect(res.allowed).toBe(true);
  });

  // A read-then-write pipeline loses to exactly this: fire the spray in
  // parallel and every request sees a count below the cap before any writes.
  it("holds the cap when the whole spray is sent in parallel", async () => {
    const targets = Array.from({ length: DM_FANOUT_MAX_NEW * 3 }, (_, i) => `dm-${i}`);

    const results = await Promise.all(
      targets.map((channelId) => send(redis, channelId, { createdAt: NEW_ACCOUNT }))
    );

    expect(results.filter((r) => r.allowed)).toHaveLength(DM_FANOUT_MAX_NEW);
    expect(redis.sets.get("chat:dmfanout:u-1")).toHaveLength(DM_FANOUT_MAX_NEW);
  });
});
