// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@ecency/sdk/hive", () => ({ callRPC: vi.fn() }));

import {
  parseSpeakSource,
  isPrivateIP,
  parseRange,
  isValidAuthor,
  isValidPermlink,
  buildAudioResponse
} from "@/app/api/speak-audio/_utils";
import { GET } from "@/app/api/speak-audio/route";
import { callRPC } from "@ecency/sdk/hive";

const LIKETU =
  "https://cdn.liketu.com/liketu/speak/erilej/re-liketu-speak-x/1781649490185-abc.webm";

// Helper: capture the CodedError shape ({ code, status }) without exporting the class.
function reject(src: unknown): { code: string; status: number } {
  try {
    parseSpeakSource(src);
  } catch (e) {
    return e as { code: string; status: number };
  }
  throw new Error("expected parseSpeakSource to throw");
}

describe("parseSpeakSource", () => {
  it("accepts a valid cdn.liketu.com audio url", () => {
    const url = parseSpeakSource(LIKETU);
    expect(url.hostname).toBe("cdn.liketu.com");
    expect(url.protocol).toBe("https:");
  });

  it.each(["webm", "mp3", "m4a", "ogg", "wav"])("accepts the .%s extension", (ext) => {
    const url = parseSpeakSource(`https://cdn.liketu.com/liketu/speak/x/clip.${ext}`);
    expect(url.pathname.endsWith(`.${ext}`)).toBe(true);
  });

  it("rejects a missing src", () => {
    expect(reject(undefined).code).toBe("MISSING_SRC");
    expect(reject("").code).toBe("MISSING_SRC");
    expect(reject(123 as unknown).code).toBe("MISSING_SRC");
  });

  it("rejects a malformed url", () => {
    expect(reject("not a url").code).toBe("INVALID_SRC");
  });

  it("rejects non-https schemes", () => {
    expect(reject("http://cdn.liketu.com/x/clip.webm").code).toBe("INVALID_SRC");
  });

  it("rejects any host that is not exactly cdn.liketu.com", () => {
    expect(reject("https://evil.com/x/clip.webm").code).toBe("HOST_NOT_ALLOWED");
    // suffix-spoof: a real attacker domain that ends with the allowed host as a label
    expect(reject("https://cdn.liketu.com.evil.tld/x/clip.webm").code).toBe("HOST_NOT_ALLOWED");
    // subdomain of the CDN is not the exact allowlisted host
    expect(reject("https://evil.cdn.liketu.com/x/clip.webm").code).toBe("HOST_NOT_ALLOWED");
  });

  it("rejects an explicit non-default port on the allowed host", () => {
    expect(reject("https://cdn.liketu.com:8080/x/clip.webm").code).toBe("HOST_NOT_ALLOWED");
  });

  it("rejects a host-mimicking path (not under /liketu/, no override possible)", () => {
    // pathname //evil.com/... is not a /liketu/ path so it's rejected; and even if
    // it weren't, fetchAudio fetches the validated URL whose host stays cdn.liketu.com.
    expect(reject("https://cdn.liketu.com//evil.com/clip.webm").code).toBe("UNSUPPORTED_PATH");
  });

  it("rejects an audio file outside the /liketu/ media root", () => {
    expect(reject("https://cdn.liketu.com/other/clip.webm").code).toBe("UNSUPPORTED_PATH");
  });

  it("rejects an unsupported / missing extension", () => {
    expect(reject("https://cdn.liketu.com/x/clip.txt").code).toBe("UNSUPPORTED_EXT");
    expect(reject("https://cdn.liketu.com/x/clip").code).toBe("UNSUPPORTED_EXT");
  });

  it("validation errors carry a 4xx status", () => {
    expect(reject(undefined).status).toBe(400);
    expect(reject("https://evil.com/x/clip.webm").status).toBe(400);
  });
});

describe("isPrivateIP", () => {
  it.each([
    "10.0.0.1",
    "127.0.0.1",
    "192.168.1.1",
    "172.16.0.1",
    "169.254.0.1",
    "100.64.0.1", // CGNAT
    "198.18.0.1", // benchmarking
    "192.0.2.5", // TEST-NET-1
    "203.0.113.9", // TEST-NET-3
    "::1",
    "fe80::1",
    "fc00::1",
    "2001:db8::1",
    "::ffff:10.0.0.1", // IPv4-mapped (dotted)
    "::ffff:0a00:0001" // IPv4-mapped (hex) == 10.0.0.1 — the gap a reviewer flagged
  ])("flags %s as private/reserved", (ip) => {
    expect(isPrivateIP(ip)).toBe(true);
  });

  it.each(["8.8.8.8", "1.1.1.1", "138.199.37.232", "2606:4700:4700::1111"])(
    "treats public %s as public",
    (ip) => {
      expect(isPrivateIP(ip)).toBe(false);
    }
  );

  it("treats an unparseable address as unsafe", () => {
    expect(isPrivateIP("not-an-ip")).toBe(true);
  });
});

