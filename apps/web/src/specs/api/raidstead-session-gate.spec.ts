// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The session route with its gate as it is: real tokens, the real signature
// check, the real limit. Only what lies outside this server answers by
// script: the chain, HiveSigner, the games API.
vi.mock("@ecency/sdk/hive", async (original) => ({
  ...(await original<typeof import("@ecency/sdk/hive")>()),
  callRPC: vi.fn()
}));
vi.mock("@/server/hivesigner-verify", () => ({ verifyHsAccessToken: vi.fn() }));

import { callRPC, PrivateKey } from "@ecency/sdk/hive";
import { POST } from "@/app/api/raidstead/session/route";
import { forgetHivesignerKeys } from "@/server/hivesigner-signature";
import { verifyHsAccessToken } from "@/server/hivesigner-verify";
import { decodeToken } from "@/utils/hs-token";
import { held, issue } from "./hivesigner-issue";

const NOW = Date.parse("2026-10-10T12:00:00Z");
const hivesigner = PrivateKey.fromSeed("hivesigner posting key of this spec");
const itsOwn = PrivateKey.fromSeed("a key the sender made up");

// A sign-in for this account, with a token this key signed. The route's limit
// lasts the whole file, so each case below has accounts of its own.
const ask = (username: string, key: PrivateKey) =>
  POST(
    new Request("https://ecency.com/api/raidstead/session", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username, code: held(issue(key, username)) })
    })
  );

describe("POST /api/raidstead/session, from the token to HiveSigner", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date", "performance"] });
    vi.setSystemTime(NOW);
    vi.stubEnv("RAIDSTEAD_VOUCH_SECRET", "vouch-secret-" + "s".repeat(27));
    forgetHivesignerKeys();
    vi.mocked(callRPC).mockReset();
    vi.mocked(callRPC).mockResolvedValue([
      { name: "hivesigner", posting: { key_auths: [[hivesigner.createPublic().toString(), 1]] } }
    ]);
    // HiveSigner confirms what it is shown; the games API opens what it is asked
    vi.mocked(verifyHsAccessToken).mockReset();
    vi.mocked(verifyHsAccessToken).mockImplementation(async (code) => ({
      ok: true,
      username: decodeToken(code)!.authors[0]
    }));
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) =>
        Response.json({
          account: JSON.parse(init.body as string).account,
          token: "rs1_session",
          expiresAt: "2026-11-09T00:00:00.000Z"
        })
      )
    );
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("opens a session for a token HiveSigner issued", async () => {
    const res = await ask("ann", hivesigner);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      account: "ann",
      token: "rs1_session",
      expiresAt: "2026-11-09T00:00:00.000Z"
    });
    expect(verifyHsAccessToken).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("sends nothing to HiveSigner for tokens anybody else signed, however many", async () => {
    for (let i = 0; i < 20; i++) {
      const res = await ask(`bob${i % 4}`, itsOwn);
      expect(res.status).toBe(401);
      expect(await res.json()).toEqual({ error: "unauthorized" });
    }
    expect(verifyHsAccessToken).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
    // the chain was asked for HiveSigner's key once, not once a token
    expect(callRPC).toHaveBeenCalledTimes(1);
    // nor did any of it use up the asks of the accounts named
    expect((await ask("bob0", hivesigner)).status).toBe(200);
  });

  it("lets one account ask six times a minute", async () => {
    const answers: number[] = [];
    for (let i = 0; i < 8; i++) answers.push((await ask("cat", hivesigner)).status);
    expect(answers).toEqual([200, 200, 200, 200, 200, 200, 429, 429]);
    expect(verifyHsAccessToken).toHaveBeenCalledTimes(6);
    // another account is not held up by it
    expect((await ask("dan", hivesigner)).status).toBe(200);
    vi.advanceTimersByTime(60_000);
    expect((await ask("cat", hivesigner)).status).toBe(200);
  });

  it("asks nobody while HiveSigner's key cannot be read from the chain", async () => {
    vi.mocked(callRPC).mockRejectedValue(new Error("down"));
    const res = await ask("eve", hivesigner);
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "hivesigner_unavailable" });
    expect(verifyHsAccessToken).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });
});
