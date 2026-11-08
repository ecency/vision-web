import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom";

const h = vi.hoisted(() => ({
  loginType: "keychain" as string | undefined,
  hasExtension: false
}));

vi.mock("@/utils/user-token", () => ({
  getLoginType: () => h.loginType
}));

vi.mock("@/utils/hive-extensions", () => ({
  hasAnyHiveExtension: () => h.hasExtension,
  extensionSupportsAuthority: (keyType: string) => keyType !== "owner"
}));

import {
  ExtensionUnavailableNote,
  isExtensionUnavailable
} from "@/features/shared/extension-unavailable-note";

// i18next is globally mocked to echo keys.
const NOTE = "key-or-hot.extension-unavailable";

describe("isExtensionUnavailable", () => {
  beforeEach(() => {
    h.loginType = "keychain";
    h.hasExtension = false;
  });

  it("is true for an extension login with no extension on the page", () => {
    expect(isExtensionUnavailable("alice")).toBe(true);
  });

  it("is false once the extension is back", () => {
    h.hasExtension = true;
    expect(isExtensionUnavailable("alice")).toBe(false);
  });

  it.each(["key", "hivesigner", "hiveauth", "metamask", "keychain-mobile", undefined])(
    "is false for a %s login",
    (loginType) => {
      h.loginType = loginType;
      expect(isExtensionUnavailable("alice")).toBe(false);
    }
  );

  it("is false without a user", () => {
    expect(isExtensionUnavailable(undefined)).toBe(false);
  });

  it("is false for owner authority, which no extension can sign", () => {
    expect(isExtensionUnavailable("alice", "owner")).toBe(false);
  });
});

describe("ExtensionUnavailableNote", () => {
  beforeEach(() => {
    h.loginType = "keychain";
    h.hasExtension = false;
  });
  afterEach(() => cleanup());

  it("tells an extension user to enable it and reload", () => {
    render(<ExtensionUnavailableNote username="alice" />);
    expect(screen.getByRole("status")).toHaveTextContent(NOTE);
  });

  it("renders nothing when the extension is available", () => {
    h.hasExtension = true;
    const { container } = render(<ExtensionUnavailableNote username="alice" />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing for a key login", () => {
    h.loginType = "key";
    const { container } = render(<ExtensionUnavailableNote username="alice" />);
    expect(container).toBeEmptyDOMElement();
  });
});
