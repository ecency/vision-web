import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import { act, render, screen, fireEvent, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom";

// Controllable state shared with the hoisted vi.mock factories. Tests mutate
// `detected` / `kcMobile` to exercise the multi-extension, desktop-no-extension
// and Keychain-Mobile-fallback paths.
const h = vi.hoisted(() => ({
  detected: [
    { id: "hive-keeper", name: "Hive Keeper", icon: "/assets/keeper.svg" },
    { id: "keychain", name: "Keychain", icon: "/assets/keychain.png" }
  ] as { id: string; name: string; icon: string }[],
  kcMobile: false,
  username: "testuser",
  setPreferredExtensionId: vi.fn(),
  resolveAuthUpgrade: vi.fn(),
  wif: "5J" + "activekey".repeat(5) + "abcd"
}));

// The dialog only renders for a signed-in user; the global mock returns a null
// active user, so provide a username so the per-user preference is persisted.
vi.mock("@/core/hooks/use-active-account", () => ({
  useActiveAccount: () => ({ activeUser: { username: h.username } })
}));

// The global test setup stubs @/utils down to a couple of exports; restore the
// real module so UI components in the render tree (Modal/Button/KeyInput) work.
vi.mock("@/utils", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>())
}));

vi.mock("@/utils/client", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  shouldUseKeychainMobile: () => h.kcMobile
}));

vi.mock("@/utils/hive-extensions", () => ({
  extensionSupportsAuthority: (keyType: string) => keyType !== "owner",
  getDetectedExtensions: () => h.detected,
  hasAnyHiveExtension: () => h.detected.length > 0,
  setPreferredExtensionId: (username: string, id: string | null) =>
    h.setPreferredExtensionId(username, id)
}));

vi.mock("@/features/shared/auth-upgrade/auth-upgrade-events", () => ({
  resolveAuthUpgrade: (...args: unknown[]) => h.resolveAuthUpgrade(...args)
}));

// The real KeyInput derives through @ecency/sdk and @ecency/wallets, both
// globally mocked in this suite. What is under test here is which username the
// dialog hands to resolveAuthUpgrade, so a stub that signs is enough.
vi.mock("@ui/input", () => ({
  KeyInput: ({ onSign }: { onSign?: (key: unknown) => void }) => (
    <button type="button" onClick={() => onSign?.({ toString: () => h.wif })}>
      stub-sign
    </button>
  )
}));

import { AuthUpgradeDialog } from "@/features/shared/auth-upgrade";

function openDialog() {
  render(<AuthUpgradeDialog />);
  act(() => {
    window.dispatchEvent(
      new CustomEvent("ecency-auth-upgrade", {
        detail: { authority: "active", operation: "transfer" }
      })
    );
  });
}

// i18next is globally mocked to echo keys, so labels are the key strings (e.g.
// "key-or-hot.with-extension"). Buttons also carry <img alt> icons that
// contribute to their accessible name, so we match via regex.
const ORIGINAL_UA = navigator.userAgent;
function setUserAgent(ua: string) {
  Object.defineProperty(window.navigator, "userAgent", { value: ua, configurable: true });
}

describe("AuthUpgradeDialog key ownership", () => {
  beforeEach(() => {
    h.username = "testuser";
    h.resolveAuthUpgrade.mockClear();
  });
  afterEach(() => cleanup());

  it("names the account the key was derived for", async () => {
    openDialog();

    fireEvent.click(screen.getByRole("button", { name: "stub-sign" }));

    // KeyInput derives a master password or seed against the active user at
    // submit time, so the dialog is the only place that knows whose key this is.
    await vi.waitFor(() =>
      expect(h.resolveAuthUpgrade).toHaveBeenCalledWith("key", expect.any(String), "testuser")
    );
  });
});

