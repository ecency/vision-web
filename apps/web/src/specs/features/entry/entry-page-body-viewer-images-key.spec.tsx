import React from "react";
import { render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EntryPageBodyViewer } from "@/app/(dynamicPages)/entry/[category]/[author]/[permlink]/_components/entry-page-body-viewer";
import { setupPostEnhancements } from "@/features/post-renderer/components/utils/setupPostEnhancements";
import { mockEntry } from "@/specs/test-utils";

vi.mock("next/dynamic", () => ({
  default: () => () => null
}));

vi.mock("@/app/(dynamicPages)/entry/[category]/[author]/[permlink]/_components/selection-popover", () => ({
  SelectionPopover: ({ children }: { children?: React.ReactNode }) => <>{children}</>
}));

vi.mock("@/utils", async () => ({
  ...(await vi.importActual("@/utils")),
  random: vi.fn(),
  getAccessToken: vi.fn(() => "mock-token")
}));

const cleanup = vi.fn();
vi.mock("@/features/post-renderer/components/utils/setupPostEnhancements", () => ({
  setupPostEnhancements: vi.fn(() => cleanup)
}));

const entryWith = (image: string[]) =>
  mockEntry({ body: "body", json_metadata: { image } as never });

// A refetched entry carries a new json_metadata.image array with the same
// urls. Re-running the enhancements for it would tear down and rebuild every
// embed, stopping a playing video (#2082).
describe("EntryPageBodyViewer re-runs enhancements only when the images change", () => {
  let host: HTMLElement;

  beforeEach(() => {
    host = document.createElement("div");
    host.innerHTML = `<div id="post-body" class="entry-body markdown-view"></div>`;
    document.body.appendChild(host);
    vi.mocked(setupPostEnhancements).mockClear();
    cleanup.mockClear();
  });

  afterEach(() => {
    host.remove();
  });

  it("keeps the enhancements for a new array with the same urls, re-runs for new urls", async () => {
    const { rerender, unmount } = render(<EntryPageBodyViewer entry={entryWith(["a.png"])} />);
    await waitFor(() => expect(setupPostEnhancements).toHaveBeenCalledTimes(1));

    rerender(<EntryPageBodyViewer entry={entryWith(["a.png"])} />);
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(cleanup).not.toHaveBeenCalled();
    expect(setupPostEnhancements).toHaveBeenCalledTimes(1);

    rerender(<EntryPageBodyViewer entry={entryWith(["b.png"])} />);
    await waitFor(() => expect(setupPostEnhancements).toHaveBeenCalledTimes(2));
    expect(cleanup).toHaveBeenCalledTimes(1);
    unmount();
  });
});
