import { describe, expect, it } from "vitest";
import { createApi } from "./api";

// The season calendar is public: asked without the session token, and past any cache when fresh.
describe("calendar", () => {
  const seen: { url: string; headers: Record<string, string> }[] = [];
  const api = createApi({
    base: "https://games.example",
    token: () => "rs1_secret",
    fetch: async (url, init) => {
      seen.push({ url: String(url), headers: (init?.headers ?? {}) as Record<string, string> });
      return new Response(JSON.stringify({ season: 0, startsAt: "2026-10-10T00:00:00.000Z", now: 1 }), { status: 200 });
    }
  });

  it("asks without the session token", async () => {
    seen.length = 0;
    expect(await api.calendar()).toMatchObject({ season: 0, now: 1 });
    expect(seen[0].url).toBe("https://games.example/v1/raidstead/calendar");
    expect(seen[0].headers.authorization).toBeUndefined();
  });

  it("asks past a cached copy when fresh", async () => {
    seen.length = 0;
    await api.calendar(true);
    expect(seen[0].url).toMatch(/^https:\/\/games\.example\/v1\/raidstead\/calendar\?at=\d+$/);
    expect(seen[0].headers.authorization).toBeUndefined();
  });
});

// The leaderboard is public and can be read one league at a time.
describe("leaderboard", () => {
  const urls: string[] = [];
  const api = createApi({
    base: "https://games.example",
    token: () => null,
    fetch: async (url) => {
      urls.push(String(url));
      return new Response(JSON.stringify({ season: 2, alliances: [] }), { status: 200 });
    }
  });

  it("sends the league and season it is asked for", async () => {
    urls.length = 0;
    await api.leaderboard({ league: "large" });
    await api.leaderboard({ season: 2, league: "small" });
    await api.leaderboard({ season: 2 });
    await api.leaderboard();
    expect(urls).toEqual([
      "https://games.example/v1/raidstead/leaderboard?league=large",
      "https://games.example/v1/raidstead/leaderboard?season=2&league=small",
      "https://games.example/v1/raidstead/leaderboard?season=2",
      "https://games.example/v1/raidstead/leaderboard"
    ]);
  });
});

// Help another town: the list is asked for with the session, an attack posts the town and the type.
describe("help", () => {
  const seen: { url: string; method?: string; body?: string; auth?: string }[] = [];
  const api = createApi({
    base: "https://games.example",
    token: () => "rs1_secret",
    fetch: async (url, init) => {
      seen.push({
        url: String(url),
        method: init?.method,
        body: init?.body as string | undefined,
        auth: ((init?.headers ?? {}) as Record<string, string>).authorization
      });
      return new Response(JSON.stringify({ targets: [] }), { status: 200 });
    }
  });

  it("lists targets and posts an attack on one", async () => {
    seen.length = 0;
    expect(await api.help()).toEqual({ targets: [] });
    await api.helpAttack("hive-1", "ink");
    expect(seen).toEqual([
      { url: "https://games.example/v1/raidstead/help", method: "GET", body: undefined, auth: "Bearer rs1_secret" },
      {
        url: "https://games.example/v1/raidstead/help/attack",
        method: "POST",
        body: JSON.stringify({ community: "hive-1", type: "ink" }),
        auth: "Bearer rs1_secret"
      }
    ]);
  });
});

// The week's kills are public: asked without the session, for the last finished week by default.
describe("week", () => {
  const seen: { url: string; auth?: string }[] = [];
  const api = createApi({
    base: "https://games.example",
    token: () => "rs1_secret",
    fetch: async (url, init) => {
      seen.push({ url: String(url), auth: ((init?.headers ?? {}) as Record<string, string>).authorization });
      return new Response(JSON.stringify({ season: 2, week: 1, kills: [] }), { status: 200 });
    }
  });

  it("asks without the session token, for a given week or the last finished one", async () => {
    seen.length = 0;
    expect(await api.week()).toEqual({ season: 2, week: 1, kills: [] });
    await api.week({ season: 2, week: 3 });
    expect(seen).toEqual([
      { url: "https://games.example/v1/raidstead/week", auth: undefined },
      { url: "https://games.example/v1/raidstead/week?season=2&week=3", auth: undefined }
    ]);
  });
});