describe("AuthUpgradeDialog extension picker", () => {
  beforeEach(() => {
    h.detected = [
      { id: "hive-keeper", name: "Hive Keeper", icon: "/assets/keeper.svg" },
      { id: "keychain", name: "Keychain", icon: "/assets/keychain.png" }
    ];
    h.kcMobile = false;
    h.setPreferredExtensionId.mockClear();
    h.resolveAuthUpgrade.mockClear();
  });
  afterEach(() => {
    setUserAgent(ORIGINAL_UA);
    cleanup();
  });

  it("shows a single unified extension button, not one per extension", () => {
    openDialog();
    // One "Sign with Extension" button regardless of how many are installed; the
    // choice is deferred to the chooser (matching login), not shown inline.
    expect(screen.getByRole("button", { name: /key-or-hot\.with-extension/i })).toBeInTheDocument();
    expect(screen.queryByText("login.extensions-select-description")).toBeNull();
  });

  it("opens the chooser on click and persists the selected extension", () => {
    openDialog();

    // Click the unified button → the body switches to the extension chooser.
    fireEvent.click(screen.getByRole("button", { name: /key-or-hot\.with-extension/i }));
    expect(screen.getByText("login.extensions-select-description")).toBeInTheDocument();

    // Picking one stores it so broadcastWithExtension targets that extension's
    // own API instead of falling back to Keeper-first.
    fireEvent.click(screen.getByRole("button", { name: /keychain/i }));
    expect(h.setPreferredExtensionId).toHaveBeenCalledWith("testuser", "keychain");
    expect(h.resolveAuthUpgrade).toHaveBeenCalledWith("keychain");
  });

  it("persists Keeper when Keeper is chosen in the chooser", () => {
    openDialog();

    fireEvent.click(screen.getByRole("button", { name: /key-or-hot\.with-extension/i }));
    fireEvent.click(screen.getByRole("button", { name: /hive keeper/i }));

    expect(h.setPreferredExtensionId).toHaveBeenCalledWith("testuser", "hive-keeper");
    expect(h.resolveAuthUpgrade).toHaveBeenCalledWith("keychain");
  });

  it("persists the lone extension on the single-extension sign path (no chooser)", () => {
    h.detected = [{ id: "keychain", name: "Keychain", icon: "/assets/keychain.png" }];
    openDialog();

    // One extension => sign directly, but still record the choice so a later
    // broadcast (after the user installs a second extension) isn't hijacked.
    fireEvent.click(screen.getByRole("button", { name: /key-or-hot\.with-extension/i }));
    expect(screen.queryByText("login.extensions-select-description")).toBeNull();
    expect(h.setPreferredExtensionId).toHaveBeenCalledWith("testuser", "keychain");
    expect(h.resolveAuthUpgrade).toHaveBeenCalledWith("keychain");
  });

  it("returns from the chooser to the sign options via Back without cancelling", () => {
    openDialog();
    fireEvent.click(screen.getByRole("button", { name: /key-or-hot\.with-extension/i }));
    expect(screen.getByText("login.extensions-select-description")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /g\.back/i }));

    // Sign options are back, the chooser is gone, and nothing was resolved.
    expect(screen.getByRole("button", { name: /key-or-hot\.with-extension/i })).toBeInTheDocument();
    expect(screen.queryByText("login.extensions-select-description")).toBeNull();
    expect(h.resolveAuthUpgrade).not.toHaveBeenCalled();
  });

  it("shows install options on desktop when no extension is detected", () => {
    h.detected = [];
    openDialog();

    // No dead-end extension button; instead guide the user to install one
    // (key entry / HiveSigner above still work).
    expect(screen.getByRole("button", { name: /hivesigner/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /keeper|keychain/i })).toBeNull();

    const keeperLink = screen.getByRole("link", { name: /hive keeper/i });
    expect(keeperLink.getAttribute("href")).toContain("chromewebstore");
    expect(screen.getByRole("link", { name: /peak vault/i })).toBeInTheDocument();
    expect(h.setPreferredExtensionId).not.toHaveBeenCalled();
  });

  it("shows only the Firefox listing (Keychain) on Firefox", () => {
    h.detected = [];
    setUserAgent("Mozilla/5.0 (X11; Linux x86_64; rv:120.0) Gecko/20100101 Firefox/120.0");
    openDialog();

    const keychainLink = screen.getByRole("link", { name: /keychain/i });
    expect(keychainLink.getAttribute("href")).toContain("addons.mozilla.org");
    // Keeper (in AMO review) and Peak Vault (Chromium-only) have no Firefox link.
    expect(screen.queryByRole("link", { name: /hive keeper/i })).toBeNull();
    expect(screen.queryByRole("link", { name: /peak vault/i })).toBeNull();
  });

  it("hides the install list entirely on mobile", () => {
    h.detected = [];
    setUserAgent(
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148"
    );
    openDialog();

    // Desktop extensions don't apply on mobile — no install links, key entry
    // and HiveSigner remain.
    expect(screen.getByRole("button", { name: /hivesigner/i })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /keeper|keychain|peak vault/i })).toBeNull();
  });

  it("keeps the generic deep-link button for Keychain Mobile with no extension", () => {
    h.detected = [];
    h.kcMobile = true;
    openDialog();

    // A deep-link path exists, so show the generic button, not install links.
    expect(screen.queryByRole("link", { name: /hive keeper/i })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /extensions/i }));

    // Deep-link path resolves generically; it must NOT pin an extension
    // preference (there's no detected extension to pin).
    expect(h.resolveAuthUpgrade).toHaveBeenCalledWith("keychain");
    expect(h.setPreferredExtensionId).not.toHaveBeenCalled();
  });
});