describe("parseRange", () => {
  const SIZE = 1000;
  it("returns null when there is no range header or no honourable range", () => {
    expect(parseRange(null, SIZE)).toBeNull();
    expect(parseRange("bytes=abc", SIZE)).toBeNull();
    expect(parseRange("bytes=-", SIZE)).toBeNull();
  });

  it("parses a closed range", () => {
    expect(parseRange("bytes=0-99", SIZE)).toEqual({ start: 0, end: 99 });
  });

  it("parses an open-ended range to the last byte", () => {
    expect(parseRange("bytes=500-", SIZE)).toEqual({ start: 500, end: 999 });
  });

  it("parses a suffix range as the final N bytes", () => {
    expect(parseRange("bytes=-200", SIZE)).toEqual({ start: 800, end: 999 });
    // suffix larger than the file clamps to the whole file
    expect(parseRange("bytes=-5000", SIZE)).toEqual({ start: 0, end: 999 });
  });

  it("clamps an end past EOF", () => {
    expect(parseRange("bytes=900-9999", SIZE)).toEqual({ start: 900, end: 999 });
  });

  it("reports out-of-range as unsatisfiable", () => {
    expect(parseRange("bytes=1000-1100", SIZE)).toBe("unsatisfiable");
    expect(parseRange("bytes=50-10", SIZE)).toBe("unsatisfiable");
  });
});

describe("buildAudioResponse cache safety", () => {
  const body = Buffer.from("0123456789"); // size 10

  it("serves the full 200 with the immutable cache + Accept-Ranges", async () => {
    const res = buildAudioResponse(body, null);
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toContain("immutable");
    expect(res.headers.get("accept-ranges")).toBe("bytes");
    expect(res.headers.get("content-length")).toBe("10");
    expect(Buffer.from(await res.arrayBuffer()).toString()).toBe("0123456789");
  });

  it("serves a 206 partial as no-store so it can't poison the cached full response", async () => {
    const res = buildAudioResponse(body, "bytes=2-5");
    expect(res.status).toBe(206);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(res.headers.get("content-range")).toBe("bytes 2-5/10");
    expect(Buffer.from(await res.arrayBuffer()).toString()).toBe("2345");
  });

  it("returns a 416 (no-store) for an unsatisfiable range", async () => {
    const res = buildAudioResponse(body, "bytes=100-200");
    expect(res.status).toBe(416);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(res.headers.get("content-range")).toBe("bytes */10");
  });
});

describe("isValidAuthor / isValidPermlink", () => {
  it("accepts well-formed refs", () => {
    expect(isValidAuthor("erilej")).toBe(true);
    expect(isValidAuthor("good-karma")).toBe(true);
    expect(isValidPermlink("re-liketu-speak-2026-04-19-01-mqh83la5-pdfh8j")).toBe(true);
  });

  it("rejects malformed refs", () => {
    expect(isValidAuthor(null)).toBe(false);
    expect(isValidAuthor("")).toBe(false);
    expect(isValidAuthor("UPPER")).toBe(false);
    expect(isValidAuthor("a")).toBe(false); // too short
    expect(isValidAuthor("has space")).toBe(false);
    expect(isValidPermlink("Has-Capital")).toBe(false);
    expect(isValidPermlink("under_score")).toBe(false);
  });
});

describe("GET /api/speak-audio (author/permlink lookup)", () => {
  const get = (q: string) => GET(new NextRequest(`https://x/api/speak-audio?${q}`));

  const mockRpc = callRPC as ReturnType<typeof vi.fn>;

  beforeEach(() => mockRpc.mockReset());

  it("400 INVALID_REF for a malformed author/permlink (no lookup)", async () => {
    const res = await get("author=UP&permlink=x");
    expect(res.status).toBe(400);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(callRPC).not.toHaveBeenCalled();
  });

  it("404s a taken-down post without ever looking it up", async () => {
    // This route proxies the clip from our own origin under a long-lived
    // immutable cache key, so a takedown has to stop it before the fetch. It
    // reads the chain through the React-free hive entry, where the SDK query
    // filters never run, so it checks the published list itself (#1862).
    const res = await get("author=boombaam1&permlink=coinbase-customer-service-1-8o8-e007d0f9ebe");

    expect(res.status).toBe(404);
    expect(callRPC).not.toHaveBeenCalled();
  });

  it("404 NOT_SPEAK when the looked-up post has no speak audio", async () => {
    mockRpc.mockResolvedValueOnce({ json_metadata: { app: "ecency" } });
    const res = await get("author=erilej&permlink=not-a-voice-post");
    expect(res.status).toBe(404);
  });

  it("rejects a crafted on-chain audio_url that isn't a liketu media file", async () => {
    // An attacker posting a wave with a hostile audio_url must still be rejected:
    // the looked-up URL is validated before any fetch.
    mockRpc.mockResolvedValueOnce({
      json_metadata: { speak: { audio_url: "https://evil.com/x.webm" } }
    });
    const res = await get("author=erilej&permlink=crafted");
    expect(res.status).toBe(400);
  });

  it("tolerates a json_metadata returned as a raw JSON string", async () => {
    mockRpc.mockResolvedValueOnce({
      json_metadata: JSON.stringify({ speak: { audio_url: "https://evil.com/x.webm" } })
    });
    const res = await get("author=erilej&permlink=stringmeta");
    expect(res.status).toBe(400); // still validated -> rejected, proving the string was parsed
  });

  it("502 LOOKUP_FAILED when the bridge lookup throws", async () => {
    mockRpc.mockRejectedValueOnce(new Error("rpc down"));
    const res = await get("author=erilej&permlink=boom");
    expect(res.status).toBe(502);
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("retries a null lookup (lagging node) before returning a transient NOT_SPEAK", async () => {
    mockRpc.mockResolvedValue(null); // every node returns null
    const res = await get("author=erilej&permlink=fresh-wave");
    expect(res.status).toBe(404);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(mockRpc).toHaveBeenCalledTimes(3); // 1 initial + 2 retries
  });
});
