import { afterEach, describe, expect, it, vi } from "vitest";
import type { AttackResult, League, Note, State } from "@ecency/raidstead";
import {
  aimOf,
  alliancesOfWeek,
  attackMessage,
  keepNewerWeakness,
  newerWeakness,
  buildBlock,
  buildNudgeShown,
  buildReport,
  buildWrapped,
  readFestival,
  readWrapped,
  wrappedCardRows,
  lowerBuildNudge,
  chestBlock,
  chestHoursLeft,
  countdown,
  dismissBuildNudge,
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
  sortCommunities,
  tierOf,
  twinSide,
  weaknessLine,
  worldOf
} from "@/features/raidstead/game";
import enUS from "@/features/i18n/locales/en-US.json";

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
    expect(r.title).toBe("post-title|name=Ink & Oak,boss=name,week=1,outcome=fighting");
    expect(r.body).toContain("intro-fighting|name=Ink & Oak,boss=name");
    expect(r.body).toContain("line|i=1,name=ann,dmg=40");
    expect(r.body).toContain("town|hall=2,mats=80");
    expect(buildReport({ ...state(), alliance: null }, t)).toBeNull();
  });

  describe("Season Wrapped post", () => {
    const wrapped = () => ({
      season: 2,
      account: "ann",
      alliance: { community: "hive-123456", title: "Ink & Oak", league: "small" as League, rank: 3 },
      attacks: 120,
      damage: 1500,
      daysPlayed: 20,
      kills: 3,
      lastHits: 2,
      builds: 4,
      bestStreak: 9,
      badges: 5
    });

    it("has the numbers, the alliance and the raidstead tag", () => {
      const r = buildWrapped(wrapped(), t);
      expect(r.title).toBe("post-title|season=2,name=Ink & Oak");
      for (const [unit, n] of [
        ["attacks", 120],
        ["damage", 1500],
        ["days", 20],
        ["kills", 3],
        ["last-hits", 2],
        ["builds", 4],
        ["streak", 9],
        ["badges", 5]
      ] as const) {
        expect(r.body).toContain(`${unit}|count=${n},n=${n.toLocaleString()}`);
      }
      expect(r.body).toContain("rank|name=Ink & Oak,rank=3,league=small");
      expect(r.tags).toEqual(["hive-123456", "raidstead", "ecency"]);
    });

    // the real words: plurals as i18next resolves them from the locale
    const words = (key: string, v: Record<string, unknown> = {}) => {
      const k = typeof v.count === "number" ? `${key}_${v.count === 1 ? "one" : "other"}` : key;
      const found = k.split(".").reduce<unknown>((o, part) => (o as Record<string, unknown> | undefined)?.[part], enUS);
      if (typeof found !== "string") return k;
      return found.replace(/{{(\w+)}}/g, (_, x: string) => String(v[x]));
    };
    const ones = () => ({ ...wrapped(), attacks: 1, damage: 1, daysPlayed: 1, kills: 1, lastHits: 1, builds: 1, bestStreak: 1, badges: 1 });
    const plural = /\b1\** (attacks|days|pests|last hits|badges|buildings)\b/;

    it("says 1 of a thing in the singular, in the post and on the card", () => {
      const body = buildWrapped(ones(), words).body;
      expect(body).not.toMatch(plural);
      expect(body).toMatch(/\b1\** last hit\b/);
      const rows = wrappedCardRows(ones(), words);
      expect(rows).toHaveLength(3);
      expect(rows.join(" ")).not.toMatch(plural);
      expect(wrappedCardRows(wrapped(), words)[0]).toBe(`120 attacks, ${(1500).toLocaleString()} damage`);
    });

    it("leaves out last hits and buildings for a season that did not count them", () => {
      const w = { ...wrapped(), lastHits: null, builds: null };
      expect(buildWrapped(w, words).body).not.toMatch(/last hit|building/);
      expect(wrappedCardRows(w, words).join(" ")).not.toMatch(/last hit/);
    });

    it("reads totals without last hits and buildings, and badges sent as their ids", () => {
      const w = readWrapped({ ...wrapped(), lastHits: null, builds: null, badges: ["festival", "helper"] });
      expect(w).toMatchObject({ lastHits: null, builds: null, badges: 2, attacks: 120 });
      expect(readWrapped({ ...wrapped(), attacks: null })).toBeNull();
    });

    it("keeps a community's Markdown as text, and drafts a season without an alliance", () => {
      const w = { ...wrapped(), alliance: { ...wrapped().alliance, title: "[Oak](x)" } };
      expect(buildWrapped(w, t).body).toContain("name=\\[Oak\\]\\(x\\)");
      const solo = buildWrapped({ ...wrapped(), alliance: null }, t);
      expect(solo.title).toBe("post-title|season=2,name=@ann");
      expect(solo.body).not.toContain("rank|");
      expect(solo.tags).toEqual(["raidstead", "ecency"]);
    });
  });

  it("lists the other alliances' helpers apart, in a Helped by line", () => {
    const s = state();
    s.alliance!.helpers = [
      { account: "cat", damage: 30 },
      { account: "dan_x", damage: 9 }
    ];
    const r = buildReport(s, t)!;
    expect(r.body).toContain("helpers|names=@cat, @dan\\_x");
    // a server that sends no helpers, or none this week: no line
    expect(buildReport(state(), t)!.body).not.toContain("helpers|");
    s.alliance!.helpers = [];
    expect(buildReport(s, t)!.body).not.toContain("helpers|");
  });

  it("drafts the Helped by line in plain words", () => {
    const s = state();
    s.alliance!.helpers = [{ account: "cat", damage: 30 }, { account: "dan", damage: 9 }];
    expect(buildReport(s, realT)!.body).toContain("Helped by @cat, @dan");
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

  it("names the new weakness when the player's own hit shifted it and they saw it", () => {
    const shift = (waspArrived: boolean) =>
      hit({
        hit: "boss",
        damage: 12,
        weak: true,
        paired: null,
        killed: false,
        phaseShift: true,
        gnatsSpawned: 0,
        waspArrived,
        weakness: "signal"
      });
    expect(attackMessage(shift(false), "ink", t)).toBe("hit-weak|type=ink,dmg=12 shift-seen|type=signal");
    // the wasp cannot dodge a player who knows the weakness: no "scout again"
    expect(attackMessage(shift(true), "ink", t)).toBe(
      "hit-weak|type=ink,dmg=12 shift-seen|type=signal wasp-arrives-seen"
    );
  });

  it("keeps the newer of two weaknesses by the server's version", () => {
    const at = (weakness: string | null, weaknessVersion?: number, community = "hive-1") => {
      const s = state({ alive: true, killed: false });
      Object.assign(s.alliance!, { community });
      Object.assign(s.alliance!.boss, { weakness, weaknessVersion });
      return s;
    };
    const boss = at("ink", 5).alliance!.boss;
    expect(newerWeakness(boss, "signal", 6)).toMatchObject({ weakness: "signal", weaknessVersion: 6 });
    expect(newerWeakness(boss, null, 6)).toMatchObject({ weakness: null, weaknessVersion: 6 });
    expect(newerWeakness(boss, "signal", 5)).toBeNull();
    // the same version: knowing it is newer than not knowing it (a scout changes no version)
    expect(newerWeakness(at(null, 5).alliance!.boss, "ink", 5)).toMatchObject({ weakness: "ink", weaknessVersion: 5 });
    expect(newerWeakness(boss, null, 5)).toBeNull();
    expect(newerWeakness(boss, "signal", 4)).toBeNull();
    expect(newerWeakness(boss, "signal", undefined)).toBeNull();
    expect(newerWeakness(at(null).alliance!.boss, "signal", 1)).toMatchObject({ weakness: "signal" });
    // a state answer that read the boss before a newer weakness was shown
    expect(keepNewerWeakness(at("signal", 6), at("ink", 5)).alliance!.boss).toMatchObject({ weakness: "signal", weaknessVersion: 6 });
    expect(keepNewerWeakness(at("signal", 6), at(null, 7)).alliance!.boss).toMatchObject({ weakness: null, weaknessVersion: 7 });
    expect(keepNewerWeakness(at("signal", 6), at(null, 6)).alliance!.boss.weakness).toBe("signal");
    expect(keepNewerWeakness(at(null, 6), at("signal", 6)).alliance!.boss.weakness).toBe("signal");
    // another town, nothing shown yet, or an older server: the answer as it came
    expect(keepNewerWeakness(at("signal", 6, "hive-2"), at("ink", 5)).alliance!.boss.weakness).toBe("ink");
    expect(keepNewerWeakness(null, at("ink", 5)).alliance!.boss.weakness).toBe("ink");
    expect(keepNewerWeakness(at("signal"), at("ink")).alliance!.boss.weakness).toBe("ink");
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
    // a kill without who (an older line) never shows an empty "@"
    expect(noteText({ day: 5, kind: "killed", what: "beetle", text: "x" }, full)).toBe('raidstead.news.killed_plain {"name":"raidstead.bosses.beetle.name"}');
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

  it("lists the four weeks in the server's order, a week apart", () => {
    const weeks = pestCalendar({ season: 0, week: 0, resting: true, startsAt: start });
    expect(weeks.map((w) => [w.week, w.kind])).toEqual([[1, "beetle"], [2, "slug"], [3, "twins"], [4, "queen"]]);
    expect(weeks.map((w) => new Date(w.at).toISOString().slice(0, 10))).toEqual(["2026-10-10", "2026-10-17", "2026-10-24", "2026-10-31"]);
  });

  it("gives each week only its number, pest and arrival: nothing is hidden", () => {
    for (const c of [
      { season: 0, week: 0, resting: true, startsAt: start },
      { season: 2, week: 1, resting: false, startsAt: start }
    ]) {
      for (const w of pestCalendar(c))
        expect(Object.keys(w).sort()).toEqual(["at", "kind", "week"]);
    }
  });
});

describe("build nudge", () => {
  // a member who has raided, with a Hall to build first (stage 0 costs 40)
  const town = (mats: number, attackDays = 1): State => {
    const s = state();
    s.alliance!.mats = mats;
    s.alliance!.town = {
      tower: 0,
      workshop: 0,
      trophy: 0,
      hall: 0,
      library: 0,
      beacon: 0,
      walls: 0
    };
    s.member!.attackDays = attackDays;
    return s;
  };
  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it("follows the Town's own rules: raid first, the Hall first, enough materials", () => {
    expect(buildBlock(town(60), "hall")).toBeNull();
    expect(buildBlock(town(60), "tower")).toBe("hall-first");
    expect(buildBlock(town(20), "hall")).toBe("short");
    expect(buildBlock(town(60, 0), "hall")).toBe("raid-first");
    expect(buildNudgeShown(town(60))).toBe(true);
    expect(buildNudgeShown(town(20))).toBe(false);
    expect(buildNudgeShown(town(60, 0))).toBe(false);
  });

  it("stays hidden once dismissed until the materials grow again", () => {
    dismissBuildNudge(town(60));
    expect(buildNudgeShown(town(60))).toBe(false);
    expect(buildNudgeShown(town(85))).toBe(true);
    // the dismissal is per season, alliance and account
    const next = town(60);
    next.calendar.season = 2;
    expect(buildNudgeShown(next)).toBe(true);
  });

  it("after a drop in materials, stays hidden until they grow past the low point", () => {
    dismissBuildNudge(town(100));
    expect(buildNudgeShown(town(100))).toBe(false);
    // an ally builds: fewer materials, still nothing new to tell
    lowerBuildNudge(town(60));
    expect(buildNudgeShown(town(60))).toBe(false);
    expect(buildNudgeShown(town(85))).toBe(true);
  });

  it("lowers the mark even when nothing is affordable, and only by being told to", () => {
    const tower = (mats: number) => {
      const s = town(mats);
      s.alliance!.town.hall = 1; // a tower (30) may follow the Hall now
      return s;
    };
    dismissBuildNudge(tower(60));
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    // reading never writes
    expect(buildNudgeShown(tower(20))).toBe(false);
    expect(buildNudgeShown(tower(40))).toBe(false);
    expect(setItem).not.toHaveBeenCalled();
    lowerBuildNudge(tower(20));
    expect(setItem).toHaveBeenCalled();
    expect(buildNudgeShown(tower(40))).toBe(true);
  });

  it("keeps each account's and alliance's dismissal apart", () => {
    const other = (s: State, name: string, community: string) => {
      s.account.name = name;
      s.alliance!.community = community;
      return s;
    };
    dismissBuildNudge(other(town(60), "ann", "hive-1"));
    dismissBuildNudge(other(town(70), "bob", "hive-2"));
    expect(buildNudgeShown(other(town(60), "ann", "hive-1"))).toBe(false);
    expect(buildNudgeShown(other(town(70), "bob", "hive-2"))).toBe(false);
    expect(buildNudgeShown(other(town(65), "ann", "hive-1"))).toBe(true);
    expect(buildNudgeShown(other(town(60), "ann", "hive-2"))).toBe(true);
  });

  it("still shows, and nothing breaks, when storage throws", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(() => dismissBuildNudge(town(60))).not.toThrow();
    expect(buildNudgeShown(town(60))).toBe(true);
  });

  it("trusts the page's newer mark over an older one storage failed to replace", () => {
    const mem: Record<string, number> = {};
    dismissBuildNudge(town(40), mem);
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("full");
    });
    // the materials grew, the card came back, and the player dismissed it again
    dismissBuildNudge(town(60), mem);
    expect(buildNudgeShown(town(60), mem)).toBe(false);
    expect(lowerBuildNudge(town(60), mem)).toBe(false);
    expect(buildNudgeShown(town(70), mem)).toBe(true);
  });

  it("follows a dismissal another tab saved after this page's own", () => {
    const here: Record<string, number> = {};
    dismissBuildNudge(town(40), here);
    dismissBuildNudge(town(60), {});
    expect(buildNudgeShown(town(60), here)).toBe(false);
  });
});

