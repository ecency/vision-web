import { afterEach, describe, expect, it, vi } from "vitest";
import { openInNewTab } from "@/utils/open-in-new-tab";

describe("openInNewTab", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  // Without noopener the new tab keeps window.opener and can start with a copy
  // of this origin's sessionStorage (#1833).
  it("opens a new tab with noopener and noreferrer", () => {
    const open = vi.spyOn(window, "open").mockImplementation(() => null);
    openInNewTab("/publish");
    expect(open).toHaveBeenCalledTimes(1);
    expect(open).toHaveBeenCalledWith("/publish", "_blank", "noopener,noreferrer");
  });

  // noopener makes window.open return null, so no caller may be handed a
  // handle it would then try to focus or write to.
  it("returns nothing, even when the browser hands back a window", () => {
    vi.spyOn(window, "open").mockImplementation(() => ({}) as Window);
    expect(openInNewTab("https://example.com")).toBeUndefined();
  });
});
