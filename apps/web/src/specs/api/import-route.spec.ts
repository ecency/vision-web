// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// Mock node:dns/promises and node:net before importing route
vi.mock("node:dns/promises", () => {
  // `function`, not an arrow: the route does `new Resolver()`, and vitest 4
  // rejects an arrow mockImplementation used as a constructor ("not a
  // constructor"), which previously made every request fail validation -> 400.
  const Resolver = vi.fn().mockImplementation(function () {
    return {
      resolve4: vi.fn().mockResolvedValue(["93.184.216.34"]),
      resolve6: vi.fn().mockResolvedValue([])
    };
  });
  return { default: { Resolver }, Resolver };
});

vi.mock("node:net", () => {
  const isIP = vi.fn((ip: string) => {
    if (/^\d+\.\d+\.\d+\.\d+$/.test(ip)) return 4;
    if (ip.includes(":")) return 6;
    return 0;
  });
  return { default: { isIP }, isIP };
});

vi.mock("@ecency/sdk", () => ({
  getPost: vi.fn(),
  // The route loads the takedown lists itself, because a route handler never
  // executes the root layout (#1862).
  ConfigManager: { setDmcaLists: vi.fn() }
}));

vi.mock("jsdom", () => ({
  JSDOM: vi.fn()
}));

vi.mock("@mozilla/readability", () => ({
  Readability: vi.fn()
}));

vi.mock("turndown", () => ({
  __esModule: true,
  // `function`: the route does `new TurndownService()` (see Resolver note).
  default: vi.fn().mockImplementation(function () {
    return {
      turndown: vi.fn().mockReturnValue("# Test content")
    };
  })
}));

import { POST } from "@/app/api/import/route";
import { getPost, ConfigManager } from "@ecency/sdk";
import { JSDOM } from "jsdom";
import { Readability } from "@mozilla/readability";

// Captured at module scope: the loader runs when the route module is imported
// above, and every describe below clears mocks in beforeEach.
const dmcaListsLoadedAtImport = vi.mocked(ConfigManager.setDmcaLists).mock.calls.length;

// Unique per-call client IP so the route's per-IP rate limiter (module-level,
// persists across tests) gives each request its own bucket instead of sharing
// one header-less "unknown" bucket and 429-ing after a few tests.
let ipCounter = 0;

function makeRequest(body: unknown): NextRequest {
  ipCounter += 1;
  return new NextRequest("http://localhost/api/import", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "cf-connecting-ip": `test-client-${ipCounter}`
    },
    body: JSON.stringify(body)
  });
}

