import { BOSS_KINDS, BUILDING_IDS, LEAGUES, type BossKind } from "@ecency/raidstead";
import type {
  AttackResult,
  AttackType,
  Boss,
  BuildingId,
  Impact,
  LeaderRow,
  League,
  Calendar,
  Community,
  Festival,
  Note,
  RaidsteadError,
  SceneWorld,
  State,
  View,
  WeekKill,
  Wrapped
} from "@ecency/raidstead";
import * as ls from "@/utils/local-storage";

type T = (key: string, values?: Record<string, unknown>) => string;

/// A big alliance's gnat shield runs to dozens: the scene draws a swarm of this many
/// at most, and the boss plate says how many there really are.
export const GNATS_SHOWN = 8;

/// What the scene should show for a server state.
export function worldOf(state: State | null, view: View): SceneWorld {
  const a = state?.alliance;
  if (!a) {
    // before an alliance is picked the week's pest still waits on the meadow
    return {
      view: "raid",
      boss: { kind: "beetle", alive: true },
      gnats: 0,
      wasp: false,
      town: { tower: 0, workshop: 0, trophy: 0, hall: 0, library: 0, beacon: 0, walls: 0 },
      web: null
    };
  }
  return {
    view,
    boss: { kind: a.boss.kind, alive: a.boss.alive },
    gnats: Math.min(a.boss.gnats, GNATS_SHOWN),
    wasp: a.boss.waspHp > 0,
    town: a.town,
    web: a.web
  };
}

/// Where an attack will land before the server answers: the shield first,
/// then the wasp, then the boss (the server resolves it the same way).
export function aimOf(state: State | null): "boss" | "gnat" | "wasp" {
  const b = state?.alliance?.boss;
  if (!b) return "boss";
  return b.gnats > 0 ? "gnat" : b.waspHp > 0 ? "wasp" : "boss";
}

export function impactOf(r: AttackResult): Impact {
  switch (r.hit) {
    case "gnat":
      return { kind: "gnat" };
    case "wasp":
      return { kind: "wasp", dodged: r.dodged };
    case "echo":
      return { kind: "echo" };
    default:
      return { kind: "boss", weak: r.weak, killed: r.killed };
  }
}

/// Which twin an untargeted attack goes for. A hit only lands once the other twin is
/// hit too, so while hits wait on one twin (the player's own, or an ally's) the
/// attack goes for the other and lands them all; with none waiting it takes `turn`.
/// `now` is the server's clock, which the wait is timed by.
export function twinSide(boss: Pick<Boss, "echo">, now: number, turn: 0 | 1): 0 | 1 {
  const e = boss.echo;
  return e && e.until > now ? (e.side === 0 ? 1 : 0) : turn;
}

/// Why a rally cannot be called right now, or null when it can. The server refuses
/// the same cases before any Points are taken; the page says so up front.
export function rallyBlock(state: State | null): "rallied" | "resting" | "no-boss" | "full" | null {
  const m = state?.member;
  const boss = state?.alliance?.boss;
  if (!state || !m || !boss) return "no-boss";
  if (m.rallied) return "rallied";
  if (state.calendar.resting) return "resting";
  if (!boss.alive) return "no-boss";
  // a rally adds 5: with less room than that some of it would be lost
  return m.energy + 5 > m.maxEnergy ? "full" : null;
}

/// Why the war chest takes no gift right now, or null when it does.
export function chestBlock(state: State | null): "active" | "kept" | "resting" | "no-boss" | null {
  const a = state?.alliance;
  if (!state || !a) return "no-boss";
  if (a.buffToday) return "active";
  if (a.buffKept) return "kept";
  if (state.calendar.resting) return "resting";
  // a chest that fills with no pest in town is kept for the next one: after the
  // season's last pest there is no next one
  return !a.boss.alive && a.week >= 4 ? "no-boss" : null;
}

/// War chest time put aside for the next pest, in whole hours as the news
/// tells it (rounded up); 0 when there is none.
export const chestHoursLeft = (state: State | null) =>
  Math.ceil(Math.max(0, state?.alliance?.buffLeft ?? 0) / 3_600_000);

