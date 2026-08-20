import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The siteverify half of the newsletter bot check.
 *
 * The distinction that matters here is `invalid` versus `unavailable`. A bad token is
 * the caller's problem and answers 403; a broken secret or an unreachable Cloudflare is
 * OURS, and answering 403 to that would tell readers they look like bots because we
 * misconfigured a deploy.
 */
const fetchMock = vi.fn();

async function verify(token: string, remoteip?: string, action?: string) {
  vi.resetModules();
  const { verifyTurnstile } = await import("@/server/turnstile-verify");
  return verifyTurnstile(token, remoteip, action);
}

function siteverify(body: unknown, status = 200) {
  return Promise.resolve({ ok: status < 400, status, json: async () => body } as Response);
}

describe("verifyTurnstile", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("TURNSTILE_SECRET", "test-secret");
  });

  it("accepts a token Cloudflare confirms, and sends secret, response and remoteip", async () => {
    fetchMock.mockReturnValue(siteverify({ success: true }));
    await expect(verify("tok", "203.0.113.9")).resolves.toEqual({ ok: true });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://challenges.cloudflare.com/turnstile/v0/siteverify");
    expect(init.method).toBe("POST");
    const sent = new URLSearchParams(init.body as URLSearchParams);
    expect(sent.get("secret")).toBe("test-secret");
    expect(sent.get("response")).toBe("tok");
    expect(sent.get("remoteip")).toBe("203.0.113.9");
  });

  it("omits remoteip when the caller's IP is unknown rather than sending an empty one", async () => {
    fetchMock.mockReturnValue(siteverify({ success: true }));
    await verify("tok");
    const sent = new URLSearchParams(fetchMock.mock.calls[0][1].body as URLSearchParams);
    expect(sent.has("remoteip")).toBe(false);
  });

  it("reports a spent, forged or expired token as invalid", async () => {
    for (const code of ["invalid-input-response", "timeout-or-duplicate", "missing-input-response"]) {
      fetchMock.mockReturnValue(siteverify({ success: false, "error-codes": [code] }));
      await expect(verify("tok")).resolves.toEqual({ ok: false, reason: "invalid" });
    }
  });

  it("reports OUR misconfiguration as unavailable, not as a bad token", async () => {
    // Answering 403 here would blame the reader for a secret we got wrong.
    for (const code of ["invalid-input-secret", "missing-input-secret", "bad-request", "internal-error"]) {
      fetchMock.mockReturnValue(siteverify({ success: false, "error-codes": [code] }));
      await expect(verify("tok")).resolves.toEqual({ ok: false, reason: "unavailable" });
    }
  });

  it("treats an upstream error, an unparseable body and a network failure as unavailable", async () => {
    fetchMock.mockReturnValue(siteverify({}, 500));
    await expect(verify("tok")).resolves.toEqual({ ok: false, reason: "unavailable" });

    fetchMock.mockReturnValue(
      Promise.resolve({ ok: true, status: 200, json: async () => { throw new Error("nope"); } } as unknown as Response)
    );
    await expect(verify("tok")).resolves.toEqual({ ok: false, reason: "unavailable" });

    fetchMock.mockRejectedValue(Object.assign(new Error("boom"), { name: "TypeError" }));
    await expect(verify("tok")).resolves.toEqual({ ok: false, reason: "unavailable" });

    fetchMock.mockRejectedValue(Object.assign(new Error("slow"), { name: "TimeoutError" }));
    await expect(verify("tok")).resolves.toEqual({ ok: false, reason: "unavailable" });
  });

  it("rejects an empty token without spending a round trip", async () => {
    await expect(verify("")).resolves.toEqual({ ok: false, reason: "invalid" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reports an unset secret as unconfigured, so the caller can decide rather than guess", async () => {
    vi.stubEnv("TURNSTILE_SECRET", "");
    await expect(verify("tok")).resolves.toEqual({ ok: false, reason: "unconfigured" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses a valid token issued for a different action", async () => {
    // One sitekey serves signup and the newsletter, so without this a challenge solved
    // on the signup page would be spendable at the subscribe endpoint.
    fetchMock.mockReturnValue(siteverify({ success: true, action: "signup" }));
    await expect(verify("tok", undefined, "newsletter-subscribe")).resolves.toEqual({
      ok: false,
      reason: "invalid"
    });

    fetchMock.mockReturnValue(siteverify({ success: true, action: "newsletter-subscribe" }));
    await expect(verify("tok", undefined, "newsletter-subscribe")).resolves.toEqual({ ok: true });
  });

  it("ignores the action when the caller does not ask for one", async () => {
    fetchMock.mockReturnValue(siteverify({ success: true, action: "anything" }));
    await expect(verify("tok")).resolves.toEqual({ ok: true });
  });
});
