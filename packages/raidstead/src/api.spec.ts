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