/// A line of town news in the reader's language. Anything this page has no words
/// for (a kind, a pest or a building from a newer server) falls back to the
/// server's own plain line.
export function noteText(n: Note, t: T): string {
  const what = n.what ?? "";
  const building = (BUILDING_IDS as readonly string[]).includes(what);
  const pest = (BOSS_KINDS as readonly string[]).includes(what);
  switch (n.kind) {
    case "arrived":
      if (!pest) return n.text;
      return t("raidstead.news.arrived", { name: t(`raidstead.bosses.${what}.name`) });
    case "shifted":
      // n: the health mark (75 or 25, in %) the pest fell below
      if (!pest || typeof n.n !== "number") return n.text;
      return t("raidstead.news.shifted", { name: t(`raidstead.bosses.${what}.name`), n: n.n });
    case "gnats":
      if (typeof n.n !== "number") return n.text;
      return t("raidstead.news.gnats", { n: n.n });
    case "built":
      // a building finished (stage 3), by `who`
      if (!building) return n.text;
      return n.who
        ? t("raidstead.news.built_by", { name: t(`raidstead.town.buildings.${what}.name`), who: n.who })
        : t("raidstead.news.built", { name: t(`raidstead.town.buildings.${what}.name`) });
    case "copied":
    case "healed":
      return t(`raidstead.news.${n.kind}`, { n: n.n ?? 0 });
    case "webbed":
    case "web_gone":
      if (!building) return n.text;
      return t(`raidstead.news.${n.kind}`, { name: t(`raidstead.town.buildings.${what}.name`) });
    case "escaped":
      if (!pest) return n.text;
      return t("raidstead.news.escaped", { name: t(`raidstead.bosses.${what}.name`) });
    case "killed":
      if (!pest) return n.text;
      return n.who
        ? t("raidstead.news.killed", { name: t(`raidstead.bosses.${what}.name`), who: n.who })
        : t("raidstead.news.killed_plain", { name: t(`raidstead.bosses.${what}.name`) });
    case "helped":
      if (!pest || !n.who) return n.text;
      return t("raidstead.news.helped", { name: t(`raidstead.bosses.${what}.name`), who: n.who });
    case "chest":
    case "chest_kept":
      return t(`raidstead.news.${n.kind}`, { who: n.who ?? "" });
    case "chest_open":
      // with hours an earlier chest had left on top, the server says how long
      return typeof n.n === "number"
        ? t("raidstead.news.chest_open_hours", { n: n.n })
        : t("raidstead.news.chest_open");
    case "chest_saved":
    case "chest_back":
      if (typeof n.n !== "number") return n.text;
      return t(`raidstead.news.${n.kind}`, { n: n.n });
    default:
      return n.text;
  }
}

/// What tells one line of news from another when the server does not number
/// them: the news is a short rolling list.
export const noteId = (n: Note) => [n.day, n.kind ?? n.text, n.what ?? "", n.who ?? "", n.n ?? ""].join("|");

/// How far a player has read the news: the number of the last line seen (the
/// server numbers them), or that line's noteId from a server that does not.
export type NewsMark = number | string;

/// The mark of a list read to its end; null for an empty list from a server
/// that does not number its news.
export function markOf(notes: Note[]): NewsMark | null {
  const last = notes[notes.length - 1];
  return last ? (last.seq ?? noteId(last)) : null;
}

/// The news after the player's mark. Numbered lines are told apart for good: an
/// answer older than the mark holds nothing new, and a line without a number
/// among numbered ones was written before numbering began, so it is older than
/// any numbered mark. With a noteId (no numbers at all), a line that has rolled
/// off the list makes all of it new.
export function newsAfter(notes: Note[], mark: NewsMark): Note[] {
  if (typeof mark === "number" && notes.some((n) => typeof n.seq === "number")) {
    return notes.filter((n) => typeof n.seq === "number" && n.seq > mark);
  }
  return notes.slice(notes.map(noteId).lastIndexOf(String(mark)) + 1);
}

