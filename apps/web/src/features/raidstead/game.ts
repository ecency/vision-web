import type {
  AttackResult,
  AttackType,
  Impact,
  RaidsteadError,
  SceneWorld,
  State,
  View
} from "@ecency/raidstead";

type T = (key: string, values?: Record<string, unknown>) => string;

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
    gnats: a.boss.gnats,
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

/// The toast after an attack; follow-ups (a shift, a shield, the wasp) are
/// appended so one line tells the whole story.
export function attackMessage(r: AttackResult, type: AttackType, t: T): string {
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
      ? t("raidstead.toast.paired", { dmg: r.damage, by: r.paired.by })
      : t(r.weak ? "raidstead.toast.hit-weak" : "raidstead.toast.hit", {
          type: t(`raidstead.types.${type}`),
          dmg: r.damage
        })
  ];
  if (r.phaseShift) parts.push(t("raidstead.toast.shift"));
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
    ["offline", "insufficient_points", "daily_cap", "points_unavailable", "too_fast"].includes(code)
  ) {
    return t(`raidstead.errors.${code}`);
  }
  // rule refusals carry their own plain message from the server
  if (err?.status === 409 && typeof err.message === "string" && err.message) return err.message;
  return t("raidstead.errors.generic");
}

export const TIERS = [0, 50, 150, 400, 1000];
export const tierOf = (karma: number) =>
  TIERS.reduce((best, min, i) => (karma >= min ? i : best), 0);

/// A raid report the player can edit and post in their community.
export function buildReport(state: State, t: T): { title: string; body: string } | null {
  const a = state.alliance;
  if (!a) return null;
  const boss = t(`raidstead.bosses.${a.boss.kind}.name`);
  const title = t("raidstead.report.post-title", { name: a.title, boss, week: a.week });
  const lines = [
    t(a.boss.alive ? "raidstead.report.intro-fighting" : "raidstead.report.intro-won", {
      name: a.title,
      boss
    }),
    ""
  ];
  if (a.raiders.length) {
    lines.push(t("raidstead.report.raiders"), "");
    a.raiders
      .slice(0, 5)
      .forEach((r, i) =>
        lines.push(t("raidstead.report.line", { i: i + 1, name: r.account, dmg: r.damage }))
      );
    lines.push("");
  }
  lines.push(
    t("raidstead.report.town", { hall: a.town.hall, mats: a.mats }),
    "",
    t("raidstead.report.outro")
  );
  return { title, body: lines.join("\n") };
}