describe("POST /api/import", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 400 for missing url", async () => {
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("import-error-invalid-url");
  });

  it("returns 400 for non-string url", async () => {
    const res = await POST(makeRequest({ url: 123 }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("import-error-invalid-url");
  });

  it("returns 400 for malformed JSON body", async () => {
    const req = new NextRequest("http://localhost/api/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not json"
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("import-error-invalid-url");
  });

  it("returns 400 for private IP URL", async () => {
    const res = await POST(makeRequest({ url: "http://192.168.1.1/test" }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("import-error-invalid-url");
  });

  it("returns 400 for localhost URL", async () => {
    const res = await POST(makeRequest({ url: "http://localhost/test" }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("import-error-invalid-url");
  });

  it("returns 404 when Hive post not found", async () => {
    vi.mocked(getPost).mockResolvedValue(undefined);

    const res = await POST(makeRequest({ url: "https://ecency.com/@testuser/test-post" }));
    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.error).toBe("import-error-not-found");
  });

  // The REAL published list, not a mocked predicate: a stubbed
  // `isTakenDownPost` cannot tell a correct call from one with the arguments
  // swapped, and this path is the one that would republish a takedown.
  const LISTED_AUTHOR = "boombaam1";
  const LISTED_PERMLINK = "coinbase-customer-service-1-8o8-e007d0f9ebe";

  it("refuses to import a taken-down post, and does not fetch it", async () => {
    // Not "import it censored": this route only prefills the composer, so
    // handing back the takedown notice would seed a draft to be published
    // straight back to chain. Nothing importable, so the same 404 as a post
    // that is not there (#1862).
    vi.mocked(getPost).mockResolvedValue({
      title: "Copyrighted Content",
      body: "The body as published on chain.",
      json_metadata: { image: ["https://images.ecency.com/cover.jpg"] }
    } as never);

    const res = await POST(
      makeRequest({ url: `https://ecency.com/@${LISTED_AUTHOR}/${LISTED_PERMLINK}` })
    );
    const data = await res.json();

    expect(res.status).toBe(404);
    expect(data.error).toBe("import-error-not-found");
    expect(getPost).not.toHaveBeenCalled();
  });

  it("loads the takedown lists at import, not just in the source", async () => {
    // A source-level check cannot tell a real call from one shadowed by a
    // local of the same name; this is the route's own loader (#1862).
    expect(dmcaListsLoadedAtImport).toBeGreaterThan(0);
  });

  it("refuses it with a percent-encoded handle", async () => {
    // `/%40author/` is the spelling parseHiveUrl already decodes for, so it is
    // a shape this codebase expects to receive.
    const res = await POST(
      makeRequest({ url: `https://waivio.com/%40${LISTED_AUTHOR}/${LISTED_PERMLINK}` })
    );

    expect(res.status).toBe(404);
    expect(JSDOM).not.toHaveBeenCalled();
  });

  it("refuses it whatever the URL's casing", async () => {
    const res = await POST(
      makeRequest({
        url: `https://ecency.com/@${LISTED_AUTHOR.toUpperCase()}/${LISTED_PERMLINK.toUpperCase()}`
      })
    );

    expect(res.status).toBe(404);
    expect(getPost).not.toHaveBeenCalled();
  });

  it("refuses it on a Hive frontend the importer does not recognise", async () => {
    // parseHiveUrl only knows the frontends we import from, so an unrecognised
    // host used to fall through to the generic scraper, which returned that
    // frontend's rendering of the same taken-down post in full.
    const res = await POST(
      makeRequest({
        url: `https://waivio.com/@${LISTED_AUTHOR}/${LISTED_PERMLINK}`
      })
    );
    const data = await res.json();

    expect(res.status).toBe(404);
    expect(data.error).toBe("import-error-not-found");
    expect(JSDOM).not.toHaveBeenCalled();
  });

  it("returns Hive post data on success", async () => {
    vi.mocked(getPost).mockResolvedValue({
      title: "Test Title",
      body: "# Hello World",
      json_metadata: {
        tags: ["test", "hive"],
        image: ["https://example.com/img.jpg"]
      }
    } as any);

    const res = await POST(makeRequest({ url: "https://ecency.com/@testuser/test-post" }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.title).toBe("Test Title");
    expect(data.content).toBe("# Hello World");
    expect(data.thumbnail).toBe("https://example.com/img.jpg");
    expect(data.tags).toEqual(["test", "hive"]);
    expect(data.source).toBe("hive");
  });

  it.each([
    "https://snapie.io/@testuser/test-post",
    "https://snapie.io/hive/@testuser/test-post",
    "https://hivesuite.app/@testuser/test-post",
    "https://hivesuite.app/%40testuser/test-post"
  ])("resolves %s as an on-chain Hive post", async (url) => {
    vi.mocked(getPost).mockResolvedValue({
      title: "Test Title",
      body: "# Hello World",
      json_metadata: { tags: ["test"], image: [] }
    } as any);

    const res = await POST(makeRequest({ url }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.source).toBe("hive");
    expect(getPost).toHaveBeenCalledWith("testuser", "test-post");
  });

  it("returns external article data on success", async () => {
    const mockDoc = {
      querySelector: vi.fn().mockReturnValue(null),
      querySelectorAll: vi.fn().mockReturnValue([])
    };

    vi.mocked(JSDOM).mockImplementation(function () {
      return { window: { document: mockDoc } };
    } as any);

    vi.mocked(Readability).mockImplementation(function () {
      return {
        parse: () => ({
          title: "External Article",
          content: "<p>Article body</p>"
        })
      };
    } as any);

    // Mock global fetch for fetchPage
    const mockResponse = {
      ok: true,
      status: 200,
      url: "https://example.com/article",
      headers: new Headers({ "content-type": "text/html" }),
      body: {
        getReader: () => ({
          read: vi.fn()
            .mockResolvedValueOnce({
              done: false,
              value: new TextEncoder().encode("<html><body>test</body></html>")
            })
            .mockResolvedValueOnce({ done: true, value: undefined })
        })
      }
    };
    vi.spyOn(globalThis, "fetch").mockResolvedValue(mockResponse as any);

    const res = await POST(makeRequest({ url: "https://example.com/article" }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.title).toBe("External Article");
    expect(data.source).toBe("external");
    expect(data.content).toContain("Originally published on");
  });

  it.each([".md", ".json", ".discussion.json"])(
    "refuses it spelled as the %s endpoint on an unrecognised host",
    async (suffix) => {
      // Those endpoints hang off the permlink, so the URL's second segment is
      // not the canonical path the list holds. On a host parseHiveUrl knows
      // this fails closed at the chain lookup anyway; on one it does not know,
      // it went to the generic scraper.
      const res = await POST(
        makeRequest({
          url: `https://waivio.com/@${LISTED_AUTHOR}/${LISTED_PERMLINK}${suffix}`
        })
      );

      expect(res.status).toBe(404);
      expect(JSDOM).not.toHaveBeenCalled();
    }
  );

  it.each([
    ["a reader proxy carrying the target as an encoded path", (a: string, p: string) =>
      `https://r.example/${encodeURIComponent(`https://ecency.com/@${a}/${p}`)}`],
    ["a proxy carrying it in a query parameter", (a: string, p: string) =>
      `https://read.example/view?url=${encodeURIComponent(`https://ecency.com/@${a}/${p}`)}`]
  ])("refuses it behind %s", async (_label, build) => {
    // The `/` between author and permlink arrives percent-encoded, so scanning
    // raw path segments alone never sees the pair.
    const res = await POST(makeRequest({ url: build(LISTED_AUTHOR, LISTED_PERMLINK) }));

    expect(res.status).toBe(404);
    expect(JSDOM).not.toHaveBeenCalled();
  });

  it("refuses it before any DNS lookup happens at all", async () => {
    // Ordering matters twice over: run this after resolveAndValidate and a
    // blocked or unresolvable host turns a takedown into a 400 invalid-url,
    // and we have already looked up a host we will not serve.
    const { Resolver } = await import("node:dns/promises");

    const res = await POST(
      makeRequest({ url: `https://gone.example/@${LISTED_AUTHOR}/${LISTED_PERMLINK}` })
    );
    const data = await res.json();

    expect(res.status).toBe(404);
    expect(data.error).toBe("import-error-not-found");
    expect(vi.mocked(Resolver)).not.toHaveBeenCalled();
  });

  it("refuses a redirect that lands on a taken-down post", async () => {
    // fetchPage follows redirects by recursing into itself, so a perfectly
    // ordinary first URL can hand the generic scraper a listed post one hop
    // later. Checking only the URL the caller sent walks straight past that.
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      status: 302,
      headers: new Headers({
        location: `https://waivio.com/@${LISTED_AUTHOR}/${LISTED_PERMLINK}`
      }),
      body: { cancel: vi.fn() }
    } as never);

    const res = await POST(makeRequest({ url: "https://short.example/abc" }));
    const data = await res.json();

    expect(res.status).toBe(404);
    expect(data.error).toBe("import-error-not-found");
    // One hop only: the redirect target itself was never fetched.
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("returns 500 with mapped error code for known errors", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("FETCH_FAILED"));

    const res = await POST(makeRequest({ url: "https://example.com/article" }));
    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.error).toBe("import-error-fetch-failed");
  });

  it("returns 500 with generic error for unknown errors", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("SOMETHING_UNEXPECTED"));

    const res = await POST(makeRequest({ url: "https://example.com/article" }));
    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.error).toBe("import-failed");
  });

  it("returns 415 for non-HTML content type", async () => {
    const mockResponse = {
      ok: true,
      status: 200,
      url: "https://example.com/file.json",
      headers: new Headers({ "content-type": "application/json" }),
      body: {
        getReader: () => ({
          read: vi.fn().mockResolvedValueOnce({ done: true, value: undefined })
        })
      }
    };
    vi.spyOn(globalThis, "fetch").mockResolvedValue(mockResponse as any);

    const res = await POST(makeRequest({ url: "https://example.com/file.json" }));
    expect(res.status).toBe(415);
    const data = await res.json();
    expect(data.error).toBe("import-error-not-html");
  });

  it("returns 413 for oversized response", async () => {
    const mockResponse = {
      ok: true,
      status: 200,
      url: "https://example.com/huge",
      headers: new Headers({ "content-type": "text/html" }),
      body: {
        getReader: () => ({
          read: vi.fn()
            .mockResolvedValueOnce({
              done: false,
              value: new Uint8Array(6 * 1024 * 1024) // 6MB, exceeds 5MB limit
            })
            .mockResolvedValueOnce({ done: true, value: undefined }),
          cancel: vi.fn()
        })
      }
    };
    vi.spyOn(globalThis, "fetch").mockResolvedValue(mockResponse as any);

    const res = await POST(makeRequest({ url: "https://example.com/huge" }));
    expect(res.status).toBe(413);
    const data = await res.json();
    expect(data.error).toBe("import-error-too-large");
  });

  it("returns 500 for extract failure", async () => {
    const mockDoc = {
      querySelector: vi.fn().mockReturnValue(null),
      querySelectorAll: vi.fn().mockReturnValue([])
    };

    vi.mocked(JSDOM).mockImplementation(function () {
      return { window: { document: mockDoc } };
    } as any);

    vi.mocked(Readability).mockImplementation(function () {
      return { parse: () => null };
    } as any);

    const mockResponse = {
      ok: true,
      status: 200,
      url: "https://example.com/empty",
      headers: new Headers({ "content-type": "text/html" }),
      body: {
        getReader: () => ({
          read: vi.fn()
            .mockResolvedValueOnce({
              done: false,
              value: new TextEncoder().encode("<html><body></body></html>")
            })
            .mockResolvedValueOnce({ done: true, value: undefined })
        })
      }
    };
    vi.spyOn(globalThis, "fetch").mockResolvedValue(mockResponse as any);

    const res = await POST(makeRequest({ url: "https://example.com/empty" }));
    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.error).toBe("import-error-extract-failed");
  });
});
