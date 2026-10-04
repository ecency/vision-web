import { describe, expect, it } from "vitest";
import type { AttackResult, Note, State } from "@ecency/raidstead";
import {
  aimOf,
  attackMessage,
  buildReport,
  chestBlock,
  countdown,
  errorMessage,
  GNATS_SHOWN,
  impactOf,
  newNotes,
  noteId,
  noteText,
  pestCalendar,
  pickNeighbors,
  rallyBlock,
  tierOf,
  twinSide,
  worldOf
} from "@/features/raidstead/game";

// Keys come back with their values, so the assertions read the chosen message.
const t = (key: string, values?: Record<string, unknown>) =>
  values
    ? `${key.split(".").slice(-1)[0]}|${Object.entries(values)
        .map(([k, v]) => `${k}=${v}`)
        .join(",")}`
    : key.split(".").slice(-1)[0];

function state(boss: Partial<NonNullable<State["alliance"]>["boss"]> = {}): State {
  return {
    calendar: {
      season: 1,
      day: 3,
      week: 1,
      resting: false,
      startsAt: "2026-10-05T00:00:00.000Z",
      nextDayAt: ""
    },
    account: { name: "ann", karma: 60, shards: 3, kills: 1, scouts: 2, badges: [] },
    trophies: [],
    alliance: {
      community: "hive-123456",
      title: "Ink & Oak",
      week: 1,
      boss: {
        kind: "beetle",
        hp: 400,
        maxHp: 600,
        alive: true,
        phase: 2,
        gnats: 0,
        waspHp: 0,
        weakness: null,
        echo: null,
        reshuffleAt: null,
        ...boss
      },
      town: { tower: 1, workshop: 0, trophy: 0, hall: 2, library: 0, beacon: 0, walls: 0 },
      mats: 80,
      web: "tower",
      webTalk: [],
      chest: 0,
      chestGoal: 1000,
      buffToday: false,
      kills: 0,
      raiders: [
        { account: "ann", damage: 40, attacks: 5 },
        { account: "bob", damage: 12, attacks: 2 }
      ],
      notes: []
    },
    member: {
      energy: 4,
      maxEnergy: 15,
      scoutsLeft: 1,
      rallied: false,
      quests: [],
      powers: [],
      equipped: [],
      slots: 0,
      attackDays: 2
    }
  };
}
const hit = (r: Partial<AttackResult> & { hit: AttackResult["hit"] }) =>
  ({ energy: 3, hp: 1, maxHp: 600, ...r }) as AttackResult;

