import { describe, it, expect, vi, beforeEach } from "vitest";

// The manage panel's remote settings authorize through a hosting token
// obtained in place. These specs pin the two rails and the cache: the
// universal session-token exchange, the Keychain challenge fallback, and one
// authorization serving many edits.

const mocks = vi.hoisted(() => ({
  ensureValidToken: vi.fn(),
  getLoginType: vi.fn(),
  signBuffer: vi.fn(),
  authHivesigner: vi.fn(),
  authChallenge: vi.fn(),
  authVerify: vi.fn()
}));

vi.mock("@/utils/user-token", () => ({
  ensureValidToken: mocks.ensureValidToken,
  getLoginType: mocks.getLoginType
}));

vi.mock("@/utils/keychain", () => ({
  signBuffer: mocks.signBuffer
}));

vi.mock("@/features/hosting-signup/hosting-api", async () => {
  const actual = await vi.importActual<any>("@/features/hosting-signup/hosting-api");
  return {
    ...actual,
    hostingApi: {
      ...actual.hostingApi,
      authHivesigner: mocks.authHivesigner,
      authChallenge: mocks.authChallenge,
      authVerify: mocks.authVerify
    }
  };
});

import {
  obtainHostingToken,
  resetHostingTokenCache
} from "@/features/hosting-signup/hosting-token";

describe("obtainHostingToken", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetHostingTokenCache();
    mocks.getLoginType.mockReturnValue("hivesigner");
    mocks.ensureValidToken.mockResolvedValue("hs-token");
    mocks.authHivesigner.mockResolvedValue({
      token: "hosting-jwt",
      username: "alice",
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
    });
  });

  it("exchanges the session token once and serves later calls from the cache", async () => {
    expect(await obtainHostingToken("alice")).toBe("hosting-jwt");
    expect(await obtainHostingToken("alice")).toBe("hosting-jwt");
    expect(mocks.authHivesigner).toHaveBeenCalledTimes(1);
    expect(mocks.authHivesigner).toHaveBeenCalledWith("hs-token");
    expect(mocks.signBuffer).not.toHaveBeenCalled();
  });

  it("falls back to the Keychain challenge when the exchange is unavailable", async () => {
    mocks.ensureValidToken.mockResolvedValue(undefined);
    mocks.getLoginType.mockReturnValue("keychain");
    mocks.authChallenge.mockResolvedValue({
      username: "alice",
      challenge: "ecency-hosting-login:alice:123:nonce",
      expiresAt: new Date().toISOString()
    });
    mocks.signBuffer.mockResolvedValue({ success: true, result: "sig" });
    mocks.authVerify.mockResolvedValue({ token: "kc-jwt", username: "alice" });

    expect(await obtainHostingToken("alice")).toBe("kc-jwt");
    expect(mocks.signBuffer).toHaveBeenCalledWith(
      "alice",
      "ecency-hosting-login:alice:123:nonce",
      "Posting"
    );
    expect(mocks.authVerify).toHaveBeenCalledWith(
      "alice",
      "sig",
      "ecency-hosting-login:alice:123:nonce"
    );
  });

  it("surfaces the exchange failure when no other rail exists", async () => {
    mocks.authHivesigner.mockRejectedValue(new Error("expired token"));
    mocks.getLoginType.mockReturnValue("hivesigner");
    await expect(obtainHostingToken("alice")).rejects.toThrow("expired token");
    expect(mocks.authChallenge).not.toHaveBeenCalled();
  });
});
