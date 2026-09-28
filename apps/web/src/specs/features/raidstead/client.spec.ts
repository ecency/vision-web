import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/utils/user-token", () => ({ getLoginType: vi.fn(), getPostingKey: vi.fn() }));
vi.mock("@/utils/hive-extensions", () => ({
  hasAnyHiveExtension: vi.fn(),
  signBufferWithExtension: vi.fn()
}));

import { getLoginType, getPostingKey } from "@/utils/user-token";
import { hasAnyHiveExtension } from "@/utils/hive-extensions";
import { clearSession, loadSession, saveSession, signerFor } from "@/features/raidstead/client";

describe("raidstead client", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.mocked(getLoginType).mockReset();
    vi.mocked(getPostingKey).mockReset();
    vi.mocked(hasAnyHiveExtension).mockReset();
  });

  it("signs silently only for posting-key logins", () => {
    vi.mocked(getLoginType).mockReturnValue("privateKey");
    vi.mocked(getPostingKey).mockReturnValue("5K...");
    expect(signerFor("ann")).toBe("key");
  });

  it("falls back to a wallet extension, or none", () => {
    vi.mocked(getLoginType).mockReturnValue("hivesigner");
    vi.mocked(hasAnyHiveExtension).mockReturnValue(true);
    expect(signerFor("ann")).toBe("extension");
    vi.mocked(hasAnyHiveExtension).mockReturnValue(false);
    expect(signerFor("ann")).toBeNull();
    expect(signerFor(null)).toBeNull();
    // a key login whose key is gone cannot sign silently
    vi.mocked(getLoginType).mockReturnValue("privateKey");
    vi.mocked(getPostingKey).mockReturnValue(null);
    expect(signerFor("ann")).toBeNull();
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
});
