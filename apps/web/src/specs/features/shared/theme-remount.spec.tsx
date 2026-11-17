import { render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// #1262: the layout no longer renders the dark class. <html> and <body> are
// React singletons, so a client render of the root resets them to their props
// and drops the class the pre-paint script set. <Theme/>, mounted in the client
// providers, has to put it back whenever it mounts.

vi.mock("@/core/global-store", () => ({
  useGlobalStore: (select: (s: { theme: string }) => unknown) => select({ theme: "night" })
}));

import { Theme } from "@/features/shared/theme";

describe("Theme", () => {
  afterEach(() => {
    document.documentElement.classList.remove("dark");
    document.body.classList.remove("dark");
  });

  it("restores the dark class after the root singletons were reset", () => {
    // What a client render of the root leaves behind: no class on either.
    document.documentElement.className = "";
    document.body.className = "";
    const first = render(<Theme />);
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(document.body.classList.contains("dark")).toBe(true);

    // A second client render of the root: reset again, then remount.
    first.unmount();
    document.documentElement.className = "";
    document.body.className = "";
    render(<Theme />);
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(document.body.classList.contains("dark")).toBe(true);
  });
});
