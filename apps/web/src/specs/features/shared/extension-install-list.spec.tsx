import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ExtensionInstallList } from "@/features/shared/extension-install-list";

const KEEPER_AMO = "https://addons.mozilla.org/firefox/addon/hive-keeper/";

const asBrowser = (ua: string) =>
  Object.defineProperty(navigator, "userAgent", { configurable: true, get: () => ua });

describe("ExtensionInstallList", () => {
  afterEach(() => {
    delete (navigator as unknown as { userAgent?: string }).userAgent;
  });

  // #2034: Keeper's Firefox listing is live, so Firefox users are offered it too
  it("offers Hive Keeper from Firefox Add-ons on Firefox", async () => {
    asBrowser("Mozilla/5.0 (X11; Linux x86_64; rv:140.0) Gecko/20100101 Firefox/140.0");
    render(<ExtensionInstallList />);
    // the list is up: Keychain has long had a Firefox listing
    await screen.findByAltText("Keychain");
    const keeper = screen.getByAltText("Hive Keeper").closest("a");
    expect(keeper?.getAttribute("href")).toBe(KEEPER_AMO);
  });
});
