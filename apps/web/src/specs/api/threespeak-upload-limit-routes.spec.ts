// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// The proxy routes hold the server-only 3Speak API key; feed a fake through
// EcencyConfigManager.getConfigValue.
vi.mock("@/config", () => ({
  EcencyConfigManager: {
    getConfigValue: (pick: (c: any) => unknown) =>
      pick({
        thirdPartyFeatures: {
          threeSpeak: {
            uploading: { embedEndpoint: "https://embed.example", serverApiKey: "test-key" }
          }
        }
      })
  }
}));

vi.mock("@/server/hivesigner-verify", () => ({
  verifyHsAccessToken: vi.fn(async () => ({ ok: true, username: "alice" }))
}));

import { POST as tokenPOST } from "@/app/api/threespeak/upload-token/route";
import { POST as quotaPOST } from "@/app/api/threespeak/upload-quota/route";

const LIMIT_BODY = {
  error: "Daily video upload limit reached",
  code: "daily_upload_limit",
  kind: "video",
  limit: 1,
  used: 1,
  next_at: "2026-11-21T14:32:00Z",
  retry_after_seconds: 52320,
  message:
    "Free accounts can upload 1 video per 24 hours. Your next video upload is possible at 2026-11-21T14:32:00Z. 3Speak Pro removes this limit.",
  upgrade_url: "https://3speak.tv/wallet/alice#pro"
};

function req(path: string, body: Record<string, unknown>) {
  return new NextRequest(`https://ecency.com${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: "https://ecency.com" },
    body: JSON.stringify(body)
  });
}

function upstream(status: number, body: unknown, headers: Record<string, string> = {}) {
  return new Response(typeof body === "string" ? body : JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers }
  });
}

describe("POST /api/threespeak/upload-token, daily upload limit", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  it("hands the 429 refusal on with its fields and Retry-After", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(upstream(429, LIMIT_BODY, { "Retry-After": "52320" }))
    );

    const res = await tokenPOST(req("/api/threespeak/upload-token", { owner: "alice", code: "c" }));

    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("52320");
    const body = await res.json();
    expect(body).toMatchObject({
      code: "daily_upload_limit",
      kind: "video",
      limit: 1,
      used: 1,
      next_at: "2026-11-21T14:32:00Z",
      retry_after_seconds: 52320,
      message: LIMIT_BODY.message,
      upgrade_url: "https://3speak.tv/wallet/alice#pro"
    });
  });

  it("drops an upgrade_url that is not an https 3Speak link", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(upstream(429, { ...LIMIT_BODY, upgrade_url: "https://evil.example/pro" }))
    );

    const res = await tokenPOST(req("/api/threespeak/upload-token", { owner: "alice", code: "c" }));
    expect(res.status).toBe(429);
    expect((await res.json()).upgrade_url).toBeNull();
  });

  it("keeps the generic error for any other 429", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(upstream(429, { error: "Too many requests" })));

    const res = await tokenPOST(req("/api/threespeak/upload-token", { owner: "alice", code: "c" }));
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ error: "Failed to obtain upload token" });
  });
});

describe("POST /api/threespeak/upload-quota", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  it("asks 3Speak for the owner's quota with the server key", async () => {
    const fetchSpy = vi.fn().mockResolvedValue(
      upstream(200, {
        enabled: true,
        exempt: false,
        reason: null,
        video: { limit: 1, used: 1, remaining: 0, next_at: "2026-11-21T14:32:00Z" },
        short: { limit: 3, used: 0, remaining: 3, next_at: null }
      })
    );
    vi.stubGlobal("fetch", fetchSpy);

    const res = await quotaPOST(req("/api/threespeak/upload-quota", { owner: "alice", code: "c" }));

    expect(res.status).toBe(200);
    expect(fetchSpy.mock.calls[0][0]).toBe("https://embed.example/uploads/quota?owner=alice");
    expect(fetchSpy.mock.calls[0][1].headers["X-API-Key"]).toBe("test-key");
    expect(await res.json()).toEqual({
      enabled: true,
      exempt: false,
      video: { limit: 1, used: 1, remaining: 0, next_at: "2026-11-21T14:32:00Z" },
      short: { limit: 3, used: 0, remaining: 3, next_at: null }
    });
  });

  it("refuses a quota lookup for someone else", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const res = await quotaPOST(req("/api/threespeak/upload-quota", { owner: "bob", code: "c" }));

    expect(res.status).toBe(403);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("passes a 404 from a 3Speak server without limits through as an error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(upstream(404, "Not Found")));

    const res = await quotaPOST(req("/api/threespeak/upload-quota", { owner: "alice", code: "c" }));
    expect(res.status).toBe(404);
  });
});
