import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The base URL written into canonical links, feeds and share metadata comes
// from the request only when the host is one of the site's own. Any other
// Host or X-Forwarded-Host value falls back to the configured base.

const h = vi.hoisted(() => ({ headers: {} as Record<string, string> }));
vi.mock("next/headers", () => ({
  headers: async () => ({ get: (name: string) => h.headers[name.toLowerCase()] ?? null })
}));

import { getServerAppBase } from "@/utils/server-app-base";

const saved = { a: process.env.NEXT_PUBLIC_APP_BASE, b: process.env.APP_BASE };
beforeEach(() => {
  delete process.env.NEXT_PUBLIC_APP_BASE;
  delete process.env.APP_BASE;
});
afterEach(() => {
  process.env.NEXT_PUBLIC_APP_BASE = saved.a;
  process.env.APP_BASE = saved.b;
  if (saved.a === undefined) delete process.env.NEXT_PUBLIC_APP_BASE;
  if (saved.b === undefined) delete process.env.APP_BASE;
});

describe("getServerAppBase", () => {
  it.each([
    [{ host: "ecency.com" }, "https://ecency.com"],
    [{ "x-forwarded-host": "alpha.ecency.com", "x-forwarded-proto": "https" }, "https://alpha.ecency.com"]
  ])("uses the site's own host %j", async (headers, base) => {
    h.headers = headers;
    await expect(getServerAppBase()).resolves.toBe(base);
  });

  it.each([
    { "x-forwarded-host": "example.org", host: "ecency.com" },
    { host: "example.org" },
    { host: "ecency.com.example.org" },
    { host: "evil-ecency.com" },
    { host: "ecency.com", "x-forwarded-proto": "javascript" }
  ])("falls back to the configured base for %j", async (headers) => {
    h.headers = headers;
    await expect(getServerAppBase()).resolves.toBe("https://ecency.com");
  });

  it("prefers the configured base over any header", async () => {
    process.env.APP_BASE = "https://staging.example";
    h.headers = { host: "ecency.com" };
    await expect(getServerAppBase()).resolves.toBe("https://staging.example");
  });
});