/// The later of two marks: a mark never moves back (two tabs share one, and an
/// answer can be older than what another tab has already shown). Numbers say
/// which is later; noteIds only by their day, so within a day the new one counts.
export function laterMark(a: NewsMark | null | undefined, b: NewsMark): NewsMark {
  if (typeof a === "number" && typeof b === "number") return Math.max(a, b);
  const day = (m: string) => Number(m.split("|")[0]) || 0;
  return typeof a === "string" && typeof b === "string" && day(a) > day(b) ? a : b;
}

/// The toast after an attack; follow-ups (a shift, a shield, the wasp) are
/// appended so one line tells the whole story. `me` is the player's account.
export function attackMessage(r: AttackResult, type: AttackType, t: T, me?: string): string {
  switch (r.hit) {
    case "gnat":
      return r.gnatsLeft > 0
        ? t("raidstead.toast.gnat", { n: r.gnatsLeft })
        : t("raidstead.toast.gnat-last");
    case "wasp":
      if (r.dodged) return t("raidstead.toast.wasp-dodged");
      return r.waspHp > 0
        ? t("raidstead.toast.wasp-hit", { n: r.waspHp })
        : t("raidstead.toast.wasp-gone");
    case "echo":
      return t("raidstead.toast.echo");
  }
  if (r.killed) return t("raidstead.toast.killed");
  const parts = [
    r.paired
      ? // several waiting hits landed with this one; or only the player's own, with
        // nobody to share it with; or one ally's
        (r.paired.hits ?? 1) > 1
        ? t("raidstead.toast.paired-many", { dmg: r.damage, n: r.paired.hits })
        : r.paired.by === me
          ? t("raidstead.toast.paired-self", { dmg: r.damage })
          : t("raidstead.toast.paired", { dmg: r.damage, by: r.paired.by })
      : t(r.weak ? "raidstead.toast.hit-weak" : "raidstead.toast.hit", {
          type: t(`raidstead.types.${type}`),
          dmg: r.damage
        })
  ];
  // the wasp's own line says how to scout again (for free), so the shift's is left out
  if (r.phaseShift && !r.waspArrived) parts.push(t("raidstead.toast.shift"));
  if (r.gnatsSpawned) parts.push(t("raidstead.toast.gnats-spawn", { n: r.gnatsSpawned }));
  if (r.waspArrived) parts.push(t("raidstead.toast.wasp-arrives"));
  return parts.join(" ");
}

/// A readable line for an API error.
export function errorMessage(e: unknown, t: T): string {
  const err = e as Partial<RaidsteadError>;
  const code = typeof err?.code === "string" ? err.code : "";
  if (err?.status === 429 && code !== "daily_cap") return t("raidstead.errors.rate");
  if (
    [
      "offline",
      "insufficient_points",
      "daily_cap",
      "points_unavailable",
      "too_fast",
      "already_applied",
      "key_used"
    ].includes(code)
  ) {
    return t(`raidstead.errors.${code}`);
  }
  // rule refusals carry their own plain message from the server
  if (err?.status === 409 && typeof err.message === "string" && err.message) return err.message;
  return t("raidstead.errors.generic");
}

/// A readable line for a refused help attack: the help rules have their own words.
export function helpErrorMessage(e: unknown, t: T): string {
  const code = (e as Partial<RaidsteadError>)?.code;
  if (code === "help_full" || code === "own_boss_alive" || code === "not_fighting" || code === "not_found") {
    return t(`raidstead.help.errors.${code}`);
  }
  return errorMessage(e, t);
}

/// A readable line for a refused festival hit: the festival's refusals have their own words.
export function festivalErrorMessage(e: unknown, t: T): string {
  const code = (e as Partial<RaidsteadError>)?.code;
  if (code === "not_this_season" || code === "no_energy" || code === "chased_off" || code === "not_festival") {
    return t(`raidstead.festival.errors.${code}`);
  }
  return errorMessage(e, t);
}

