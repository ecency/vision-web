import { describe, expect, it } from "vitest";
import type { AttackResult, Note, State } from "@ecency/raidstead";
import {
  aimOf,
  attackMessage,
  buildReport,
  chestBlock,
  chestHoursLeft,
  countdown,
  errorMessage,
  GNATS_SHOWN,
  impactOf,
  laterMark,
  markOf,
  newsAfter,
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
    // several waiting hits landed with this one: no single name is the whole story
    const many = hit({
      hit: "boss",
      damage: 36,
      weak: true,
      paired: { by: "bob", damage: 24, hits: 2 },
      killed: false,
      phaseShift: false,
      gnatsSpawned: 0,
      waspArrived: false
    });
    expect(attackMessage(many, "ink", t, "ann")).toBe("paired-many|dmg=36,n=2");
  });

  it("leaves the shift's own line out when the wasp arrives with it", () => {
    const shift = (waspArrived: boolean) =>
      hit({
        hit: "boss",
        damage: 12,
        weak: true,
        paired: null,
        killed: false,
        phaseShift: true,
        gnatsSpawned: 0,
        waspArrived
      });
    expect(attackMessage(shift(false), "ink", t)).toBe("hit-weak|type=ink,dmg=12 shift");
    // "scout again if you have a scout left" next to "scouting is free" would contradict itself
    expect(attackMessage(shift(true), "ink", t)).toBe("hit-weak|type=ink,dmg=12 wasp-arrives");
  });

  it("says a pest that is gone without being chased off got away", () => {
    const s = state({ alive: false, killed: false });
    expect(buildReport(s, t)!.body).toContain("intro-escaped");
    expect(buildReport(state({ alive: false, killed: true }), t)!.body).toContain("intro-won");
    // a server that does not say: as before
    expect(buildReport(state({ alive: false }), t)!.body).toContain("intro-won");
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

  it("tells war chest time put aside in whole hours, rounded up; gifts are taken meanwhile", () => {
    const H = 3_600_000;
    const s = state();
    expect(chestHoursLeft(s)).toBe(0);
    expect(chestHoursLeft(null)).toBe(0);
    for (const [ms, hours] of [[null, 0], [0, 0], [-5, 0], [1, 1], [H, 1], [H + 1, 2], [10 * H, 10]] as [number | null, number][]) {
      s.alliance!.buffLeft = ms;
      expect(chestHoursLeft(s), String(ms)).toBe(hours);
    }
    // hours put aside do not make the chest full
    s.alliance!.boss.alive = false;
    expect(chestBlock(s)).toBeNull();
  });
});

