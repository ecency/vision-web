// A typed client for games-api's /v1/raidstead routes. The server decides
// every result; these are the shapes it answers with.

import type { BossKind, BuildingId } from "./art";

export type AttackType = "ink" | "signal" | "forge";
export type PowerId = "double" | "keen" | "breaker" | "wind";
export const POWERS: PowerId[] = ["double", "keen", "breaker", "wind"];

export interface Calendar { season: number; day: number; week: number; resting: boolean; startsAt: string; nextDayAt: string }
export interface Account { name: string; karma: number; shards: number; kills: number; scouts: number; badges: string[] }
export interface Trophy { season: number; community: string; title: string; kills: number; rank: number; league: "small" | "medium" | "large" }
export interface Raider { account: string; damage: number; attacks: number }
export interface Boss {
  kind: BossKind; hp: number; maxHp: number; alive: boolean; phase: number; gnats: number; waspHp: number;
  weakness: AttackType | null;
  echo: { side: 0 | 1; by: string; until: number } | null;
  reshuffleAt: number | null;
}
export interface Alliance {
  community: string; title: string; week: number; boss: Boss;
  town: Record<BuildingId, number>; mats: number; web: BuildingId | null; webTalk: string[];
  chest: number; chestGoal: number; buffToday: boolean; kills: number; raiders: Raider[];
  notes: { day: number; text: string }[];
}
export interface Member {
  energy: number; maxEnergy: number; scoutsLeft: number; rallied: boolean; quests: string[];
  powers: PowerId[]; equipped: PowerId[]; slots: number; attackDays: number;
}
export interface State { calendar: Calendar; account: Account; trophies: Trophy[]; alliance: Alliance | null; member: Member | null }

export type AttackResult = { energy: number; hp: number; maxHp: number } & (
  | { hit: "gnat"; cleared: number; gnatsLeft: number }
  | { hit: "wasp"; dodged: boolean; waspHp: number }
  | { hit: "echo"; side: 0 | 1 }
  | { hit: "boss"; damage: number; weak: boolean; paired: { by: string; damage: number } | null; killed: boolean; phaseShift: boolean; gnatsSpawned: number; waspArrived: boolean }
);
export interface ScoutResult { weakness: AttackType; tomorrow?: AttackType; scoutsLeft: number }
export interface Session { token: string; account: string; expiresAt: string }
export interface Community { name: string; title: string }
export interface LeaderRow { community: string; title: string; members: number; kills: number; damage: number; league: string }

export class RaidsteadError extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string, public readonly extra: Record<string, unknown> = {}) {
    super(message);
    this.name = "RaidsteadError";
  }
}

export interface ApiOptions {
  base: string;
  /// The game session token, if any.
  token: () => string | null;
  fetch?: typeof fetch;
}

export function createApi(opts: ApiOptions) {
  const f = opts.fetch ?? ((...a: Parameters<typeof fetch>) => fetch(...a));
  async function call<T>(method: "GET" | "POST" | "DELETE", path: string, body?: unknown, auth = true): Promise<T> {
    const headers: Record<string, string> = {};
    if (body !== undefined) headers["content-type"] = "application/json";
    const token = auth ? opts.token() : null;
    if (token) headers.authorization = `Bearer ${token}`;
    let res: Response;
    try {
      res = await f(opts.base + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    } catch {
      throw new RaidsteadError(0, "offline", "Could not reach the game server.");
    }
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      const { error, message, ...extra } = json;
      throw new RaidsteadError(res.status, typeof error === "string" ? error : "error", typeof message === "string" ? message : res.statusText, extra);
    }
    return json as T;
  }
  return {
    session: (proof: string) => call<Session>("POST", "/v1/raidstead/session", { proof }, false),
    signOut: () => call<{ ok: true }>("DELETE", "/v1/raidstead/session"),
    state: () => call<State>("GET", "/v1/raidstead/state"),
    communities: () => call<{ communities: Community[] }>("GET", "/v1/raidstead/communities"),
    join: (community: string) => call<State>("POST", "/v1/raidstead/join", { community }),
    scout: () => call<ScoutResult>("POST", "/v1/raidstead/scout"),
    attack: (type: AttackType, side: 0 | 1 = 0) => call<AttackResult>("POST", "/v1/raidstead/attack", { type, side }),
    rally: (key: string) => call<{ applied: { energy: number }; balance: number }>("POST", "/v1/raidstead/rally", { key }),
    chest: (key: string) => call<{ applied: { chest: number; filled: boolean }; balance: number }>("POST", "/v1/raidstead/chest", { key }),
    quests: () => call<{ claimed: string[]; quests: string[]; energy: number }>("POST", "/v1/raidstead/quests"),
    build: (building: BuildingId) => call<{ stage: number; cost: number; finished: boolean; mats: number }>("POST", "/v1/raidstead/build", { building }),
    talk: () => call<{ cleared: boolean; talkers: string[] }>("POST", "/v1/raidstead/talk"),
    powers: (power: PowerId, action: "craft" | "equip" | "unequip") => call<{ powers: PowerId[]; equipped: PowerId[]; slots: number }>("POST", "/v1/raidstead/powers", { power, action }),
    calendar: () => call<Calendar>("GET", "/v1/raidstead/calendar", undefined, false),
    leaderboard: (season?: number) => call<{ season: number; alliances: LeaderRow[] }>("GET", `/v1/raidstead/leaderboard${season ? `?season=${season}` : ""}`, undefined, false),
  };
}
export type RaidsteadApi = ReturnType<typeof createApi>;

/// A fresh key for one Points spend; the same key on a retry is the same spend.
export function spendKey(): string {
  const b = new Uint8Array(15);
  crypto.getRandomValues(b);
  return Array.from(b, (x) => x.toString(36).padStart(2, "0")).join("").slice(0, 24);
}
