import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// /api/stats and /api/profile-insights answered HTTP 200 with a `{status: 400|404}` body,
// so callers checking response.ok treated a disabled feature or a missing url as success
// and rendered zeros (#1973). They must answer with the real HTTP status.

const { config } = vi.hoisted(() => ({
  config: {
    visionFeatures: {
      plausible: { enabled: true, host: "https://plausible.test", apiKey: "k", siteId: "s" }
    }
  }
}));

vi.mock("@/config", () => ({
  EcencyConfigManager: {
    getConfigValue: (fn: (c: unknown) => unknown) => fn(config)
  }
}));

vi.mock("@/utils", async () => {
  const { safeDecodeURIComponent } = await vi.importActual<
    typeof import("@/utils/safe-decode-uri")
  >("@/utils/safe-decode-uri");
  return { safeDecodeURIComponent };
});

function makeReq(body: unknown) {
  return { json: async () => body } as never;
}

describe("plausible proxy routes answer with real HTTP status codes", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.resetModules();
    config.visionFeatures.plausible.enabled = true;
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("/api/stats answers 404 when plausible is disabled", async () => {
    config.visionFeatures.plausible.enabled = false;
    const { POST } = await import("@/app/api/stats/route");
    const res = await POST(makeReq({ url: "/@alice/post" }));
    expect(res.status).toBe(404);
    expect(res.ok).toBe(false);
  });

  it("/api/stats answers 400 when url is missing", async () => {
    const { POST } = await import("@/app/api/stats/route");
    const res = await POST(makeReq({ metrics: ["visitors"] }));
    expect(res.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("/api/profile-insights answers 404 when plausible is disabled", async () => {
    config.visionFeatures.plausible.enabled = false;
    const { POST } = await import("@/app/api/profile-insights/route");
    const res = await POST(makeReq({ username: "alice" }));
    expect(res.status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
