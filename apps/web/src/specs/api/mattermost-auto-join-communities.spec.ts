import { describe, it, expect, vi } from "vitest";

vi.mock("@/server/hive-community", () => ({
  findHiveCommunity: vi.fn()
}));

async function loadModule() {
  process.env.MATTERMOST_BASE_URL = "https://chat.test/api/v4";
  process.env.MATTERMOST_ADMIN_TOKEN = "admin-token";
  process.env.MATTERMOST_TEAM_ID = "team-1";
  return await import("@/server/mattermost");
}

const subs = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ id: `hive-${100000 + i}`, title: `C${i}` }));

describe("pickAutoJoinCommunities", () => {
  it("caps bootstrap auto-join at 10 communities, keeping Hive's order", async () => {
    const { pickAutoJoinCommunities, MAX_AUTO_JOIN_COMMUNITIES } = await loadModule();
    expect(MAX_AUTO_JOIN_COMMUNITIES).toBe(10);

    const picked = pickAutoJoinCommunities(subs(703), new Set());

    expect(picked.size).toBe(10);
    expect(Array.from(picked.keys())).toEqual(subs(10).map((s) => s.id));
    expect(picked.get("hive-100000")).toBe("C0");
  });

  it("skips left channels and duplicates without letting them use up the cap", async () => {
    const { pickAutoJoinCommunities } = await loadModule();
    const list = [{ id: "hive-100000", title: "dup" }, ...subs(12)];

    const picked = pickAutoJoinCommunities(list, new Set(["hive-100001", "hive-100002"]));

    expect(Array.from(picked.keys())).toEqual([
      "hive-100000",
      ...subs(12)
        .slice(3, 12)
        .map((s) => s.id)
    ]);
    // first occurrence wins for duplicates
    expect(picked.get("hive-100000")).toBe("dup");
  });

  it("matches left channels case-insensitively", async () => {
    const { pickAutoJoinCommunities } = await loadModule();
    const picked = pickAutoJoinCommunities([{ id: "Hive-100000" }], new Set(["hive-100000"]));
    expect(picked.size).toBe(0);
  });

  it("returns everything when under the cap", async () => {
    const { pickAutoJoinCommunities } = await loadModule();
    expect(pickAutoJoinCommunities(subs(3), new Set()).size).toBe(3);
  });
});