export const TIERS = [0, 50, 150, 400, 1000];
export const tierOf = (karma: number) =>
  TIERS.reduce((best, min, i) => (karma >= min ? i : best), 0);

/// Community titles are set by the community: in the report's Markdown body
/// their Markdown syntax stays text (no link, image or heading markup). A bare
/// URL or @name in one is still linked by the renderer, as anywhere in a post.
export const escapeMarkdown = (text: string) => text.replace(/[\\`*_{}[\]()#+!|<>~]/g, "\\$&");

/// This week's town news in the order it happened: by day, then as the server
/// numbered the lines (lines without a number keep the order they came in).
/// The season's last pest gets away the day after the last raid day (29): that
/// line is week 4's. Earlier escapes are logged on the next pest's first day,
/// and belong to that week.
function weekNews(notes: Note[], week: number): Note[] {
  const first = (week - 1) * 7 + 1;
  const last = week >= 4 ? 29 : first + 6;
  return notes
    .filter((n) => n.day >= first && n.day <= last)
    .sort(
      (a, b) =>
        a.day - b.day || (typeof a.seq === "number" && typeof b.seq === "number" ? a.seq - b.seq : 0)
    );
}

/// A raid report the player can edit and post in their community: the week
/// told as a story from the town news, the hero, the board and the town.
export function buildReport(state: State, t: T): { title: string; body: string } | null {
  const a = state.alliance;
  if (!a) return null;
  const boss = t(`raidstead.bosses.${a.boss.kind}.name`);
  const name = escapeMarkdown(a.title);
  // a pest that is gone without being chased off got away; a server that does not say: chased off
  const outcome = a.boss.alive ? "fighting" : a.boss.killed === false ? "escaped" : "won";
  const title = t("raidstead.report.post-title", {
    name: a.title,
    boss,
    week: a.week,
    outcome: t(`raidstead.report.outcome.${outcome}`)
  });
  const news = weekNews(a.notes ?? [], a.week);
  // the last hit, only for a pest that was chased off; told once, in its own line
  const hero = outcome === "won" ? news.filter((n) => n.kind === "killed" && n.who).pop()?.who : undefined;
  const lines = [t(`raidstead.report.intro-${outcome}`, { name, boss }), ""];

  // day by day; a server that does not tell the arrival: the week's start, from its number
  lines.push(`### ${t("raidstead.report.days")}`, "");
  if (!news.some((n) => n.kind === "arrived")) {
    lines.push(t("raidstead.report.week-start", { week: a.week, boss }), "");
  }
  const days = new Map<number, string[]>();
  for (const n of news) {
    // what the server wrote and the names in it stay text; the page's own words are Markdown-safe
    const who = hero && n.kind === "killed" ? undefined : n.who && escapeMarkdown(n.who);
    const text = noteText({ ...n, text: escapeMarkdown(n.text ?? ""), who }, t);
    const day = days.get(n.day) ?? [];
    // the same line twice in a day (a weakness that shifted back and forth) is told once
    if (text && !day.includes(text)) day.push(text);
    days.set(n.day, day);
  }
  days.forEach((texts, day) => {
    if (texts.length) lines.push(`**${t("raidstead.news.day", { day })}** ${texts.join(" ")}`, "");
  });

  if (hero) lines.push(t("raidstead.report.hero", { who: escapeMarkdown(hero) }), "");

  if (a.raiders.length) {
    lines.push(t("raidstead.report.raiders"), "");
    a.raiders
      .slice(0, 5)
      .forEach((r, i) =>
        lines.push(
          t("raidstead.report.line", { i: i + 1, name: escapeMarkdown(r.account), dmg: r.damage })
        )
      );
    lines.push("");
  }
  // players from other alliances who helped, told apart from the alliance's own
  const helpers = a.helpers ?? [];
  if (helpers.length) {
    const names = helpers.map((h) => `@${escapeMarkdown(h.account)}`).join(", ");
    lines.push(t("raidstead.report.helpers", { names }), "");
  }

  // the town: what was finished this week, then where it stands
  lines.push(`### ${t("raidstead.report.town-title")}`, "");
  const built = [
    ...new Set(
      news
        .filter((n) => n.kind === "built" && (BUILDING_IDS as readonly string[]).includes(n.what ?? ""))
        .map((n) => t(`raidstead.town.buildings.${n.what}.name`))
    )
  ];
  if (built.length) lines.push(t("raidstead.report.built", { list: built.join(", ") }), "");
  lines.push(
    t("raidstead.report.town", { hall: a.town.hall, mats: a.mats }),
    "",
    t("raidstead.report.outro", { name })
  );
  return { title, body: lines.join("\n") };
}

/// A player's season as a post to edit and share: the numbers, the alliance and
/// its league rank, tagged with the alliance's community, raidstead and ecency.
export function buildWrapped(w: Wrapped, t: T): { title: string; body: string; tags: string[] } {
  const a = w.alliance;
  const name = a ? escapeMarkdown(a.title || a.community) : "";
  const title = t("raidstead.wrapped.post-title", {
    season: w.season,
    name: a ? a.title || a.community : `@${w.account}`
  });
  const lines = [
    a ? t("raidstead.wrapped.intro", { season: w.season, name }) : t("raidstead.wrapped.intro-solo", { season: w.season }),
    "",
    `- ${t("raidstead.wrapped.post-attacks", { attacks: w.attacks, damage: w.damage })}`,
    `- ${t("raidstead.wrapped.post-days", { days: w.daysPlayed, best: w.bestStreak })}`,
    `- ${t("raidstead.wrapped.post-kills", { kills: w.kills, lastHits: w.lastHits })}`,
    `- ${t("raidstead.wrapped.post-builds", { builds: w.builds, badges: w.badges })}`,
    ""
  ];
  if (a) {
    lines.push(
      t("raidstead.wrapped.rank", { name, rank: a.rank, league: t(`raidstead.profile.leagues.${a.league}`) }),
      ""
    );
  }
  lines.push(t("raidstead.wrapped.outro"));
  const tags = a ? [a.community, "raidstead", "ecency"] : ["raidstead", "ecency"];
  return { title, body: lines.join("\n"), tags };
}

const num = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x);

