import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Plausible config is server-only; feed a fake through EcencyConfigManager.getConfigValue,
// which the route calls with a selector over the config object.
const FAKE_CONFIG = {
  visionFeatures: {
    plausible: { enabled: true, host: "https://plausible.test", apiKey: "k", siteId: "s" }
  }
};

vi.mock("@/config", () => ({
  EcencyConfigManager: {
    getConfigValue: (fn: (c: unknown) => unknown) => fn(FAKE_CONFIG)
  }
}));

// The global @/utils mock only exports random/getAccessToken; the route needs the real
// safeDecodeURIComponent. Pull it from its own lightweight source module via importActual so
// the mock uses the real implementation (no duplicated logic that could drift) without
// dragging in the heavy @/utils barrel.
vi.mock("@/utils", async () => {
  const { safeDecodeURIComponent } = await vi.importActual<
    typeof import("@/utils/safe-decode-uri")
  >("@/utils/safe-decode-uri");
  return { safeDecodeURIComponent };
});

const VALID = {
  url: "/@alice/my-post",
  metrics: ["visitors", "visits"],
  dimensions: ["visit:source"],
  date_range: ["2024-01-01", "2024-06-01"]
};

function makeReq(body: unknown) {
  return { json: async () => body } as never;
}

async function callPost(body: unknown) {
  const { POST } = await import("@/app/api/stats/route");
  const res = await POST(makeReq(body));
  let json: unknown;
  try {
    json = await res.json();
  } catch {
    json = undefined;
  }
  return { status: res.status, json };
}

describe("POST /api/stats security boundaries", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    // Fresh module = fresh in-memory response cache per test.
    vi.resetModules();
    fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ results: [{ metrics: [1, 2], dimensions: [] }] })
    }));
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("rejects a non-JSON body with 400 instead of throwing", async () => {
    const { POST } = await import("@/app/api/stats/route");
    const req = new Request("http://localhost/api/stats", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: "id=1&user=test"
    });
    const res = await POST(req as never);
    expect(res.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects a JSON body that is not an object with 400", async () => {
    expect((await callPost(null)).status).toBe(400);
    expect((await callPost([VALID])).status).toBe(400);
    expect((await callPost("/@alice/my-post")).status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects a bare '/' path with 403 and never queries Plausible", async () => {
    const { status } = await callPost({ ...VALID, url: "/" });
    expect(status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects profile prefixes (aggregation) with 403", async () => {
    expect((await callPost({ ...VALID, url: "/@alice" })).status).toBe(403);
    expect((await callPost({ ...VALID, url: "/@alice/" })).status).toBe(403);
  });

  it("rejects the %2F-encoded root bypass with 403", async () => {
    expect((await callPost({ ...VALID, url: "%2F" })).status).toBe(403);
  });

  it("rejects non-allowlisted or malformed metrics with 400", async () => {
    expect((await callPost({ ...VALID, metrics: ["visit:utm_source"] })).status).toBe(400);
    expect((await callPost({ ...VALID, metrics: [] })).status).toBe(400);
    expect((await callPost({ ...VALID, metrics: "visitors" })).status).toBe(400);
  });

  it("rejects non-allowlisted dimensions with 400", async () => {
    expect((await callPost({ ...VALID, dimensions: ["visit:utm_campaign"] })).status).toBe(400);
    expect((await callPost({ ...VALID, dimensions: ["event:props:plan"] })).status).toBe(400);
  });

  it("rejects the removed 'all' keyword with 400", async () => {
    expect((await callPost({ ...VALID, date_range: "all" })).status).toBe(400);
  });

  it("rejects reversed, absurd-span, impossible-calendar and wrong-length ranges", async () => {
    expect((await callPost({ ...VALID, date_range: ["2024-06-01", "2024-01-01"] })).status).toBe(
      400
    );
    expect((await callPost({ ...VALID, date_range: ["0001-01-01", "9999-12-31"] })).status).toBe(
      400
    );
    expect((await callPost({ ...VALID, date_range: ["2023-02-30", "2023-06-01"] })).status).toBe(
      400
    );
    expect((await callPost({ ...VALID, date_range: ["2024-01-01"] })).status).toBe(400);
  });

  it("accepts a valid single-post query and proxies to Plausible", async () => {
    const { status } = await callPost(VALID);
    expect(status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("accepts a totals query with no dimensions and a bounded keyword range", async () => {
    expect(
      (await callPost({ url: "/@bob/post", metrics: ["visitors"], date_range: "30d" })).status
    ).toBe(200);
  });

  it("serves a repeated identical query from cache (single upstream scan)", async () => {
    await callPost(VALID);
    await callPost(VALID);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("coalesces a concurrent burst of identical queries into one upstream scan", async () => {
    let releaseFetch: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      releaseFetch = resolve;
    });
    fetchMock.mockImplementation(async () => {
      await gate; // hold the scan open until every concurrent request has coalesced
      return { ok: true, status: 200, json: async () => ({ results: [] }) };
    });

    const all = Promise.all(Array.from({ length: 5 }, () => callPost(VALID)));
    await new Promise((r) => setTimeout(r, 10)); // let all 5 reach the in-flight await
    releaseFetch();
    const results = await all;

    expect(fetchMock).toHaveBeenCalledTimes(1);
    results.forEach((r) => expect(r.status).toBe(200));
  });

  it("rejects cache-key-inflating metrics: duplicates and over-length arrays", async () => {
    expect((await callPost({ ...VALID, metrics: ["visitors", "visitors"] })).status).toBe(400);
    expect(
      (
        await callPost({
          ...VALID,
          metrics: ["visitors", "visits", "pageviews", "visit_duration", "visits"]
        })
      ).status
    ).toBe(400);
  });

  it("rejects more than one dimension (legitimate queries use at most one)", async () => {
    expect(
      (await callPost({ ...VALID, dimensions: ["visit:source", "visit:device"] })).status
    ).toBe(400);
    expect(
      (await callPost({ ...VALID, dimensions: ["visit:source", "visit:source"] })).status
    ).toBe(400);
  });

  it("rejects non-YYYY-MM-DD date representations (a cache-key bypass)", async () => {
    expect(
      (await callPost({ ...VALID, date_range: ["2024-01-01T00:00:00Z", "2024-06-01"] })).status
    ).toBe(400);
    expect((await callPost({ ...VALID, date_range: ["2024-1-1", "2024-06-01"] })).status).toBe(400);
  });
});