describe("sortCommunities", () => {
  it("sorts by players now, then last season, then title ignoring case", () => {
    const sorted = sortCommunities([
      { name: "c", title: "carrot", players: 0, lastSeason: 0 },
      { name: "a", title: "Apple", players: 0, lastSeason: 0 },
      { name: "x", title: "Busy", players: 3, lastSeason: 0 },
      { name: "b", title: "banana", players: 0, lastSeason: 0 },
      { name: "y", title: "Veteran", players: 0, lastSeason: 9 }
    ]);
    expect(sorted.map((c) => c.name)).toEqual(["x", "y", "a", "b", "c"]);
  });

  it("keeps the server's order when it sends no counts", () => {
    const list = [
      { name: "z", title: "Zed" },
      { name: "a", title: "Alpha" }
    ];
    expect(sortCommunities(list).map((c) => c.name)).toEqual(["z", "a"]);
  });
});

// The locale's own English, for lines whose exact words matter.
const realT = (key: string, values: Record<string, unknown> = {}) => {
  const text = key
    .split(".")
    .reduce<unknown>((o, k) => (o && typeof o === "object" ? (o as Record<string, unknown>)[k] : undefined), enUS);
  return typeof text === "string" ? text.replace(/\{\{(\w+)\}\}/g, (_, k) => String(values[k] ?? "")) : key;
};

