import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NewsletterApiError, NewsletterSendRefusedError } from "./errors";
import {
  getDigestSubscriptionsRequest,
  getNewsletterIssuesRequest,
  getNewsletterPostsRequest,
  getNewsletterSenderRequest,
  leaveDigestRequest,
  previewNewsletterSendRequest,
  sendNewsletterIssueRequest,
  subscribeDigestRequest,
  unsubscribeAllDigestsRequest,
} from "./api";
import type { DigestSubscribeInput } from "./types";

const INPUT: DigestSubscribeInput = {
  email: "alice@example.com",
  type: "creator",
  target: "alice",
  cadence: "weekly",
  source: "mobile-app",
};

function okJson(body: unknown) {
  return { ok: true, status: 200, json: async () => body };
}

function errJson(status: number, body: unknown) {
  return { ok: false, status, json: async () => body };
}

describe("newsletter api", () => {
  // getBoundFetch() caches the bound fetch on first call, so reuse one stable mock
  // and reset it per test (a fresh mock each test wouldn't be picked up).
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("subscribeDigestRequest", () => {
    it("POSTs to /api/newsletter/subscribe with the input and the code in the BODY", async () => {
      fetchMock.mockResolvedValueOnce(okJson({ status: "active" }));

      const result = await subscribeDigestRequest(INPUT, "hs-token");

      const [url, init] = fetchMock.mock.calls[0];
      expect(String(url)).toContain("/api/newsletter/subscribe");
      expect((init as RequestInit).method).toBe("POST");
      // The subscribe route authenticates ONLY from the body, never the header.
      expect((init as RequestInit).headers).not.toHaveProperty("X-HS-Token");
      const payload = JSON.parse((init as RequestInit).body as string);
      expect(payload).toEqual({ ...INPUT, code: "hs-token" });
      expect(result).toEqual({ status: "active" });
    });

    it("omits the code field entirely for anonymous callers", async () => {
      fetchMock.mockResolvedValueOnce(
        okJson({ status: "pending_confirmation" }),
      );

      await subscribeDigestRequest({ ...INPUT, captchaToken: "tt" });

      const payload = JSON.parse(
        (fetchMock.mock.calls[0][1] as RequestInit).body as string,
      );
      expect(payload).not.toHaveProperty("code");
      expect(payload.captchaToken).toBe("tt");
    });

    it("throws NewsletterApiError with status + data on a non-2xx", async () => {
      fetchMock.mockResolvedValueOnce(errJson(403, { error: "Security check failed" }));

      const promise = subscribeDigestRequest(INPUT);
      await expect(promise).rejects.toBeInstanceOf(NewsletterApiError);
      await expect(promise).rejects.toMatchObject({
        status: 403,
        message: "Security check failed",
      });
    });
  });

  describe("getDigestSubscriptionsRequest", () => {
    it("GETs /api/newsletter/subscriptions with the X-HS-Token header", async () => {
      fetchMock.mockResolvedValueOnce(okJson({ subscriptions: [{ id: "a" }] }));

      const result = await getDigestSubscriptionsRequest("hs-token");

      const [url, init] = fetchMock.mock.calls[0];
      expect(String(url)).toContain("/api/newsletter/subscriptions");
      expect((init as RequestInit).method).toBeUndefined();
      expect((init as RequestInit).headers).toMatchObject({
        "X-HS-Token": "hs-token",
      });
      expect(result).toEqual([{ id: "a" }]);
    });

    it("returns [] when the relay answers without a subscriptions array", async () => {
      fetchMock.mockResolvedValueOnce(okJson({}));
      expect(await getDigestSubscriptionsRequest("t")).toEqual([]);
    });
  });

  describe("leaveDigestRequest", () => {
    it("DELETEs the URL-encoded subscription id with the header token", async () => {
      fetchMock.mockResolvedValueOnce(okJson({ left: true }));

      await leaveDigestRequest("id/with slash", "hs-token");

      const [url, init] = fetchMock.mock.calls[0];
      expect(String(url)).toContain(
        "/api/newsletter/subscriptions/id%2Fwith%20slash",
      );
      expect((init as RequestInit).method).toBe("DELETE");
      expect((init as RequestInit).headers).toMatchObject({
        "X-HS-Token": "hs-token",
      });
    });
  });

  describe("unsubscribeAllDigestsRequest", () => {
    it("POSTs {email, code} to /api/newsletter/unsubscribe-all", async () => {
      fetchMock.mockResolvedValueOnce(okJson({ suppressed: true }));

      await unsubscribeAllDigestsRequest("alice@example.com", "hs-token");

      const [url, init] = fetchMock.mock.calls[0];
      expect(String(url)).toContain("/api/newsletter/unsubscribe-all");
      expect((init as RequestInit).method).toBe("POST");
      expect(JSON.parse((init as RequestInit).body as string)).toEqual({
        email: "alice@example.com",
        code: "hs-token",
      });
    });
  });

  describe("getNewsletterSenderRequest", () => {
    it("GETs /api/newsletter/sender with type + encoded target and the header token", async () => {
      fetchMock.mockResolvedValueOnce(okJson({ status: "active" }));

      await getNewsletterSenderRequest("community", "hive-125125", "hs-token");

      const [url, init] = fetchMock.mock.calls[0];
      expect(String(url)).toContain(
        "/api/newsletter/sender?type=community&target=hive-125125",
      );
      expect((init as RequestInit).headers).toMatchObject({
        "X-HS-Token": "hs-token",
      });
    });

    it("keeps the status on an error so callers can branch on 403", async () => {
      fetchMock.mockResolvedValueOnce(errJson(403, { error: "Not a sender" }));
      await expect(
        getNewsletterSenderRequest("creator", "alice", "t"),
      ).rejects.toMatchObject({ status: 403 });
    });
  });

  describe("getNewsletterIssuesRequest", () => {
    it("unwraps the issues array, defaulting to []", async () => {
      fetchMock.mockResolvedValueOnce(okJson({ issues: [{ id: "i1" }] }));
      expect(await getNewsletterIssuesRequest("creator", "alice", "t")).toEqual([
        { id: "i1" },
      ]);

      fetchMock.mockResolvedValueOnce(okJson({}));
      expect(await getNewsletterIssuesRequest("creator", "alice", "t")).toEqual(
        [],
      );
      expect(String(fetchMock.mock.calls[0][0])).toContain(
        "/api/newsletter/issues?type=creator&target=alice",
      );
    });
  });

  describe("getNewsletterPostsRequest", () => {
    it("passes the limit through and defaults it to 20", async () => {
      fetchMock.mockResolvedValue(okJson({ posts: [] }));

      await getNewsletterPostsRequest("creator", "alice", "t");
      expect(String(fetchMock.mock.calls[0][0])).toContain(
        "/api/newsletter/posts?type=creator&target=alice&limit=20",
      );

      await getNewsletterPostsRequest("creator", "alice", "t", 40);
      expect(String(fetchMock.mock.calls[1][0])).toContain("&limit=40");
    });
  });

  describe("preview + send", () => {
    const SEND = {
      type: "creator" as const,
      target: "alice",
      author: "alice",
      permlink: "my-post",
    };

    it("POSTs the preview with the token as X-HS-Token header", async () => {
      fetchMock.mockResolvedValueOnce(okJson({ subject: "s" }));

      await previewNewsletterSendRequest(SEND, "hs-token");

      const [url, init] = fetchMock.mock.calls[0];
      expect(String(url)).toContain("/api/newsletter/send/preview");
      expect((init as RequestInit).method).toBe("POST");
      expect((init as RequestInit).headers).toMatchObject({
        "X-HS-Token": "hs-token",
      });
      expect(JSON.parse((init as RequestInit).body as string)).toEqual(SEND);
    });

    it("POSTs the send to /api/newsletter/send with the header token and the request as body", async () => {
      fetchMock.mockResolvedValueOnce(okJson({ issues: [] }));
      await sendNewsletterIssueRequest(SEND, "hs-token");
      const [url, init] = fetchMock.mock.calls[0];
      expect(String(url)).toContain("/api/newsletter/send");
      expect(String(url)).not.toContain("/send/preview");
      expect((init as RequestInit).method).toBe("POST");
      expect((init as RequestInit).headers).toMatchObject({
        "X-HS-Token": "hs-token",
      });
      expect(JSON.parse((init as RequestInit).body as string)).toEqual(SEND);
    });

    it("surfaces a refused send with the relay's code and taken periods", async () => {
      fetchMock.mockResolvedValueOnce(
        errJson(409, {
          error: "Already sent",
          code: "already_sent",
          taken: [{ cadence: "weekly", period: "2026-W34", kind: "post" }],
        }),
      );

      const promise = sendNewsletterIssueRequest(SEND, "t");
      await expect(promise).rejects.toBeInstanceOf(NewsletterSendRefusedError);
      await expect(promise).rejects.toMatchObject({
        status: 409,
        code: "already_sent",
        taken: [{ cadence: "weekly", period: "2026-W34", kind: "post" }],
        // The full parsed payload rides along too, so callers handling
        // NewsletterApiError uniformly see the same body either way.
        data: { error: "Already sent", code: "already_sent" },
      });
    });

    it("keeps the status when the error body is not JSON", async () => {
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 502,
        json: async () => {
          throw new Error("not json");
        },
      });
      await expect(sendNewsletterIssueRequest(SEND, "t")).rejects.toMatchObject(
        { status: 502 },
      );
    });

    it("treats a 2xx without a JSON object body as an error, not a blank result", async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => {
          throw new Error("not json");
        },
      });
      await expect(
        previewNewsletterSendRequest(SEND, "t"),
      ).rejects.toMatchObject({ status: 200 });
    });
  });
});
