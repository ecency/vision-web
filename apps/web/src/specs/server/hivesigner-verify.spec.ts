import { afterEach, describe, expect, it, vi } from "vitest";
import { verifyHsAccessToken } from "@/server/hivesigner-verify";

// A HiveSigner token proves who the user is only for the app it was issued
// to. HiveSigner's /api/me accepts any valid token, whatever app or kind, so
// the verifier also requires an access token issued to this app.

const b64u = (o: unknown) =>
  Buffer.from(JSON.stringify(o)).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, ".");
const token = (type: string, app: string, authors = ["alice"]) =>
  b64u({ signed_message: { type, app }, authors, timestamp: Math.floor(Date.now() / 1000), signatures: ["s"] });

function meAnswers(user: string) {
  return vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(JSON.stringify({ user, account: { name: user } }), { status: 200 })
  );
}

afterEach(() => vi.restoreAllMocks());

describe("verifyHsAccessToken", () => {
  it("accepts an access token issued to this app", async () => {
    meAnswers("alice");
    await expect(verifyHsAccessToken(token("posting", "ecency.app"))).resolves.toEqual({ ok: true, username: "alice" });
  });

  it.each([
    ["another app's token", token("posting", "other.app")],
    ["a code", token("code", "ecency.app")],
    ["a refresh token", token("refresh", "ecency.app")],
    ["not a token at all", "garbage"]
  ])("refuses %s without asking HiveSigner", async (_label, value) => {
    const fetchSpy = meAnswers("alice");
    await expect(verifyHsAccessToken(value)).resolves.toEqual({ ok: false, reason: "invalid" });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it.each([
    ["older than its lifetime and a day", -9 * 24 * 3600],
    ["dated in the future", 3600]
  ])("refuses a token %s without asking HiveSigner", async (_label, offset) => {
    const fetchSpy = meAnswers("alice");
    const old = b64u({
      signed_message: { type: "posting", app: "ecency.app" },
      authors: ["alice"],
      timestamp: Math.floor(Date.now() / 1000) + offset,
      signatures: ["s"]
    });
    await expect(verifyHsAccessToken(old)).resolves.toEqual({ ok: false, reason: "invalid" });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("accepts a token a few days old (refreshed in the background near expiry)", async () => {
    meAnswers("alice");
    const recent = b64u({
      signed_message: { type: "posting", app: "ecency.app" },
      authors: ["alice"],
      timestamp: Math.floor(Date.now() / 1000) - 6 * 24 * 3600,
      signatures: ["s"]
    });
    await expect(verifyHsAccessToken(recent)).resolves.toEqual({ ok: true, username: "alice" });
  });

  it("refuses a token whose author is not the account HiveSigner names", async () => {
    meAnswers("bob");
    await expect(verifyHsAccessToken(token("posting", "ecency.app", ["alice"]))).resolves.toEqual({
      ok: false,
      reason: "invalid"
    });
  });
});