describe("helped news", () => {
  it("tells who came from another town, in plain words", () => {
    const n = { day: 3, seq: 9, kind: "helped", who: "cat", what: "slug", text: "@cat came from another town to help against the slug." };
    expect(noteText(n, realT)).toBe("@cat came from another town to help against the Doomscroll Slug.");
    // a pest this page does not know: the server's own line
    expect(noteText({ ...n, what: "moth" }, realT)).toBe(n.text);
  });
});

describe("weaknessLine", () => {
  it("names the pest and the type, with no long dashes", () => {
    const line = weaknessLine("slug", "forge", realT);
    expect(line).toBe(
      "Raidstead: today the Doomscroll Slug is weak to Forge (until it shifts). Join us at ecency.com/raidstead"
    );
    expect(line).not.toMatch(/[\u2013\u2014]/);
    expect(weaknessLine("beetle", "ink", realT)).toContain("the Spam Beetle is weak to Ink");
  });
});

// The raid report tells the week as a story, from the town news and the board.
describe("story report", () => {
  const killed = { day: 5, seq: 9, kind: "killed", what: "beetle", who: "a", text: "The beetle was chased off." };

  it("tells the week day by day in day order, with the hero of the week", () => {
    const s = state({ alive: false, killed: true });
    // the list as the server may send it: not in order, two lines on one day
    s.alliance!.notes = [
      killed,
      { day: 3, seq: 5, kind: "shifted", what: "beetle", n: 75, text: "The beetle's weakness shifted." },
      { day: 1, seq: 2, kind: "arrived", what: "beetle", text: "The beetle arrived." },
      { day: 3, seq: 4, kind: "gnats", n: 6, text: "6 gnats" }
    ];
    const body = buildReport(s, realT)!.body;
    const at = (x: string) => body.indexOf(x);
    expect(at("**Day 1:**")).toBeGreaterThan(-1);
    expect(at("**Day 1:**")).toBeLessThan(at("**Day 3:**"));
    expect(at("**Day 3:**")).toBeLessThan(at("**Day 5:**"));
    expect(body).toContain("The Spam Beetle arrived.");
    // within a day, in the order the lines were written
    expect(at("6 gnats")).toBeLessThan(at("below 75% health"));
    expect(body).toContain("Hero of the week: @a");
    // the last hit is told once, in the hero line
    expect(body).toContain("**Day 5:** The Spam Beetle was chased off.\n");
    expect(body.match(/@a\b/g)).toHaveLength(1);
    // the board still follows
    expect(body).toContain("1. @ann: 40 damage");
  });

  it("says a pest that got away in the title and names no hero", () => {
    const s = state({ alive: false, killed: false });
    s.alliance!.notes = [{ day: 7, seq: 3, kind: "escaped", what: "beetle", text: "The beetle escaped." }];
    const r = buildReport(s, realT)!;
    expect(r.title).toBe("Ink & Oak vs the Spam Beetle: week 1, got away");
    expect(r.body).not.toContain("Hero of the week");
    // a stray last-hit line does not make one either
    s.alliance!.notes.push({ ...killed, day: 6 });
    expect(buildReport(s, realT)!.body).not.toContain("Hero of the week");
  });

  it("names a building finished this week in the town section, not one from an earlier week", () => {
    const s = state();
    s.calendar.day = 10;
    s.alliance!.week = 2;
    s.alliance!.notes = [
      { day: 3, seq: 1, kind: "built", what: "tower", who: "bob", text: "The tower was finished." },
      { day: 9, seq: 6, kind: "built", what: "beacon", who: "ann", text: "The beacon was finished." }
    ];
    const body = buildReport(s, realT)!.body;
    const town = body.slice(body.indexOf("### Our town"));
    expect(body.indexOf("### Our town")).toBeGreaterThan(-1);
    expect(town).toContain("Beacon");
    expect(town).not.toContain("Watchtower");
  });

  it("tells the season's last pest getting away, logged the day after the last raid day", () => {
    const s = state({ kind: "queen", alive: false, killed: false });
    s.calendar.day = 28;
    s.alliance!.week = 4;
    s.alliance!.notes = [
      { day: 22, seq: 1, kind: "arrived", what: "queen", text: "The queen arrived." },
      { day: 29, seq: 2, kind: "escaped", what: "queen", text: "The queen escaped." }
    ];
    expect(buildReport(s, realT)!.body).toContain("**Day 29:** The Copycat Queen escaped.");
    // mid-season, the escape on the next pest's first day is not this week's
    const w1 = state({ alive: false, killed: false });
    w1.alliance!.notes = [{ day: 8, seq: 2, kind: "escaped", what: "beetle", text: "The beetle escaped." }];
    expect(buildReport(w1, realT)!.body).not.toContain("escaped");
  });

  it("reads well from a server without the new news: the week's start, no hero line", () => {
    const s = state();
    s.alliance!.notes = [{ day: 2, kind: "copied", n: 30, text: "copied" }, { day: 2, kind: "moth_dance", text: "A moth danced." }];
    const r = buildReport(s, realT)!;
    expect(r.title).toBe("Ink & Oak vs the Spam Beetle: week 1, still fighting");
    expect(r.body).toContain("Week 1 began with the Spam Beetle in town.");
    // a kind this page has no words for: the server's own line
    expect(r.body).toContain("A moth danced.");
    expect(r.body).not.toContain("Hero of the week");
    expect(r.body).not.toMatch(/[\u2013\u2014]/);
    expect(r.body).toContain("https://ecency.com/raidstead");
  });
});