describe("raidstead game helpers", () => {
  it("maps the server state to the scene", () => {
    expect(worldOf(state({ gnats: 3, waspHp: 2 }), "town")).toMatchObject({
      view: "town",
      boss: { kind: "beetle", alive: true },
      gnats: 3,
      wasp: true,
      web: "tower"
    });
    // no alliance yet: the beetle waits on the meadow
    expect(worldOf({ ...state(), alliance: null }, "town")).toMatchObject({
      view: "raid",
      boss: { kind: "beetle", alive: true },
      gnats: 0
    });
  });

  it("aims at the shield first, then the wasp, then the boss", () => {
    expect(aimOf(state({ gnats: 2, waspHp: 3 }))).toBe("gnat");
    expect(aimOf(state({ waspHp: 3 }))).toBe("wasp");
    expect(aimOf(state())).toBe("boss");
    expect(aimOf(null)).toBe("boss");
  });

  it("turns results into impacts and one-line messages", () => {
    expect(impactOf(hit({ hit: "wasp", dodged: true, waspHp: 3 }))).toEqual({
      kind: "wasp",
      dodged: true
    });
    expect(
      impactOf(
        hit({
          hit: "boss",
          damage: 12,
          weak: true,
          killed: false,
          paired: null,
          phaseShift: false,
          gnatsSpawned: 0,
          waspArrived: false
        })
      )
    ).toEqual({ kind: "boss", weak: true, killed: false });
    expect(attackMessage(hit({ hit: "gnat", cleared: 1, gnatsLeft: 0 }), "ink", t)).toBe(
      "gnat-last"
    );
    expect(
      attackMessage(
        hit({
          hit: "boss",
          damage: 12,
          weak: true,
          killed: false,
          paired: null,
          phaseShift: true,
          gnatsSpawned: 5,
          waspArrived: false
        }),
        "forge",
        t
      )
    ).toBe("hit-weak|type=forge,dmg=12 shift gnats-spawn|n=5");
    expect(
      attackMessage(
        hit({
          hit: "boss",
          damage: 24,
          weak: true,
          killed: false,
          paired: { by: "bob", damage: 12 },
          phaseShift: false,
          gnatsSpawned: 0,
          waspArrived: false
        }),
        "ink",
        t
      )
    ).toBe("paired|dmg=24,by=bob");
    expect(
      attackMessage(
        hit({
          hit: "boss",
          damage: 6,
          weak: false,
          killed: true,
          paired: null,
          phaseShift: false,
          gnatsSpawned: 0,
          waspArrived: false
        }),
        "ink",
        t
      )
    ).toBe("killed");
  });

  it("explains errors without leaking codes", () => {
    expect(errorMessage({ status: 402, code: "insufficient_points", message: "x" }, t)).toBe(
      "insufficient_points"
    );
    expect(errorMessage({ status: 429, code: "error", message: "Rate limit" }, t)).toBe("rate");
    expect(errorMessage({ status: 429, code: "daily_cap", message: "x" }, t)).toBe("daily_cap");
    expect(
      errorMessage({ status: 409, code: "no_scouts", message: "No scouts left today." }, t)
    ).toBe("No scouts left today.");
    expect(errorMessage({ status: 409, code: "already_applied", message: "x" }, t)).toBe(
      "already_applied"
    );
    expect(errorMessage({ status: 409, code: "key_used", message: "x" }, t)).toBe("key_used");
    expect(errorMessage(new Error("boom"), t)).toBe("generic");
  });

  it("drafts a report the player can post", () => {
    const r = buildReport(state(), t)!;
    expect(r.title).toBe("post-title|name=Ink & Oak,boss=name,week=1");
    expect(r.body).toContain("intro-fighting|name=Ink & Oak,boss=name");
    expect(r.body).toContain("line|i=1,name=ann,dmg=40");
    expect(r.body).toContain("town|hall=2,mats=80");
    expect(buildReport({ ...state(), alliance: null }, t)).toBeNull();
  });

  it("keeps a community title as text in the report body", () => {
    const s = state();
    s.alliance!.title = "[Win](https://x.test) ![i](y) # *b*";
    const r = buildReport(s, t)!;
    expect(r.body).toContain("name=\\[Win\\]\\(https://x.test\\) \\!\\[i\\]\\(y\\) \\# \\*b\\*");
    // the post title is plain text: unchanged
    expect(r.title).toContain("name=[Win](https://x.test) ![i](y) # *b*");
  });

  it("picks the alliances shown in the sky", () => {
    const r = (community: string, league: string) => ({
      community,
      title: community,
      members: 10,
      kills: 0,
      damage: 0,
      league
    });
    // best first, as the leaderboard answers
    const rows = [
      r("s1", "small"),
      r("m1", "medium"),
      r("s2", "small"),
      r("s3", "small"),
      r("me", "small"),
      r("s5", "small"),
      r("l1", "large"),
      r("m2", "medium")
    ];
    const got = pickNeighbors(rows, "me", 6);
    // own league nearest in rank first (me is 4th small), then the rest by rank
    expect(got.map((x) => x.community)).toEqual(["s3", "s5", "s2", "s1", "m1", "l1"]);
    expect(got.find((x) => x.community === "m1")!.rank).toBe(1);
    expect(got.some((x) => x.community === "me")).toBe(false);
    // not on the board yet: the leaders
    expect(pickNeighbors(rows, "hive-new", 3).map((x) => x.community)).toEqual(["s1", "m1", "l1"]);
  });

  it("karma tiers", () => {
    expect([0, 49, 50, 150, 399, 400, 1000, 5000].map(tierOf)).toEqual([0, 0, 1, 2, 2, 3, 4, 4]);
  });
});