/// The festival as the page can show it, or null for an answer it cannot read
/// (an older or broken server): the page then stays as it was.
export function readFestival(x: unknown): Festival | null {
  const f = x as Partial<Festival> | null;
  if (!f || typeof f.kind !== "string" || !num(f.hp) || !num(f.maxHp) || f.maxHp <= 0) return null;
  if (!num(f.energy) || !num(f.maxEnergy)) return null;
  const top = (Array.isArray(f.top) ? f.top : [])
    .filter((r) => r && typeof r.community === "string" && num(r.damage))
    .slice(0, 10);
  return {
    season: num(f.season) ? f.season : 0,
    kind: f.kind,
    hp: Math.max(0, f.hp),
    maxHp: f.maxHp,
    chasedOff: !!f.chasedOff || f.hp <= 0,
    top,
    energy: f.energy,
    maxEnergy: f.maxEnergy,
    myDamage: num(f.myDamage) ? f.myDamage : 0,
    canPlay: f.canPlay !== false
  };
}

const WRAPPED_NUMBERS = ["attacks", "damage", "daysPlayed", "kills", "lastHits", "builds", "bestStreak"] as const;

/// A season's totals as the card shows them, or null when any number is missing.
/// `badges` may come as a count or as the list of ids.
export function readWrapped(x: unknown): Wrapped | null {
  const w = x as Record<string, unknown> | null;
  if (!w || typeof w.account !== "string" || !num(w.season)) return null;
  if (WRAPPED_NUMBERS.some((k) => !num(w[k]))) return null;
  const badges = Array.isArray(w.badges) ? w.badges.length : w.badges;
  if (!num(badges)) return null;
  const a = w.alliance as Wrapped["alliance"];
  const alliance =
    a && typeof a.community === "string" && num(a.rank) && LEAGUES.includes(a.league)
      ? { community: a.community, title: typeof a.title === "string" ? a.title : a.community, league: a.league, rank: a.rank }
      : null;
  return { ...(w as unknown as Wrapped), alliance, badges };
}