describe("town news", () => {
  const notes: Note[] = [
    { day: 1, kind: "copied", n: 45, text: "server line" },
    { day: 2, kind: "copied", n: 45, text: "server line" },
    { day: 3, kind: "webbed", what: "tower", text: "server line" },
    { day: 4, kind: "killed", what: "beetle", who: "bob", text: "server line" }
  ];

  // the whole key and its values, so the test sees WHICH name was looked up
  const full = (key: string, values?: Record<string, unknown>) =>
    values ? `${key} ${JSON.stringify(values)}` : key;

  it("puts each kind in the reader's words, and keeps the server's line for a kind it does not know", () => {
    expect(notes.map((n) => noteText(n, t))).toEqual([
      "copied|n=45",
      "copied|n=45",
      "webbed|name=name",
      "killed|name=name,who=bob"
    ]);
    expect(noteText(notes[2], full)).toBe('raidstead.news.webbed {"name":"raidstead.town.buildings.tower.name"}');
    expect(noteText(notes[3], full)).toBe('raidstead.news.killed {"name":"raidstead.bosses.beetle.name","who":"bob"}');
    expect(noteText({ day: 5, kind: "web_gone", what: "hall", text: "x" }, full)).toBe(
      'raidstead.news.web_gone {"name":"raidstead.town.buildings.hall.name"}'
    );
    expect(noteText({ day: 5, kind: "escaped", what: "slug", text: "x" }, full)).toBe(
      'raidstead.news.escaped {"name":"raidstead.bosses.slug.name"}'
    );
    expect(noteText({ day: 5, kind: "chest_kept", who: "ann", text: "x" }, t)).toBe("chest_kept|who=ann");
    expect(noteText({ day: 5, kind: "chest_open", text: "x" }, t)).toBe("chest_open");
    // with hours an earlier chest had left on top, the line says how long
    expect(noteText({ day: 5, kind: "chest_open", n: 26, text: "x" }, t)).toBe("chest_open_hours|n=26");
    expect(noteText({ day: 5, kind: "chest_saved", n: 10, text: "x" }, t)).toBe("chest_saved|n=10");
    expect(noteText({ day: 5, kind: "chest_back", n: 10, text: "x" }, t)).toBe("chest_back|n=10");
    // no hours to tell: the server's own line
    expect(noteText({ day: 5, kind: "chest_saved", text: "Hours wait." }, t)).toBe("Hours wait.");
    expect(noteText({ day: 5, kind: "chest_back", text: "Open again." }, t)).toBe("Open again.");
    expect(noteText({ day: 5, kind: "healed", n: 60, text: "x" }, t)).toBe("healed|n=60");
    expect(noteText({ day: 5, kind: "something-new", text: "The server's own line." }, t)).toBe("The server's own line.");
    expect(noteText({ day: 5, text: "From an older server." }, t)).toBe("From an older server.");
  });

  it("keeps the server's line for a building or a pest it has no name for", () => {
    const line = "The server's own line.";
    expect(noteText({ day: 5, kind: "webbed", what: "market", text: line }, t)).toBe(line);
    expect(noteText({ day: 5, kind: "web_gone", what: "beetle", text: line }, t)).toBe(line);
    expect(noteText({ day: 5, kind: "escaped", what: "hornet", text: line }, t)).toBe(line);
    expect(noteText({ day: 5, kind: "killed", what: "tower", who: "bob", text: line }, t)).toBe(line);
    expect(noteText({ day: 5, kind: "killed", who: "bob", text: line }, t)).toBe(line);
  });

  const numbered = notes.map((n, i) => ({ ...n, seq: i + 7 }));

  it("finds what came after the player's mark in numbered news", () => {
    expect(markOf(numbered)).toBe(10);
    expect(newsAfter(numbered, 0)).toEqual(numbered);
    expect(newsAfter(numbered, 8)).toEqual(numbered.slice(2));
    expect(newsAfter(numbered, 10)).toEqual([]);
    // an answer older than the mark (another tab has shown more): nothing new
    expect(newsAfter(numbered.slice(0, 2), 10)).toEqual([]);
    // lines that rolled off the list are not missed: what is left is still after the mark
    expect(newsAfter(numbered.slice(2), 7)).toEqual(numbered.slice(2));
    // a line from before the news was numbered, still on the list: older than any mark
    const mixed = [{ day: 1, text: "From before." }, ...numbered];
    expect(newsAfter(mixed, 8)).toEqual(numbered.slice(2));
    expect(newsAfter(mixed, 10)).toEqual([]);
    expect(markOf(mixed)).toBe(10);
  });

  it("falls back to the lines themselves with a server that does not number them", () => {
    expect(markOf(notes)).toBe(noteId(notes[3]));
    expect(markOf([])).toBeNull();
    expect(newsAfter(notes, noteId(notes[1]))).toEqual(notes.slice(2));
    expect(newsAfter(notes, noteId(notes[3]))).toEqual([]);
    // the same thing two days running is two lines
    expect(noteId(notes[0])).not.toBe(noteId(notes[1]));
    // the line seen has rolled off the list: all of it is new
    expect(newsAfter(notes.slice(2), noteId(notes[0]))).toEqual(notes.slice(2));
    // a numbered mark (0: nothing seen yet) against lines without numbers
    expect(newsAfter(notes, 0)).toEqual(notes);
    expect(newsAfter([], "anything")).toEqual([]);
  });

  it("never moves a numbered mark back", () => {
    expect(laterMark(9, 4)).toBe(9);
    expect(laterMark(4, 9)).toBe(9);
    expect(laterMark(undefined, 3)).toBe(3);
    expect(laterMark(null, 3)).toBe(3);
    expect(laterMark("2|webbed|tower||", 5)).toBe(5);
    expect(laterMark(5, "2|webbed|tower||")).toBe("2|webbed|tower||");
  });

  it("does not move an unnumbered mark back to an earlier day", () => {
    const day3 = "3|killed|beetle|bob|";
    expect(laterMark(day3, "2|webbed|tower||")).toBe(day3);
    expect(laterMark("2|webbed|tower||", day3)).toBe(day3);
    // the same day: the lines cannot be put in order, so the one just shown counts
    expect(laterMark(day3, "3|chest||cat|")).toBe("3|chest||cat|");
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
