import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CurationApiError,
  curationCursorRequest,
  curationDismissRecoRequest,
  curationMarkClearRequest,
  curationMarkRequest,
  curationMyMarksRequest,
  curationRecommendMetaRequest,
  curationRosterFeedRequest,
  curationTickRequest,
  fetchCurationPost,
  fetchCurationStatus,
  normalizeCurationParams
} from "./requests";

const fetchMock = vi.fn();
const json = { get: () => "application/json" };
const ok = (body: unknown) => ({ ok: true, status: 200, headers: json, json: async () => body });

function lastCall() {
  const [url, init] = fetchMock.mock.calls[fetchMock.mock.calls.length - 1];
  const raw = (init as RequestInit).body;
  return { url: String(url), init: init as RequestInit, body: typeof raw === "string" ? JSON.parse(raw) : undefined };
}

describe("curation desk requests", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockResolvedValue(ok({}));
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it.each([
    ["roster-feed", () => curationRosterFeedRequest("tok", { sort: "queue", hide_reviewed: true }, "c1")],
    ["tick", () => curationTickRequest("tok", { since: "2026-09-05T00:00:00Z", need: [1], visible: [1, 2] })],
    ["mark", () => curationMarkRequest("tok", { author: "a", permlink: "p", state: "reviewed" })],
    ["mark-clear", () => curationMarkClearRequest("tok", { author: "a", permlink: "p" })],
    ["marks", () => curationMyMarksRequest("tok", { state: "snoozed" })],
    ["cursor", () => curationCursorRequest("tok", { post_id: 5, action: "advance" })],
    ["recommend-meta", () => curationRecommendMetaRequest("tok", { author: "a", permlink: "p", ua_class: "web" })],
    ["recommendation-dismiss", () => curationDismissRecoRequest("tok", { author: "a", permlink: "p", action: "dismiss" })]
  ])("POST %s carries the code in the body", async (route, run) => {
    await run();
    const { url, init, body } = lastCall();
    expect(url).toBe(`https://ecency.com/private-api/curation-desk/${route}`);
    expect(init.method).toBe("POST");
    expect(body.code).toBe("tok");
  });

  it("refuses to send an authed request without a code", async () => {
    await expect(curationMarkRequest(undefined, { author: "a", permlink: "p", state: "reviewed" })).rejects.toThrow(
      /missing auth/
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends the roster feed filters as normalized body fields with the cursor", async () => {
    await curationRosterFeedRequest("tok", { sort: "queue", hide_reviewed: true, hide_snoozed: false, app: "all" }, "c1");
    const { body } = lastCall();
    // hide_reviewed true is the desk's own default, so it never travels; the
    // explicit false does; "all" is not a filter.
    expect(body).toEqual({ sort: "queue", hide_snoozed: "0", cursor: "c1", code: "tok" });
  });

  it("drops every hide_* true and keeps every hide_* false", () => {
    expect(normalizeCurationParams({ hide_curated: true, hide_reviewed: true, hide_snoozed: true })).toEqual({});
    expect(normalizeCurationParams({ hide_curated: false, hide_reviewed: false, hide_snoozed: false })).toEqual({
      hide_curated: "0",
      hide_reviewed: "0",
      hide_snoozed: "0"
    });
    // Ordinary booleans keep the opposite rule: only true says anything.
    expect(normalizeCurationParams({ has_images: true, new_authors: false })).toEqual({ has_images: "1" });
  });

  it("caps tick id lists at 100", async () => {
    const many = Array.from({ length: 150 }, (_, i) => i);
    await curationTickRequest("tok", { since: null, need: many, visible: many });
    const { body } = lastCall();
    expect(body.need).toHaveLength(100);
    expect(body.visible).toHaveLength(100);
    expect(body.since).toBeNull();
  });

  it("only sends a well-formed trx_id on the meta ping", async () => {
    await curationRecommendMetaRequest("tok", { author: "a", permlink: "p", ua_class: "web", trx_id: "nope" });
    expect(lastCall().body).not.toHaveProperty("trx_id");
    const tx = "f".repeat(40);
    await curationRecommendMetaRequest("tok", { author: "a", permlink: "p", ua_class: "web", trx_id: tx });
    expect(lastCall().body.trx_id).toBe(tx);
  });

  it("throws a CurationApiError with the status on a non-2xx", async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 429, headers: json, json: async () => ({ error: "slow" }) });
    const promise = curationMarkRequest("tok", { author: "a", permlink: "p", state: "reviewed" });
    await expect(promise).rejects.toBeInstanceOf(CurationApiError);
    await promise.catch((e: CurationApiError) => {
      expect(e.status).toBe(429);
      expect(e.data).toEqual({ error: "slow" });
    });
  });

  it("treats a non-JSON 200 as an error, never as an empty result", async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, status: 200, headers: { get: () => "text/html" }, json: async () => ({}) });
    await expect(fetchCurationStatus()).rejects.toThrow(/Unexpected response/);
  });

  it("turns an unparsable 200 body into a CurationApiError carrying the status", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: json,
      json: async () => {
        throw new SyntaxError("Unexpected token < in JSON at position 0");
      }
    });
    const promise = fetchCurationStatus();
    await expect(promise).rejects.toBeInstanceOf(CurationApiError);
    await promise.catch((e: CurationApiError) => expect(e.status).toBe(200));
  });

  it("escapes the route 5 path segments", async () => {
    await fetchCurationPost("alice", "a-post");
    expect(lastCall().url).toBe("https://ecency.com/private-api/curation-desk/post/alice/a-post");
    expect(lastCall().init.method).toBe("GET");
  });
});
