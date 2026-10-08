import { describe, it, expect, vi, beforeEach } from "vitest";

// getMattermostOutageStatus classifies a bootstrap step-3 provisioning error
// into the HTTP status the bootstrap route returns. Contract:
//   502 = genuine, non-retryable chat outage
//   503 = transient upstream overload / rate-limit (client should retry)
//   504 = per-call timeout (client should retry)
// Auth errors (401/403) must NOT become 401: a failing admin token is a
// server-side outage, not the end user's token being invalid — surfacing 401
// would wrongly force the user to re-authenticate. Browser-extension
// integrators that re-bootstrap in parallel are the dominant victims of the
// old "everything → 502" behaviour.

function resp(status: number, body: unknown) {
  const text = typeof body === "string" ? body : JSON.stringify(body);
  return { ok: status >= 200 && status < 300, status, text: async () => text };
}

async function loadModule() {
  process.env.MATTERMOST_BASE_URL = "https://chat.test/api/v4";
  process.env.MATTERMOST_ADMIN_TOKEN = "admin-token";
  process.env.MATTERMOST_TEAM_ID = "team-1";
  vi.resetModules();
  return await import("@/server/mattermost");
}

// Capture a *real* MattermostError by driving a public call through the
// fetch mock installed in beforeEach — MattermostError itself is
// intentionally not exported.
async function captureProvisioningError(): Promise<unknown> {
  const { getMattermostUserWithProps } = await loadModule();
  try {
    await getMattermostUserWithProps("u-1");
    throw new Error("expected getMattermostUserWithProps to throw");
  } catch (e) {
    return e;
  }
}

describe("getMattermostOutageStatus — bootstrap error classification", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  // Another request is updating the user's session: retry, not "chat is down".
  it("maps a busy session lock to 503 and answers it with Retry-After", async () => {
    const { getMattermostOutageStatus, handleMattermostError, ChatUserBusyError } =
      await loadModule();
    const busy = new ChatUserBusyError();

    expect(getMattermostOutageStatus(busy)).toBe(503);
    const res = handleMattermostError(busy);
    expect(res.status).toBe(503);
    expect(res.headers.get("Retry-After")).toBe("2");
  });

  it("maps an upstream 5xx to 503 (transient, retryable)", async () => {
    fetchMock.mockResolvedValueOnce(resp(500, "mm exploded"));
    const err = await captureProvisioningError();
    const { getMattermostOutageStatus } = await import("@/server/mattermost");
    expect(getMattermostOutageStatus(err)).toBe(503);
  });

  it("maps a 429 rate-limit to 503 (transient, retryable)", async () => {
    fetchMock.mockResolvedValueOnce(resp(429, "slow down"));
    const err = await captureProvisioningError();
    const { getMattermostOutageStatus } = await import("@/server/mattermost");
    expect(getMattermostOutageStatus(err)).toBe(503);
  });

  it("maps a per-call timeout to 504", async () => {
    fetchMock.mockRejectedValueOnce(
      Object.assign(new Error("timed out"), { name: "TimeoutError" })
    );
    const err = await captureProvisioningError();
    const { getMattermostOutageStatus } = await import("@/server/mattermost");
    expect(getMattermostOutageStatus(err)).toBe(504);
  });

  it("maps an upstream 401/403 to 502 — NOT 401 (admin-token outage, not user)", async () => {
    fetchMock.mockResolvedValueOnce(resp(401, "bad admin token"));
    const err = await captureProvisioningError();
    const { getMattermostOutageStatus } = await import("@/server/mattermost");
    expect(getMattermostOutageStatus(err)).toBe(502);
  });

  it("maps an unexpected 4xx to 502 (genuine, non-retryable)", async () => {
    fetchMock.mockResolvedValueOnce(resp(400, "unexpected"));
    const err = await captureProvisioningError();
    const { getMattermostOutageStatus } = await import("@/server/mattermost");
    expect(getMattermostOutageStatus(err)).toBe(502);
  });

  it("maps a non-Mattermost error (misconfig / connection refused) to 502", async () => {
    const { getMattermostOutageStatus } = await loadModule();
    expect(getMattermostOutageStatus(new Error("ECONNREFUSED"))).toBe(502);
    expect(getMattermostOutageStatus("not even an error")).toBe(502);
    expect(getMattermostOutageStatus(undefined)).toBe(502);
  });
});