describe("what the page decides before asking the server", () => {
  it("draws a swarm of gnats at most, however big the shield is", () => {
    expect(worldOf(state({ gnats: 3 }), "raid").gnats).toBe(3);
    expect(worldOf(state({ gnats: 83 }), "raid").gnats).toBe(GNATS_SHOWN);
  });

  it("goes for the other twin while hits wait on one, and takes its turn otherwise", () => {
    const now = 1_000_000;
    const waiting = (side: 0 | 1, until: number) => ({ echo: { side, by: "bob", until, hits: 1 } });
    expect(twinSide(waiting(0, now + 2000), now, 0)).toBe(1);
    expect(twinSide(waiting(1, now + 2000), now, 1)).toBe(0);
    // the wait is over (by the server's clock): the player's own turn
    expect(twinSide(waiting(0, now), now, 0)).toBe(0);
    expect(twinSide(waiting(1, now - 1), now, 1)).toBe(1);
    expect(twinSide({ echo: null }, now, 1)).toBe(1);
  });

  it("says a twins hit paired with the player's own waiting hit is theirs alone", () => {
    const pair = (by: string) =>
      hit({
        hit: "boss",
        damage: 24,
        weak: true,
        paired: { by, damage: 12, hits: 1 },
        killed: false,
        phaseShift: false,
        gnatsSpawned: 0,
        waspArrived: false
      });
    expect(attackMessage(pair("bob"), "ink", t, "ann")).toBe("paired|dmg=24,by=bob");
    expect(attackMessage(pair("ann"), "ink", t, "ann")).toBe("paired-self|dmg=24");
    expect(attackMessage(pair("ann"), "ink", t)).toBe("paired|dmg=24,by=ann");
  });

  it("knows when a rally would be for nothing", () => {
    const s = state();
    s.member!.energy = 10;
    expect(rallyBlock(s)).toBeNull();
    s.member!.energy = 11;
    expect(rallyBlock(s)).toBe("full");
    s.member!.energy = 0;
    s.alliance!.boss.alive = false;
    expect(rallyBlock(s)).toBe("no-boss");
    s.alliance!.boss.alive = true;
    s.calendar.resting = true;
    expect(rallyBlock(s)).toBe("resting");
    s.member!.rallied = true;
    expect(rallyBlock(s)).toBe("rallied");
    expect(rallyBlock(null)).toBe("no-boss");
  });

  it("knows when the war chest takes no gift", () => {
    const s = state();
    expect(chestBlock(s)).toBeNull();
    s.alliance!.boss.alive = false;
    expect(chestBlock(s)).toBeNull(); // kept for the next pest
    s.alliance!.week = 4;
    expect(chestBlock(s)).toBe("no-boss"); // no next pest this season
    s.alliance!.boss.alive = true;
    expect(chestBlock(s)).toBeNull();
    s.alliance!.buffKept = true;
    expect(chestBlock(s)).toBe("kept");
    s.alliance!.buffToday = true;
    expect(chestBlock(s)).toBe("active");
    s.alliance!.buffToday = false;
    s.alliance!.buffKept = false;
    s.calendar.resting = true;
    expect(chestBlock(s)).toBe("resting");
  });
});

