import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/hivesigner-verify", () => ({ verifyHsAccessToken: vi.fn() }));

import { POST } from "@/app/api/raidstead/session/route";
import { verifyHsAccessToken } from "@/server/hivesigner-verify";

// ecency.com vouching for a login to the games API: the route that hands a
// game session to a login that cannot sign the game's own login message.
const SECRET = "vouch-secret-" + "s".repeat(27);
const GAME = "https://games-api.ecency.com/v1/raidstead/session/vouched";

// a HiveSigner message as the page holds it: base64url of the signed JSON
const NOW = Date.parse("2026-10-10T12:00:00Z");
const DAY_S = 86_400;
// issued a minute ago unless said otherwise
const token = (
  signed_message: Record<string, unknown>,
  authors: unknown = ["ann"],
  timestamp: unknown = NOW / 1000 - 60
) =>
  Buffer.from(JSON.stringify({ signed_message, authors, timestamp, signatures: ["sig"] }))
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
const access = token({ type: "posting", app: "ecency.app" });

const request = (body: unknown) =>
  new Request("https://ecency.com/api/raidstead/session", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body)
  });
const ask = (body: unknown) => POST(request(body));
const session = { account: "ann", token: "rs1_ann", expiresAt: "2026-11-09T00:00:00.000Z" };
const gameAnswers = (status: number, body: unknown) =>
  vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify(body), { status }));

