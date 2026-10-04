import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/utils/user-token", () => ({
  getLoginType: vi.fn(),
  getPostingKey: vi.fn(),
  getAccessToken: vi.fn(),
  ensureValidToken: vi.fn()
}));
vi.mock("@/utils/hive-extensions", () => ({
  hasAnyHiveExtension: vi.fn(),
  signBufferWithExtension: vi.fn()
}));

import { ensureValidToken, getAccessToken, getLoginType, getPostingKey } from "@/utils/user-token";
import { hasAnyHiveExtension, signBufferWithExtension } from "@/utils/hive-extensions";
import {
  clearSession,
  loadSession,
  saveSession,
  signerFor,
  signIn
} from "@/features/raidstead/client";

describe("raidstead client", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.mocked(getLoginType).mockReset();
    vi.mocked(getPostingKey).mockReset();
    vi.mocked(getAccessToken).mockReset();
    vi.mocked(ensureValidToken).mockReset();
    vi.mocked(hasAnyHiveExtension).mockReset();
    vi.mocked(signBufferWithExtension).mockReset();
  });

  it("signs silently only for posting-key logins", () => {
    vi.mocked(getLoginType).mockReturnValue("privateKey");
    vi.mocked(getPostingKey).mockReturnValue("5K...");
    expect(signerFor("ann")).toBe("key");
  });

  it("signs in through ecency.com for any other Ecency login in this browser", () => {
    vi.mocked(getAccessToken).mockReturnValue("hs-token");
    for (const login of ["hivesigner", "keychain", "hiveauth"]) {
      vi.mocked(getLoginType).mockReturnValue(login);
      expect(signerFor("ann"), login).toBe("ecency");
    }
    // a wallet in the browser does not change that: nothing needs asking
    vi.mocked(hasAnyHiveExtension).mockReturnValue(true);
    expect(signerFor("ann")).toBe("ecency");
    // a key login whose key is gone still has its login here
    vi.mocked(getLoginType).mockReturnValue("privateKey");
    vi.mocked(getPostingKey).mockReturnValue(null);
    expect(signerFor("ann")).toBe("ecency");
  });

  it("falls back to a wallet extension, or none, for an account with no Ecency login here", () => {
    vi.mocked(getLoginType).mockReturnValue("hivesigner");
    vi.mocked(getAccessToken).mockReturnValue(undefined);
    vi.mocked(hasAnyHiveExtension).mockReturnValue(true);
    expect(signerFor("ann")).toBe("extension");
    expect(signerFor(null)).toBe("extension");
    vi.mocked(hasAnyHiveExtension).mockReturnValue(false);
    expect(signerFor("ann")).toBeNull();
    expect(signerFor(null)).toBeNull();
    // a key login whose key is gone, with no token either, cannot sign in
    vi.mocked(getLoginType).mockReturnValue("privateKey");
    vi.mocked(getPostingKey).mockReturnValue(null);
    expect(signerFor("ann")).toBeNull();
  });

  describe("signing in through ecency.com", () => {
    const session = { account: "ann", token: "rs1_ann", expiresAt: "2026-11-09T00:00:00.000Z" };
    const answers = (...replies: [number, unknown][]) => {
      const f = vi.fn();
      for (const [status, body] of replies)
        f.mockResolvedValueOnce(new Response(JSON.stringify(body), { status }));
      vi.stubGlobal("fetch", f);
      return f;
    };

    it("sends the login's fresh token to ecency.com only; it keeps what comes back", async () => {
      vi.mocked(ensureValidToken).mockResolvedValue("fresh-token");
      const f = answers([200, session]);
      expect(await signIn("ann", "ecency", true)).toEqual({ ...session, ecency: true });
      expect(ensureValidToken).toHaveBeenCalledWith("ann");
      expect(f).toHaveBeenCalledTimes(1);
      const [url, init] = f.mock.calls[0] as [string, RequestInit];
      expect(url).toBe("/api/raidstead/session");
      expect(init).toMatchObject({
        method: "POST",
        body: JSON.stringify({ username: "ann", code: "fresh-token" })
      });
      expect(signBufferWithExtension).not.toHaveBeenCalled();
    });

    it.each([
      ["ecency.com cannot vouch just now", [503, { error: "hivesigner_unavailable" }]],
      ["ecency.com refuses the login", [401, { error: "unauthorized" }]],
      ["ecency.com fails with a session in its answer", [500, session]],
      ["the answer is for another account", [200, { ...session, account: "bob" }]],
      ["the answer has no token", [200, { account: "ann" }]]
    ] as [string, [number, unknown]][])(
      "does not sign in when %s; it asks no wallet by itself",
      async (_what, reply) => {
        vi.mocked(ensureValidToken).mockResolvedValue("fresh-token");
        vi.mocked(hasAnyHiveExtension).mockReturnValue(true);
        const f = answers(reply);
        await expect(signIn("ann", "ecency", true)).rejects.toThrow();
        expect(f).toHaveBeenCalledTimes(1);
        expect(signBufferWithExtension).not.toHaveBeenCalled();
      }
    );

    it("says why ecency.com did not vouch", async () => {
      vi.mocked(ensureValidToken).mockResolvedValue("fresh-token");
      answers([401, { error: "unauthorized" }]);
      // `vouching`: the refusal is ecency.com's, not the games API's
      await expect(signIn("ann", "ecency", true)).rejects.toMatchObject({
        status: 401,
        code: "unauthorized",
        vouching: true
      });
      answers([502, "<html>"]);
      await expect(signIn("ann", "ecency", true)).rejects.toMatchObject({ status: 502, code: "" });
      // neither a refusal nor a route that is down turns the way off: the next try may work
      answers([404, { error: "not_found" }]);
      await expect(signIn("ann", "ecency", true)).rejects.toMatchObject({
        status: 404,
        code: "not_found"
      });
      answers([503, { error: "hivesigner_unavailable" }]);
      await expect(signIn("ann", "ecency", true)).rejects.toMatchObject({ status: 503 });
      vi.mocked(getAccessToken).mockReturnValue("hs-token");
      expect(signerFor("ann")).toBe("ecency");
    });

    it("does not ask ecency.com without a token", async () => {
      vi.mocked(ensureValidToken).mockResolvedValue(undefined);
      const f = answers([200, session]);
      await expect(signIn("ann", "ecency", true)).rejects.toThrow();
      expect(f).not.toHaveBeenCalled();
    });

    it("asks a wallet instead on the player's own tap, when there is one", async () => {
      vi.mocked(ensureValidToken).mockResolvedValue("fresh-token");
      vi.mocked(hasAnyHiveExtension).mockReturnValue(true);
      vi.mocked(signBufferWithExtension).mockResolvedValue({
        success: true,
        result: "wallet-signature"
      } as never);
      const f = answers([503, { error: "hivesigner_unavailable" }], [200, session]);
      expect(await signIn("ann", "ecency", true, true)).toEqual({ ...session, ecency: true });
      expect(signBufferWithExtension).toHaveBeenCalledTimes(1);
      // the second ask goes to the games API with a signed proof, never the token
      const [url, init] = f.mock.calls[1] as [string, RequestInit];
      expect(url).toBe("https://games-api.ecency.com/v1/raidstead/session");
      expect(String(init.body)).not.toContain("fresh-token");
      // with no wallet the tap fails like the page's own try
      vi.mocked(hasAnyHiveExtension).mockReturnValue(false);
      answers([503, { error: "hivesigner_unavailable" }]);
      await expect(signIn("ann", "ecency", true, true)).rejects.toThrow();
      expect(signBufferWithExtension).toHaveBeenCalledTimes(1);
    });
  });

  it("keeps a session until it expires", () => {
    saveSession({
      account: "ann",
      token: "rs1_x",
      expiresAt: new Date(Date.now() + 60_000).toISOString()
    });
    expect(loadSession()).toMatchObject({ account: "ann", token: "rs1_x" });
    saveSession({
      account: "ann",
      token: "rs1_x",
      expiresAt: new Date(Date.now() - 1).toISOString()
    });
    expect(loadSession()).toBeNull();
    expect(localStorage.length).toBe(0);
    saveSession({
      account: "ann",
      token: "rs1_y",
      expiresAt: new Date(Date.now() + 60_000).toISOString()
    });
    clearSession();
    expect(loadSession()).toBeNull();
  });

  // Last in this file: the module remembers the answer for the page's life.
  describe("when ecency.com is not set up to vouch", () => {
    it("signs in the way it did before, for the rest of the page's life", async () => {
      vi.mocked(getAccessToken).mockReturnValue("hs-token");
      vi.mocked(getLoginType).mockReturnValue("hivesigner");
      vi.mocked(ensureValidToken).mockResolvedValue("fresh-token");
      vi.mocked(hasAnyHiveExtension).mockReturnValue(false);
      expect(signerFor("ann")).toBe("ecency");
      // the status the page really gets: the route's 404
      vi.stubGlobal(
        "fetch",
        vi
          .fn()
          .mockResolvedValue(
            new Response(JSON.stringify({ error: "not_configured" }), { status: 404 })
          )
      );
      await expect(signIn("ann", "ecency", true)).rejects.toMatchObject({
        status: 404,
        code: "not_configured"
      });
      // no wallet: nothing can sign, as before the route existed
      expect(signerFor("ann")).toBeNull();
      vi.mocked(hasAnyHiveExtension).mockReturnValue(true);
      expect(signerFor("ann")).toBe("extension");
      // a posting-key login never needed ecency.com
      vi.mocked(getLoginType).mockReturnValue("privateKey");
      vi.mocked(getPostingKey).mockReturnValue("5K...");
      expect(signerFor("ann")).toBe("key");
    });
  });
});