describe("town news", () => {
  const notes: Note[] = [
    { day: 1, kind: "copied", n: 45, text: "server line" },
    { day: 2, kind: "copied", n: 45, text: "server line" },
    { day: 3, kind: "webbed", what: "tower", text: "server line" },
    { day: 4, kind: "killed", what: "beetle", who: "bob", text: "server line" }
  ];

  it("puts each kind in the reader's words, and keeps the server's line for a kind it does not know", () => {
    expect(notes.map((n) => noteText(n, t))).toEqual([
      "copied|n=45",
      "copied|n=45",
      "webbed|name=name",
      "killed|name=name,who=bob"
    ]);
    expect(noteText({ day: 5, kind: "chest_kept", who: "ann", text: "x" }, t)).toBe("chest_kept|who=ann");
    expect(noteText({ day: 5, kind: "web_gone", what: "hall", text: "x" }, t)).toBe("web_gone|name=name");
    expect(noteText({ day: 5, kind: "escaped", what: "slug", text: "x" }, t)).toBe("escaped|name=name");
    expect(noteText({ day: 5, kind: "healed", n: 60, text: "x" }, t)).toBe("healed|n=60");
    expect(noteText({ day: 5, kind: "something-new", text: "The server's own line." }, t)).toBe("The server's own line.");
    expect(noteText({ day: 5, text: "From an older server." }, t)).toBe("From an older server.");
  });

  it("finds what came after the last line seen", () => {
    expect(newNotes(notes, null)).toEqual(notes);
    expect(newNotes(notes, noteId(notes[1]))).toEqual(notes.slice(2));
    expect(newNotes(notes, noteId(notes[3]))).toEqual([]);
    // the same thing two days running is two lines
    expect(noteId(notes[0])).not.toBe(noteId(notes[1]));
    // the line seen has rolled off the list: all of it is new
    expect(newNotes(notes.slice(2), noteId(notes[0]))).toEqual(notes.slice(2));
    expect(newNotes([], "anything")).toEqual([]);
  });
});

describe("countdown", () => {
  const at = Date.parse("2026-10-10T00:00:00Z");
  it("splits the time left into days, hours, minutes and seconds", () => {
    expect(countdown(at, at - (2 * 86_400 + 3 * 3_600 + 4 * 60 + 5) * 1000)).toEqual({ days: 2, hours: 3, minutes: 4, seconds: 5, done: false });
  });
  it("rounds a part second up, so it never shows zero early", () => {
    expect(countdown(at, at - 200)).toMatchObject({ seconds: 1, done: false });
  });
  it("stops at zero", () => {
    expect(countdown(at, at + 5000)).toEqual({ days: 0, hours: 0, minutes: 0, seconds: 0, done: true });
  });
});

describe("pestCalendar", () => {
  const start = "2026-10-10T00:00:00.000Z";
  const shown = (c: Parameters<typeof pestCalendar>[0]) => pestCalendar(c).map((w) => w.revealed);

  it("lists the four weeks in the server's order, a week apart", () => {
    const weeks = pestCalendar({ season: 0, week: 0, resting: true, startsAt: start });
    expect(weeks.map((w) => [w.week, w.kind])).toEqual([[1, "beetle"], [2, "slug"], [3, "twins"], [4, "queen"]]);
    expect(weeks.map((w) => new Date(w.at).toISOString().slice(0, 10))).toEqual(["2026-10-10", "2026-10-17", "2026-10-24", "2026-10-31"]);
  });

  it("before the first season shows only the opening pest", () => {
    expect(shown({ season: 0, week: 0, resting: true, startsAt: start })).toEqual([true, false, false, false]);
  });

  it("shows each pest from its own week on, and all of them once the season rests", () => {
    expect(shown({ season: 1, week: 1, resting: false, startsAt: start })).toEqual([true, false, false, false]);
    expect(shown({ season: 1, week: 3, resting: false, startsAt: start })).toEqual([true, true, true, false]);
    expect(shown({ season: 1, week: 4, resting: false, startsAt: start })).toEqual([true, true, true, true]);
    expect(shown({ season: 1, week: 4, resting: true, startsAt: start })).toEqual([true, true, true, true]);
    // a new season reveals week by week again
    expect(shown({ season: 2, week: 1, resting: false, startsAt: start })).toEqual([true, false, false, false]);
  });
});
