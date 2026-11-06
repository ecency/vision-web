import { afterEach, describe, expect, it, vi } from "vitest";

// The real extension adapters (@/utils/hive-extensions) with a stand-in wallet
// in window: Keychain and Peak Vault refuse by rejecting, not by resolving a
// failed answer, and the wallet's words must still reach the sign-in sheet.
vi.mock("@/utils/user-token", () => ({
  getLoginType: vi.fn(),
  getPostingKey: vi.fn(),
  getAccessToken: vi.fn(),
  ensureValidToken: vi.fn()
}));

import { signIn } from "@/features/raidstead/client";

type Answer = { success: boolean; message?: string; error?: unknown; result?: string };
const w = window as Window & { hive_keychain?: unknown; peakvault?: unknown };

describe("raidstead sign-in with a real wallet adapter", () => {
  afterEach(() => {
    delete w.hive_keychain;
    delete w.peakvault;
    localStorage.clear();
  });

  const keychainAnswering = (answer: Answer) => {
    w.hive_keychain = {
      requestHandshake: (done: () => void) => done(),
      requestSignBuffer: (_a: string, _m: string, _k: string, done: (r: Answer) => void) => done(answer)
    };
  };

  it("keeps Keychain's reason when it refuses", async () => {
    keychainAnswering({ success: false, message: "Account @ann is not in Keychain", error: "user_not_found" });
    await expect(signIn("ann", "extension", false)).rejects.toMatchObject({
      walletMessage: expect.stringContaining("Account @ann is not in Keychain")
    });
  });

  it("says the player cancelled when they did", async () => {
    keychainAnswering({ success: false, message: "Request was canceled by the user.", error: "user_cancel" });
    // the i18n stand-in answers with the key: the adapter's own "cancelled" line
    await expect(signIn("ann", "extension", false)).rejects.toMatchObject({
      walletMessage: "external-transfer.cancelled"
    });
  });

  it("keeps Peak Vault's reason when it refuses", async () => {
    w.peakvault = {
      requestSignBuffer: async (): Promise<Answer> => ({ success: false, message: "Vault is locked" })
    };
    await expect(signIn("ann", "extension", false)).rejects.toMatchObject({
      walletMessage: expect.stringContaining("Vault is locked")
    });
  });
});
