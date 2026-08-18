import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { gameClaimRequest } from "./game-claim";

function jsonResponse(data: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => "application/json; charset=utf-8" },
    text: async () => JSON.stringify(data),
  };
}

function htmlResponse(html: string, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => "text/html; charset=utf-8" },
    text: async () => html,
  };
}

describe("gameClaimRequest", () => {
  // getBoundFetch() caches the bound fetch on first call, so reuse one stable
  // mock and reset it per test.
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("POSTs to /private-api/post-game with the code, game type and key", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ score: 50 }));

    const result = await gameClaimRequest("hs-token", "spin", "spin-key");

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain("/private-api/post-game");
    expect((init as RequestInit).method).toBe("POST");
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body).toMatchObject({
      code: "hs-token",
      game_type: "spin",
      key: "spin-key",
    });
    expect(result).toEqual({ score: 50 });
  });

  // The 502 that produced ECENCY-NEXT-1FCJ: an nginx HTML page parsed as JSON
  // threw a bare SyntaxError that named neither the endpoint nor the cause.
  it("throws a stable, body-free error on an HTML gateway response (ECENCY-NEXT-1FCJ)", async () => {
    fetchMock.mockResolvedValueOnce(
      htmlResponse("<html><body><h1>502 Bad Gateway</h1></body></html>", 502)
    );

    const err = await gameClaimRequest("t", "spin", "k").then(
      () => {
        throw new Error("expected the 502 to reject");
      },
      (e: Error) => e
    );

    expect(err.message).toBe("[SDK][Games] – failed with status 502");
    // The raw page must not leak into the message, else Sentry fragments the
    // group across every distinct error page.
    expect(err.message).not.toContain("<html>");
  });

  it("throws a descriptive error when a 2xx response is not JSON", async () => {
    fetchMock.mockResolvedValueOnce(htmlResponse("<html>OK</html>", 200));

    await expect(gameClaimRequest("t", "spin", "k")).rejects.toThrow(
      /expected JSON but received "text\/html"/
    );
  });

  it("throws a descriptive error when a 2xx JSON body is malformed", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: { get: () => "application/json" },
      text: async () => "not-json",
    });

    await expect(gameClaimRequest("t", "spin", "k")).rejects.toThrow(
      /malformed JSON response/
    );
  });

  it("folds a short JSON error body into the message on a non-2xx", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ message: "No spins left" }, 409)
    );

    await expect(gameClaimRequest("t", "spin", "k")).rejects.toThrow(
      /failed with status 409: .*No spins left/
    );
  });
});