/// The Alliance of the Week in each league: the fastest kill, then the most
/// raiders, then the community name. A league with no kill has none; rows a
/// newer or broken server sends that this page cannot read are left out.
export function alliancesOfWeek(kills: WeekKill[]): Partial<Record<League, WeekKill>> {
  const best: Partial<Record<League, WeekKill>> = {};
  for (const k of kills) {
    if (!k || !LEAGUES.includes(k.league) || !Number.isFinite(k.killSecs) || typeof k.community !== "string") continue;
    const b = best[k.league];
    const raiders = (x: WeekKill) => (Number.isFinite(x.raiders) ? x.raiders : 0);
    if (
      !b ||
      k.killSecs < b.killSecs ||
      (k.killSecs === b.killSecs &&
        (raiders(k) > raiders(b) || (raiders(k) === raiders(b) && k.community < b.community)))
    ) {
      best[k.league] = k;
    }
  }
  return best;
}

/// The line a player shares with their alliance once they know today's weakness.
export const weaknessLine = (kind: BossKind, type: AttackType, t: T) =>
  t("raidstead.share.line", {
    pest: t(`raidstead.bosses.${kind}.name`),
    type: t(`raidstead.types.${type}`)
  });

/// Another alliance shown as a town in the sky, with its rank in its league.
export type Neighbor = LeaderRow & { rank: number };

/// The alliances shown as towns in the sky: from the season's leaderboard
/// (sorted best first), those nearest in rank within the player's own league,
/// then the leaders of the other leagues. Never the player's own.
export function pickNeighbors(rows: LeaderRow[], own: string, n = 6): Neighbor[] {
  const seen = new Map<string, number>();
  const ranked = rows.map((r) => {
    const rank = (seen.get(r.league) ?? 0) + 1;
    seen.set(r.league, rank);
    return { ...r, rank };
  });
  const me = ranked.find((r) => r.community === own);
  const others = ranked.filter((r) => r.community !== own);
  const mine = me ? others.filter((r) => r.league === me.league) : [];
  // own league: closest rank first, the better one on a tie
  mine.sort((a, b) => Math.abs(a.rank - me!.rank) - Math.abs(b.rank - me!.rank) || a.rank - b.rank);
  const rest = others.filter((r) => !mine.includes(r)).sort((a, b) => a.rank - b.rank);
  return [...mine, ...rest].slice(0, n);
}

/// Time left until `at` (ms), split for a countdown: whole days, hours, minutes, seconds.
export function countdown(at: number, now: number): { days: number; hours: number; minutes: number; seconds: number; done: boolean } {
  const left = Math.max(0, Math.ceil((at - now) / 1000));
  return {
    days: Math.floor(left / 86_400),
    hours: Math.floor(left / 3_600) % 24,
    minutes: Math.floor(left / 60) % 60,
    seconds: left % 60,
    done: left === 0
  };
}

export interface PestWeek {
  week: number;
  kind: BossKind;
  /// when the week's pest arrives (ms)
  at: number;
}

/// The season's four raid weeks, one pest each, in the server's order, with the
/// day each one arrives. Names, tricks and pictures are all public.
export function pestCalendar(cal: Pick<Calendar, "startsAt">): PestWeek[] {
  const start = Date.parse(cal.startsAt);
  return BOSS_KINDS.map((kind, i) => ({ week: i + 1, kind, at: start + i * 7 * 86_400_000 }));
}

/// What each building's next stage costs in materials, by stage (the server's own table).
export const BUILD_COSTS: Record<BuildingId, number[]> = {
  tower: [30, 60, 90],
  workshop: [30, 60, 90],
  trophy: [30, 50, 80],
  hall: [40, 80, 120],
  library: [30, 60, 90],
  beacon: [30, 60, 90],
  walls: [40, 70, 100]
};