describe("alliance of the week", () => {
  const kill = (community: string, league: string, hours: number, raiders = 5) => ({
    community,
    title: community.toUpperCase(),
    league: league as League,
    killSecs: hours * 3600,
    raiders,
    members: 10
  });

  it("picks the fastest kill in each league", () => {
    const w = alliancesOfWeek([
      kill("hive-a", "medium", 30),
      kill("hive-b", "medium", 20),
      kill("hive-c", "medium", 50),
      kill("hive-s", "small", 40)
    ]);
    expect(w.medium?.community).toBe("hive-b");
    expect(w.small?.community).toBe("hive-s");
  });

  it("has no winner for a league with no kill that week", () => {
    const w = alliancesOfWeek([kill("hive-a", "medium", 30)]);
    expect(w.large).toBeUndefined();
    expect(w.small).toBeUndefined();
    expect(alliancesOfWeek([])).toEqual({});
  });

  it("breaks a tie on turnout, then on the community name; skips rows it cannot read", () => {
    const w = alliancesOfWeek([
      kill("hive-b", "large", 20, 9),
      kill("hive-a", "large", 20, 9),
      kill("hive-c", "large", 20, 4),
      { ...kill("hive-0", "large", 1), killSecs: null as unknown as number },
      kill("hive-x", "huge", 1)
    ]);
    expect(w.large?.community).toBe("hive-a");
    expect(Object.keys(w)).toEqual(["large"]);
  });
});

describe("readFestival", () => {
  const f = () => ({ season: 2, kind: "queen", hp: 900, maxHp: 1000, chasedOff: false, top: [], energy: 5, maxEnergy: 5, myDamage: 0, canPlay: true });

  it("reads who may hit only from a plain yes or no", () => {
    expect(readFestival(f())?.canPlay).toBe(true);
    expect(readFestival({ ...f(), canPlay: false })?.canPlay).toBe(false);
    // missing or unreadable: not a festival answer this page can act on
    const { canPlay: _, ...none } = f();
    expect(readFestival(none)).toBeNull();
    expect(readFestival({ ...f(), canPlay: "yes" })).toBeNull();
  });
});
