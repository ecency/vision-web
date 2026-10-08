import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import { useActiveAccount } from "@/core/hooks/use-active-account";

const ext = vi.hoisted(() => ({
  detected: [] as { id: string; name: string; icon: string }[]
}));

vi.mock("@/utils/hive-extensions", async () => {
  const actual = await vi.importActual<typeof import("@/utils/hive-extensions")>(
    "@/utils/hive-extensions"
  );
  return {
    ...actual,
    getDetectedExtensions: () => ext.detected,
    hasAnyHiveExtension: () => ext.detected.length > 0,
    setPreferredExtensionId: vi.fn()
  };
});
vi.mock("@/core/hooks/use-active-account");
vi.mock("@/utils/client", () => ({ shouldUseKeychainMobile: vi.fn(() => false) }));
vi.mock("@/utils/keychain", () => ({ isInAppBrowser: vi.fn(() => false) }));
vi.mock("@/utils/user-token", () => ({ getLoginType: vi.fn(() => "keychain") }));
vi.mock("@/utils", () => ({
  useIsMobile: vi.fn(() => false),
  random: vi.fn(),
  getAccessToken: vi.fn(() => "mock-token")
}));
vi.mock("next/image", () => ({
  __esModule: true,
  default: (props: any) => <img {...props} />
}));

import { KeyOrHot } from "@/features/shared/key-or-hot";

describe("KeyOrHot - owner authority", () => {
  beforeEach(() => {
    (useActiveAccount as any).mockReturnValue({ activeUser: { username: "alice" } });
    ext.detected = [
      { id: "keychain", name: "Keychain", icon: "/assets/keychain.png" },
      { id: "hive-keeper", name: "Hive Keeper", icon: "/assets/keeper.svg" }
    ];
  });

  it("offers the extension button for active authority", () => {
    render(<KeyOrHot inProgress={false} onKey={vi.fn()} onKc={vi.fn()} authority="active" />);
    expect(screen.getByText("key-or-hot.with-extension")).toBeInTheDocument();
    expect(screen.queryByText("key-or-hot.owner-key-only")).not.toBeInTheDocument();
  });

  it("hides every extension for owner authority and explains why", () => {
    render(<KeyOrHot inProgress={false} onKey={vi.fn()} onKc={vi.fn()} authority="owner" />);
    expect(screen.queryByText("key-or-hot.with-extension")).not.toBeInTheDocument();
    expect(screen.getByText("key-or-hot.owner-key-only")).toBeInTheDocument();
  });
});
