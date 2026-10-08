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
    const [now, windowMs, limit] = [Number(args[0]), Number(args[1]), Number(args[2])];
    const members = args.slice(3);

    this.sets.set(
      key,
      this.entries(key).filter((e) => e.score > now - windowMs)
    );

    const list = this.entries(key);
    const count = list.length;
    const fresh = members.filter((m) => !list.some((e) => e.member === m)).length;

    if (fresh > 0 && count + fresh > limit) {
      const outside = [...list]
        .sort((a, b) => a.score - b.score)
        .filter((e) => !members.includes(e.member));
      const freeing = outside[count + fresh - limit - 1];
      return [0, count, freeing ? freeing.score : -1];
    }

    for (const member of members) {
      const known = list.find((e) => e.member === member);
      if (known) {
        known.score = now;
      } else {
        list.push({ member, score: now });
      }
    }
    this.ttls.set(key, windowMs);

    return [1, count + fresh, -1];
  }

}

const NOW = 1_800_000_000_000;

function send(
  redis: FakeRedis,
  recipient: string | string[],
  opts: { at?: number; createdAt?: number } = {}
) {
  return checkDmFanout(
    {
      userId: "u-1",
      recipients: Array.isArray(recipient) ? recipient : [recipient],
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
      expect(ok.measured).toBe(true);
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
    expect(redis.sets.get("chat:dmfanout:v2:u-1")).toHaveLength(DM_FANOUT_MAX_NEW);
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
      { userId: "u-1", recipients: ["dm-1"], accountCreatedAt: NEW_ACCOUNT, now: NOW },
      null
    );
    expect(res.allowed).toBe(true);
    expect(res.measured).toBe(false);
  });

  it("allows the send when a redis command fails", async () => {
    redis.failOn = "eval";
    const res = await send(redis, "dm-1", { createdAt: NEW_ACCOUNT });
    expect(res.allowed).toBe(true);
    expect(res.measured).toBe(false);
  });

  // A read-then-write pipeline loses to exactly this: fire the spray in
  // parallel and every request sees a count below the cap before any writes.
  it("holds the cap when the whole spray is sent in parallel", async () => {
    const targets = Array.from({ length: DM_FANOUT_MAX_NEW * 3 }, (_, i) => `dm-${i}`);

    const results = await Promise.all(
      targets.map((recipient) => send(redis, recipient, { createdAt: NEW_ACCOUNT }))
    );

    expect(results.filter((r) => r.allowed)).toHaveLength(DM_FANOUT_MAX_NEW);
    expect(redis.sets.get("chat:dmfanout:v2:u-1")).toHaveLength(DM_FANOUT_MAX_NEW);
  });

  // A group reaches every member, so it costs one slot per member.
  it("counts every member of a group as a recipient", async () => {
    const res = await send(redis, ["a", "b", "c"], { createdAt: NEW_ACCOUNT });

    expect(res.allowed).toBe(true);
    expect(res.recipients).toBe(3);
    expect(redis.sets.get("chat:dmfanout:v2:u-1")).toHaveLength(3);
  });

  it("rejects a group that does not fit and records none of its members", async () => {
    for (let i = 0; i < DM_FANOUT_MAX_NEW - 2; i++) {
      await send(redis, `dm-${i}`, { createdAt: NEW_ACCOUNT });
    }

    const blocked = await send(redis, ["x", "y", "z"], { createdAt: NEW_ACCOUNT });

    expect(blocked.allowed).toBe(false);
    expect(redis.sets.get("chat:dmfanout:v2:u-1")).toHaveLength(DM_FANOUT_MAX_NEW - 2);
  });

  it("only charges a group for the members not already messaged", async () => {
    for (let i = 0; i < DM_FANOUT_MAX_NEW - 1; i++) {
      await send(redis, `dm-${i}`, { createdAt: NEW_ACCOUNT });
    }

    const res = await send(redis, ["dm-0", "dm-1", "fresh"], { createdAt: NEW_ACCOUNT });

    expect(res.allowed).toBe(true);
    expect(res.recipients).toBe(DM_FANOUT_MAX_NEW);
  });

  it("does not count duplicates or empty ids", async () => {
    const res = await send(redis, ["a", "a", ""], { createdAt: NEW_ACCOUNT });

    expect(res.recipients).toBe(1);
  });

  it("has nothing to measure for a conversation with no other member", async () => {
    const res = await send(redis, [], { createdAt: NEW_ACCOUNT });

    expect(res.allowed).toBe(true);
    expect(redis.sets.get("chat:dmfanout:v2:u-1")).toBeUndefined();
  });

  // Freeing the oldest slot is not enough when a group needs several.
  it("reports when enough slots free up for the whole group", async () => {
    for (let i = 0; i < DM_FANOUT_MAX_NEW; i++) {
      await send(redis, `dm-${i}`, { createdAt: NEW_ACCOUNT, at: NOW + i * 1000 });
    }

    const at = NOW + 10_000;
    const blocked = await send(redis, ["x", "y", "z"], { createdAt: NEW_ACCOUNT, at });

    // Three slots are needed, so the third oldest entry (written at NOW + 2s) decides.
    expect(blocked.retryAfterSeconds).toBe(
      Math.ceil((NOW + 2000 + DM_FANOUT_WINDOW_MS - at) / 1000)
    );
  });

  // Retrying when an entry that belongs to the send expires would fail again,
  // because that member then has to be re-added alongside the new one.
  it("ignores the send's own members when reporting when it fits", async () => {
    for (let i = 0; i < DM_FANOUT_MAX_NEW; i++) {
      await send(redis, `dm-${i}`, { createdAt: NEW_ACCOUNT, at: NOW + i * 1000 });
    }

    const at = NOW + 10_000;
    const blocked = await send(redis, ["dm-0", "x"], { createdAt: NEW_ACCOUNT, at });

    // dm-0 (written at NOW) is part of the send, so dm-1 (NOW + 1s) decides.
    expect(blocked.retryAfterSeconds).toBe(
      Math.ceil((NOW + 1000 + DM_FANOUT_WINDOW_MS - at) / 1000)
    );
  });

  it("keeps mention joins on their own budget, apart from direct messages", async () => {
    const mention = (i: number) =>
      checkDmFanout(
        { userId: "u-1", recipients: [`m-${i}`], accountCreatedAt: NEW_ACCOUNT, now: NOW, scope: "mention" },
        redis as never
      );
    for (let i = 0; i < DM_FANOUT_MAX_NEW; i++) {
      expect((await mention(i)).allowed).toBe(true);
    }
    expect((await mention(99)).allowed).toBe(false);

    // The DM budget is untouched by the mentions above.
    const dm = await send(redis, "dm-0", { createdAt: NEW_ACCOUNT });
    expect(dm.allowed).toBe(true);
    expect(dm.recipients).toBe(1);
  });
});
