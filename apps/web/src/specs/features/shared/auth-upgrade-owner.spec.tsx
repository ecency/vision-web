import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import "@testing-library/jest-dom";
import { useActiveAccount } from "@/core/hooks/use-active-account";

const ext = vi.hoisted(() => ({
  detected: [] as { id: string; name: string; icon: string }[]
}));

vi.mock("@/utils/hive-extensions", async () => ({
  ...(await vi.importActual<Record<string, unknown>>("@/utils/hive-extensions")),
  getDetectedExtensions: () => ext.detected,
  hasAnyHiveExtension: () => ext.detected.length > 0,
  setPreferredExtensionId: vi.fn()
}));
vi.mock("@/core/hooks/use-active-account");
vi.mock("@/utils/client", () => ({ shouldUseKeychainMobile: vi.fn(() => false) }));
vi.mock("@/utils/keychain", () => ({ isInAppBrowser: vi.fn(() => false) }));
vi.mock("@/utils/user-token", () => ({ getLoginType: vi.fn(() => "keychain") }));
vi.mock("@/features/shared/extension-install-list", () => ({
  ExtensionInstallList: () => <div>install-list</div>,
  useShowExtensionInstall: () => true
}));
vi.mock("@/features/shared/auth-upgrade/auth-upgrade-events", () => ({ resolveAuthUpgrade: vi.fn() }));
vi.mock("next/image", () => ({ __esModule: true, default: (props: any) => <img {...props} /> }));

import { AuthUpgradeDialog } from "@/features/shared/auth-upgrade/auth-upgrade-dialog";

function request(authority: string) {
  act(() => {
    window.dispatchEvent(
      new CustomEvent("ecency-auth-upgrade", { detail: { authority, operation: "account_update" } })
    );
  });
}

describe("AuthUpgradeDialog - owner authority", () => {
  beforeEach(() => {
    (useActiveAccount as any).mockReturnValue({ activeUser: { username: "alice" } });
    ext.detected = [{ id: "keychain", name: "Keychain", icon: "/assets/keychain.png" }];
  });

  it("offers the extension for an active request", () => {
    render(<AuthUpgradeDialog />);
    request("active");
    expect(screen.getByText("key-or-hot.with-extension")).toBeInTheDocument();
  });

  it("offers neither the extension nor the install prompt for an owner request", () => {
    render(<AuthUpgradeDialog />);
    request("owner");
    expect(screen.queryByText("key-or-hot.with-extension")).not.toBeInTheDocument();
    expect(screen.queryByText("install-list")).not.toBeInTheDocument();
  });
});