/// Why the player cannot build the next stage of a building right now, or null
/// when they can: a member builds only after raiding this season, no building
/// grows past the Hall, and the alliance needs the materials.
export function buildBlock(
  state: State,
  id: BuildingId
): "done" | "raid-first" | "hall-first" | "short" | null {
  const a = state.alliance;
  const stage = a?.town[id] ?? 3;
  if (!a || stage >= 3) return "done";
  if (!state.member || state.member.attackDays <= 0) return "raid-first";
  if (id !== "hall" && stage >= a.town.hall) return "hall-first";
  return a.mats < BUILD_COSTS[id][stage] ? "short" : null;
}

const NUDGE_KEY = "raidstead_build_nudge";

/// Whose build card: one per season, alliance and account (as the news marks).
const nudgeScope = (state: State) =>
  `${state.calendar.season}:${state.alliance?.community ?? ""}:${state.account.name}`;

/// Remembers the lowest materials seen since the card was dismissed. `mem` is
/// the page's own copy, for storage that refuses. Only this season's are kept.
function lowerNudge(scope: string, mats: number, mem: Record<string, number>) {
  mem[scope] = mats;
  const season = scope.split(":")[0];
  const stored = (ls.get(NUDGE_KEY) ?? {}) as Record<string, unknown>;
  const kept = Object.fromEntries(
    Object.entries(stored).filter(([k, v]) => k.startsWith(`${season}:`) && typeof v === "number")
  );
  ls.set(NUDGE_KEY, { ...kept, [scope]: mats });
  // saved: storage is shared with other tabs, so it speaks from now on
  if (((ls.get(NUDGE_KEY) ?? {}) as Record<string, unknown>)[scope] === mats) delete mem[scope];
}

/// The mark a dismissed card is waiting to see the materials grow past, if any.
function nudgeMark(state: State, mem: Record<string, number>): number | undefined {
  const scope = nudgeScope(state);
  // the page keeps its own copy only when storage failed to take it
  if (typeof mem[scope] === "number") return mem[scope];
  const stored = ((ls.get(NUDGE_KEY) ?? {}) as Record<string, unknown>)[scope];
  return typeof stored === "number" ? stored : undefined;
}

/// The raid screen's card telling the player their town can build something now.
/// Dismissed, it stays away until the materials grow past the lowest they have
/// been since (see lowerBuildNudge). Reads only: safe to call while rendering.
export function buildNudgeShown(state: State | null, mem: Record<string, number> = {}): boolean {
  if (!state?.alliance || !BUILDING_IDS.some((id) => buildBlock(state, id) === null)) return false;
  const low = nudgeMark(state, mem);
  return low === undefined || state.alliance.mats > low;
}

/// Each new state: materials below a dismissed card's mark (a build, the player's
/// own or an ally's) lower it, whether or not anything is affordable now.
/// Says whether it did.
export function lowerBuildNudge(state: State, mem: Record<string, number> = {}): boolean {
  const low = nudgeMark(state, mem);
  const mats = state.alliance?.mats;
  if (low === undefined || mats === undefined || mats >= low) return false;
  lowerNudge(nudgeScope(state), mats, mem);
  return true;
}

export const dismissBuildNudge = (state: State, mem: Record<string, number> = {}) =>
  lowerNudge(nudgeScope(state), state.alliance?.mats ?? 0, mem);

/// The alliance picker's order: most players now, then most last season, then
/// by title. A server that sends no counts keeps its own order.
export function sortCommunities(list: Community[]): Community[] {
  if (!list.some((c) => typeof c.players === "number")) return list;
  const title = (c: Community) => (c.title || c.name).toLowerCase();
  return [...list].sort(
    (a, b) =>
      (b.players ?? 0) - (a.players ?? 0) ||
      (b.lastSeason ?? 0) - (a.lastSeason ?? 0) ||
      title(a).localeCompare(title(b))
  );
}

