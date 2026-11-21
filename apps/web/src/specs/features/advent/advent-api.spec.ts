import { describe, expect, it, vi } from "vitest";
import { AdventError, createAdventApi } from "@/features/advent/advent-api";

function fakeFetch(status: number, body: unknown) {
  return vi.fn(async (_url: string, _init?: RequestInit) =>
    new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })
  );
}

describe("advent API client", () => {
  it("reads the season with the game session as a bearer token", async () => {
    const f = fakeFetch(200, { season: 2026, doors: [] });
    const api = createAdventApi({ base: "https://games.test", token: () => "rs1_abc", fetch: f as never });
    await expect(api.season(2026)).resolves.toEqual({ season: 2026, doors: [] });
    const [url, init] = f.mock.calls[0];
    expect(url).toBe("https://games.test/v1/advent/2026");
    expect(init?.method).toBe("GET");
    expect((init?.headers as Record<string, string>).authorization).toBe("Bearer rs1_abc");
  });

  it("sends no authorization without a session", async () => {
    const f = fakeFetch(200, { season: 2026, doors: [] });
    const api = createAdventApi({ base: "https://games.test", token: () => null, fetch: f as never });
    await api.season(2026);
    expect((f.mock.calls[0][1]?.headers as Record<string, string>).authorization).toBeUndefined();
  });

  it("posts a written answer, a pick and the Wave to the door's routes", async () => {
    const f = fakeFetch(200, { ok: true, late: false });
    const api = createAdventApi({ base: "https://games.test", token: () => "t", fetch: f as never });
    await api.answer(2026, 6, { answer: "hello" });
    await api.answer(2026, 7, { choice: 2 });
    await api.wave(2026, 6, "wave-abc");
    await api.open(2026, 6);
    const calls = f.mock.calls.map(([u, i]) => [i?.method, u, i?.body]);
    expect(calls).toEqual([
      ["POST", "https://games.test/v1/advent/2026/doors/6/answer", JSON.stringify({ answer: "hello" })],
      ["POST", "https://games.test/v1/advent/2026/doors/7/answer", JSON.stringify({ choice: 2 })],
      ["POST", "https://games.test/v1/advent/2026/doors/6/wave", JSON.stringify({ permlink: "wave-abc" })],
      ["POST", "https://games.test/v1/advent/2026/doors/6/open", undefined]
    ]);
  });

  it("reads a drawn door's result and the grand draw without a session", async () => {
    const f = fakeFetch(200, { day: 4, winners: [] });
    const api = createAdventApi({ base: "https://games.test", token: () => "t", fetch: f as never });
    await api.result(2026, 4);
    await api.grand(2026);
    const [url, init] = f.mock.calls[0];
    expect(url).toBe("https://games.test/v1/advent/2026/doors/4/result");
    expect((init?.headers as Record<string, string>).authorization).toBeUndefined();
    const [gUrl, gInit] = f.mock.calls[1];
    expect(gUrl).toBe("https://games.test/v1/advent/2026/grand");
    expect((gInit?.headers as Record<string, string>).authorization).toBeUndefined();
  });

  it("turns an error answer into a typed error", async () => {
    const f = fakeFetch(409, { error: "already_answered", message: "You already answered this door." });
    const api = createAdventApi({ base: "https://games.test", token: () => "t", fetch: f as never });
    const e = await api.answer(2026, 6, { answer: "x" }).catch((x) => x);
    expect(e).toBeInstanceOf(AdventError);
    expect(e.status).toBe(409);
    expect(e.code).toBe("already_answered");
  });

  it("reports an unreachable server as offline", async () => {
    const f = vi.fn(async () => {
      throw new TypeError("fetch failed");
    });
    const api = createAdventApi({ base: "https://games.test", token: () => null, fetch: f as never });
    const e = await api.season(2026).catch((x) => x);
    expect(e).toBeInstanceOf(AdventError);
    expect(e.code).toBe("offline");
  });
});