describe("POST /api/raidstead/session", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
    vi.stubEnv("RAIDSTEAD_VOUCH_SECRET", SECRET);
    vi.stubGlobal("fetch", vi.fn());
    vi.mocked(verifyHsAccessToken).mockReset();
    vi.mocked(verifyHsAccessToken).mockResolvedValue({ ok: true, username: "ann" });
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("asks the games API for a session, with the secret, for a login HiveSigner confirms", async () => {
    gameAnswers(200, { ...session, extra: "not passed on" });
    const res = await ask({ username: "ann", code: access });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(session);
    // the answer carries a bearer token
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(vi.mocked(verifyHsAccessToken).mock.calls[0][0]).toBe(access);
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    expect(url).toBe(GAME);
    expect(init).toMatchObject({
      method: "POST",
      headers: { "content-type": "application/json", "x-vouch-secret": SECRET },
      body: JSON.stringify({ account: "ann" }),
      redirect: "error"
    });
    // the login's own token stays here
    expect(JSON.stringify(init)).not.toContain(access);
  });

  it("lets neither HiveSigner nor the games API hold the answer up", async () => {
    gameAnswers(200, session);
    const deadline = vi.spyOn(AbortSignal, "timeout");
    const req = request({ username: "ann", code: access });
    expect((await POST(req)).status).toBe(200);
    // HiveSigner is asked for as long as the caller waits, no longer
    expect(vi.mocked(verifyHsAccessToken).mock.calls[0][1]).toBe(req.signal);
    // the games API has eight seconds
    expect(deadline).toHaveBeenCalledWith(8_000);
    const init = vi.mocked(fetch).mock.calls[0][1] as RequestInit;
    expect(init.signal).toBe(deadline.mock.results[0].value);
  });

  const posting = { type: "posting", app: "ecency.app" };
  it.each([
    ["issued a week ago, less a minute", NOW / 1000 - 7 * DAY_S + 60, 200],
    ["issued a few minutes ahead of this server's clock", NOW / 1000 + 240, 200],
    ["issued more than a week ago", NOW / 1000 - 7 * DAY_S - 60, 401],
    ["issued years ago", 1_500_000_000, 401],
    ["dated in the future", NOW / 1000 + 600, 401],
    ["with a date that is not a number", String(NOW / 1000 - 60), 401],
    ["with no date", null, 401]
  ])("a token %s answers %i", async (_what, timestamp, status) => {
    gameAnswers(200, session);
    const res = await ask({ username: "ann", code: token(posting, ["ann"], timestamp) });
    expect(res.status).toBe(status);
    // an old token is refused before anybody is asked
    if (status === 401) {
      expect(verifyHsAccessToken).not.toHaveBeenCalled();
      expect(fetch).not.toHaveBeenCalled();
    }
  });

  it.each([
    ["a line break in it", `${access.slice(0, 20)}\n${access.slice(20)}`],
    ["a character no token is written in", `${access}\u20ac`],
    ["a space in it", `${access.slice(0, 20)} ${access.slice(20)}`]
  ])("refuses a token with %s as no token, without sending it on", async (_what, code) => {
    const res = await ask({ username: "ann", code });
    expect(res.status).toBe(401);
    expect(verifyHsAccessToken).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([
    ["is set", ""],
    ["of more than blanks is set", "   \n"],
    ["that could go in a header is set", `${SECRET.slice(0, 20)}\n${SECRET.slice(20)}`]
  ])("says it is not set up and asks nobody when no secret %s", async (_what, value) => {
    vi.stubEnv("RAIDSTEAD_VOUCH_SECRET", value);
    const res = await ask({ username: "ann", code: access });
    // a 404: this origin's 5xx answers do not reach the page as they are sent
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "not_configured" });
    expect(verifyHsAccessToken).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("sends the secret without the blanks a pasted value may carry", async () => {
    vi.stubEnv("RAIDSTEAD_VOUCH_SECRET", `  ${SECRET}\n`);
    gameAnswers(200, session);
    expect((await ask({ username: "ann", code: access })).status).toBe(200);
    const init = vi.mocked(fetch).mock.calls[0][1] as RequestInit;
    expect((init.headers as Record<string, string>)["x-vouch-secret"]).toBe(SECRET);
  });

  it.each([
    ["not JSON", "{"],
    ["no body", "null"],
    ["no username", { code: access }],
    ["no token", { username: "ann" }],
    ["a name that is not a Hive account", { username: "Ann B", code: access }],
    ["a token that is not text", { username: "ann", code: 42 }],
    ["a token too long to be one", { username: "ann", code: "x".repeat(4097) }]
  ])("refuses %s", async (_what, body) => {
    const res = await ask(body);
    expect(res.status).toBe(400);
    expect(verifyHsAccessToken).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  // HiveSigner's own check answers for all of these: none of them is this
  // app's access token for this account.
  it.each([
    [
      "a login message made for someone else to read",
      token({ type: "login", app: "ecency.app", audience: "honeyback://hive" })
    ],
    [
      "a login message made for the game itself",
      token({ type: "login", app: "ecency.app", audience: "raidstead" })
    ],
    ["a code", token({ type: "code", app: "ecency.app" })],
    ["a refresh token", token({ type: "refresh", app: "ecency.app" })],
    ["another app's token", token({ type: "posting", app: "other.app" })],
    ["another account's token", token({ type: "posting", app: "ecency.app" }, ["bob"])],
    ["a token for two accounts", token({ type: "posting", app: "ecency.app" }, ["ann", "bob"])],
    ["a token whose authors are not a list", token({ type: "posting", app: "ecency.app" }, "ann")],
    ["a token with no authors at all", token({ type: "posting", app: "ecency.app" }, null)],
    [
      "a token whose authors only look like a list",
      token({ type: "posting", app: "ecency.app" }, { 0: "ann", length: 1 })
    ],
    ["text that is no token", "not-a-token"]
  ])("opens nothing for %s", async (_what, code) => {
    gameAnswers(200, session);
    const res = await ask({ username: "ann", code });
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "unauthorized" });
    expect(verifyHsAccessToken).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("opens nothing when HiveSigner does not confirm the token, or confirms it for another account", async () => {
    gameAnswers(200, session);
    vi.mocked(verifyHsAccessToken).mockResolvedValueOnce({ ok: false, reason: "invalid" });
    expect((await ask({ username: "ann", code: access })).status).toBe(401);
    vi.mocked(verifyHsAccessToken).mockResolvedValueOnce({ ok: true, username: "bob" });
    expect((await ask({ username: "ann", code: access })).status).toBe(401);
    // HiveSigner cannot be reached: not the login's fault, worth another try
    vi.mocked(verifyHsAccessToken).mockResolvedValueOnce({ ok: false, reason: "unavailable" });
    const down = await ask({ username: "ann", code: access });
    expect(down.status).toBe(503);
    expect(await down.json()).toEqual({ error: "hivesigner_unavailable" });
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([
    ["refuses", () => gameAnswers(403, { error: "forbidden" })],
    ["has no such route", () => gameAnswers(404, { error: "not_found" })],
    ["answers for another account", () => gameAnswers(200, { ...session, account: "bob" })],
    ["answers without an expiry", () => gameAnswers(200, { account: "ann", token: "rs1_ann" })],
    ["answers with a session under another status", () => gameAnswers(201, session)],
    ["fails with a session in its answer", () => gameAnswers(500, session)],
    [
      "answers without a token",
      () => gameAnswers(200, { account: "ann", expiresAt: session.expiresAt })
    ],
    [
      "answers with something that is not JSON",
      () => vi.mocked(fetch).mockResolvedValue(new Response("<html>", { status: 200 }))
    ],
    ["cannot be reached", () => vi.mocked(fetch).mockRejectedValue(new Error("fetch failed"))]
  ])("answers 502 when the games API %s", async (_what, arrange) => {
    arrange();
    const res = await ask({ username: "ann", code: access });
    expect(res.status).toBe(502);
    const text = JSON.stringify(await res.json());
    expect(text).toBe('{"error":"game_unavailable"}');
    expect(text).not.toContain(SECRET);
  });

  it("stops reading a body that is too long to be a name and a token", async () => {
    gameAnswers(200, session);
    // sent in pieces with no length declared: only reading it shows its size
    let sent = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        sent++;
        if (sent > 1000) return controller.close();
        controller.enqueue(new TextEncoder().encode("x".repeat(1024)));
      }
    });
    const res = await POST(
      new Request("https://ecency.com/api/raidstead/session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: stream,
        duplex: "half"
      } as RequestInit)
    );
    expect(res.status).toBe(413);
    expect(await res.json()).toEqual({ error: "too_large" });
    // given up after the first few pieces, not after all thousand
    expect(sent).toBeLessThan(20);
    expect(verifyHsAccessToken).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
    // a body of the usual size, just under the limit, is still read
    const padded = { username: "ann", code: access, pad: "p".repeat(7000) };
    expect((await ask(padded)).status).toBe(200);
  });

  it("says in the log what kind of failure it was", async () => {
    vi.mocked(fetch).mockRejectedValue(
      Object.assign(new TypeError("fetch failed"), { cause: { code: "ECONNREFUSED" } })
    );
    expect((await ask({ username: "ann", code: access })).status).toBe(502);
    vi.mocked(fetch).mockRejectedValue(
      new DOMException("The operation timed out.", "TimeoutError")
    );
    expect((await ask({ username: "ann", code: access })).status).toBe(502);
    const logged = vi.mocked(console.error).mock.calls.map((c) => c.map(String).join(" "));
    expect(logged).toEqual([
      "[Raidstead] vouched session failed TypeError ECONNREFUSED",
      "[Raidstead] vouched session failed TimeoutError "
    ]);
  });

  it("keeps the secret out of the log when the request to the games API fails", async () => {
    // a failed request may quote its own headers in the error
    vi.mocked(fetch).mockRejectedValue(
      new TypeError(`Headers.append: "${SECRET}" is an invalid header value.`)
    );
    expect((await ask({ username: "ann", code: access })).status).toBe(502);
    const logged = JSON.stringify(vi.mocked(console.error).mock.calls.map((c) => c.map(String)));
    expect(logged).toContain("vouched session failed");
    expect(logged).not.toContain(SECRET);
  });
});
