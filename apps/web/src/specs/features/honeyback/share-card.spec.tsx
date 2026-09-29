import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/features/i18n", () => ({ initI18next: async () => undefined }));
// ImageResponse draws with a wasm renderer the test runner does not load;
// what matters here is which card is asked for and the headers it carries.
vi.mock("next/og", () => ({
  ImageResponse: class extends Response {
    constructor(_element: unknown, init: { headers?: Record<string, string> }) {
      super("png", { status: 200, headers: { "content-type": "image/png", ...init.headers } });
    }
  }
}));

import { renderHoneybackShareCard } from "@/features/honeyback/share-card";

const original = globalThis.fetch;
const answer = (response: () => Promise<Response>) => {
  globalThis.fetch = vi.fn(response) as unknown as typeof fetch;
};

describe("renderHoneybackShareCard", () => {
  afterEach(() => {
    globalThis.fetch = original;
  });

  it("draws the card for a share, cached like the page", async () => {
    answer(async () =>
      Response.json({
        id: "abc234defg",
        kind: "score",
        value: 1280,
        name: "@alice",
        createdAt: "2026-09-29T10:00:00Z"
      })
    );
    const response = await renderHoneybackShareCard("abc234defg");
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/png");
    expect(response.headers.get("cache-control")).toContain("s-maxage=86400");
  });

  it("draws the plain game card for an unknown share", async () => {
    answer(async () => new Response("{}", { status: 404 }));
    const response = await renderHoneybackShareCard("abc234defg");
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/png");
  });

  it("answers 503 that nobody stores when the games API is down", async () => {
    answer(async () => new Response("", { status: 500 }));
    const response = await renderHoneybackShareCard("abc234defh");
    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("retry-after")).toBe("60");
  });
});
