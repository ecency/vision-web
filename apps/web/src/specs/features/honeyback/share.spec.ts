import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fetchHoneybackShare,
  honeybackShareHeadline,
  RETRY_DELAY_MS,
  honeybackWaveComposeUrl,
  isHoneybackShareId,
  parseHoneybackShare,
  Translate
} from "@/features/honeyback/share";

const t: Translate = (key, values) =>
  `${key.split(".").pop()}|${Object.entries(values ?? {})
    .map(([k, v]) => `${k}=${v}`)
    .join(",")}`;

const share = {
  id: "abc234defg",
  kind: "score" as const,
  value: 1280,
  name: "@alice",
  createdAt: "2026-09-23T10:00:00.000Z"
};

describe("honeyback share", () => {
  it("accepts only the id alphabet the games API issues", () => {
    expect(isHoneybackShareId("abc234defg")).toBe(true);
    expect(isHoneybackShareId("abc123def")).toBe(false);
    expect(isHoneybackShareId("abc234defgh")).toBe(false);
    expect(isHoneybackShareId("abc0O1Ilxy")).toBe(false);
    expect(isHoneybackShareId("../etc/pas")).toBe(false);
    expect(isHoneybackShareId(undefined)).toBe(false);
  });

  it("parses the documented response and nothing looser", () => {
    expect(parseHoneybackShare(share)).toEqual(share);
    expect(parseHoneybackShare({ ...share, name: "  Bee 1a2b " })?.name).toBe("Bee 1a2b");
    expect(parseHoneybackShare({ ...share, kind: "coins" })).toBeNull();
    expect(parseHoneybackShare({ ...share, value: 0 })).toBeNull();
    expect(parseHoneybackShare({ ...share, value: "12" })).toBeNull();
    expect(parseHoneybackShare({ ...share, name: "" })).toBeNull();
    expect(parseHoneybackShare({ ...share, createdAt: "yesterday" })).toBeNull();
    expect(parseHoneybackShare({ ...share, id: "bad" })).toBeNull();
    expect(parseHoneybackShare(null)).toBeNull();
    expect(parseHoneybackShare("abc234defg")).toBeNull();
  });

  it("builds the headline per kind with the formatted value", () => {
    expect(honeybackShareHeadline(share, t)).toBe("score|name=@alice,value=1,280");
    expect(honeybackShareHeadline({ ...share, kind: "streak", value: 7 }, t)).toBe(
      "streak|name=@alice,value=7"
    );
  });

  it("prefills the wave with the headline and the share link", () => {
    const url = honeybackWaveComposeUrl(share, t);
    expect(url.startsWith("/waves?text=")).toBe(true);
    expect(decodeURIComponent(url.slice("/waves?text=".length))).toBe(
      "score|name=@alice,value=1,280 https://ecency.com/honeyback-share/abc234defg"
    );
  });

  describe("fetchHoneybackShare", () => {
    const original = globalThis.fetch;
    afterEach(() => {
      globalThis.fetch = original;
      vi.useRealTimers();
    });
    const answer = (...responses: Array<() => Promise<Response>>) => {
      const mock = vi.fn();
      responses.forEach((r) => mock.mockImplementationOnce(r));
      globalThis.fetch = mock as unknown as typeof fetch;
      return mock;
    };
    const json = (status: number, body: unknown) => () =>
      Promise.resolve(new Response(JSON.stringify(body), { status }));
    // The retry sleeps RETRY_DELAY_MS; the clock is faked so the test does not.
    const lookup = async (id: string) => {
      vi.useFakeTimers();
      const pending = fetchHoneybackShare(id);
      await vi.advanceTimersByTimeAsync(RETRY_DELAY_MS);
      return pending;
    };

    it("never asks the API for an id outside the alphabet", async () => {
      const mock = answer();
      expect(await lookup("../etc/pas")).toEqual({ status: "missing" });
      expect(mock).not.toHaveBeenCalled();
    });

    it("asks the API once, with a timeout and a day of data cache", async () => {
      const mock = answer(json(200, share));
      expect(await lookup(share.id)).toEqual({ status: "found", share });
      expect(mock).toHaveBeenCalledTimes(1);
      const [url, options] = mock.mock.calls[0] as [string, RequestInit & { next?: unknown }];
      expect(url).toBe(`https://games-api.ecency.com/v1/shares/${share.id}`);
      expect(options.signal).toBeInstanceOf(AbortSignal);
      expect(options.next).toEqual({ revalidate: 86400 });
    });

    it("refuses a share that is not the one asked for", async () => {
      const mock = answer(json(200, { ...share, id: "zzz234defg" }));
      expect(await lookup(share.id)).toEqual({ status: "unavailable" });
      expect(mock).toHaveBeenCalledTimes(1);
    });

    it("treats the API's 404 as missing without a retry", async () => {
      const mock = answer(json(404, { error: "not_found" }));
      expect(await lookup(share.id)).toEqual({ status: "missing" });
      expect(mock).toHaveBeenCalledTimes(1);
    });

    it("retries once and reports unavailable on a rate limit or server error", async () => {
      const mock = answer(json(429, { error: "rate_limited" }), json(500, {}));
      expect(await lookup(share.id)).toEqual({ status: "unavailable" });
      expect(mock).toHaveBeenCalledTimes(2);
    });

    it("recovers when the retry succeeds", async () => {
      const mock = answer(json(429, {}), json(200, share));
      expect(await lookup(share.id)).toEqual({ status: "found", share });
      expect(mock).toHaveBeenCalledTimes(2);
    });

    it("retries a dropped connection but not a timeout", async () => {
      const dropped = answer(
        () => Promise.reject(new TypeError("fetch failed")),
        () => Promise.reject(new TypeError("fetch failed"))
      );
      expect(await lookup(share.id)).toEqual({ status: "unavailable" });
      expect(dropped).toHaveBeenCalledTimes(2);

      const slow = answer(() => Promise.reject(new DOMException("timed out", "TimeoutError")));
      expect(await lookup("bcd234defg")).toEqual({ status: "unavailable" });
      expect(slow).toHaveBeenCalledTimes(1);
    });

    it("reports unavailable, not missing, on a 200 that does not parse, without a retry", async () => {
      const mock = answer(json(200, { ...share, kind: "coins" }));
      expect(await lookup(share.id)).toEqual({ status: "unavailable" });
      expect(mock).toHaveBeenCalledTimes(1);
    });
  });
});
