import { describe, it, expect, vi, afterEach } from "vitest";

// #2023 review: a Mattermost 403 is a permission answer (not a member of the
// channel), not a lost session. Mapped to 401 it made the client run the whole
// bootstrap again and refetch every chat query.

vi.mock("next/headers", () => ({
  headers: async () => ({ get: () => null }),
  cookies: async () => ({ get: () => undefined, set: () => undefined })
}));

async function routeErrorFor(status: number) {
  vi.resetModules();
  vi.stubEnv("MATTERMOST_BASE_URL", "https://mm.test/api/v4");
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify({ message: "nope" }), { status }))
  );
  const { mmUserFetch, handleMattermostError } = await import("@/server/mattermost");
  const error = await mmUserFetch("/channels/c1/posts", "tok").catch((e) => e);
  return handleMattermostError(error);
}

describe("chat API status for a Mattermost auth answer (#2023)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("answers a Mattermost 403 with 403, which the channel view reads as not a member", async () => {
    const res = await routeErrorFor(403);
    expect(res.status).toBe(403);
    expect(((await res.json()) as { error: string }).error).toBe("forbidden");
  });

  it("still answers a Mattermost 401 (session gone) with 401", async () => {
    const res = await routeErrorFor(401);
    expect(res.status).toBe(401);
    expect(((await res.json()) as { error: string }).error).toBe("unauthorized");
  });
});
