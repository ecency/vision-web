import React from "react";
import { act, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EntryPageBodyViewer } from "@/app/(dynamicPages)/entry/[category]/[author]/[permlink]/_components/entry-page-body-viewer";
import { EntryPageBodyHtml } from "@/app/(dynamicPages)/entry/[category]/[author]/[permlink]/_components/entry-page-body-html";
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

// #2083: the viewer's effect only re-ran on its own deps, so it missed a
// #post-body that changed under it. Turning raw off flips isRawContent while
// the <pre> fallback is still mounted (the effect returns), then the refresh
// mounts the rendered body; and a refresh with different html (payout or
// nofollow threshold, an edit) rewrites innerHTML after the re-enhance.
describe("EntryPageBodyViewer follows the #post-body node and its html", () => {
  let host: HTMLElement;

  beforeEach(() => {
    host = document.createElement("div");
    document.body.appendChild(host);
    vi.mocked(setupPostEnhancements).mockClear();
    cleanup.mockClear();
  });

  afterEach(() => {
    host.remove();
  });

  it("enhances the rendered body that replaces the raw <pre>", async () => {
    host.innerHTML = `<pre id="post-body">raw</pre>`;
    const viewer = render(<EntryPageBodyViewer entry={entryWith(["a.png"])} />);
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(setupPostEnhancements).not.toHaveBeenCalled();

    host.innerHTML = "";
    const body = render(<EntryPageBodyHtml html="<p>rendered</p>" />, { container: host });
    await waitFor(() => expect(setupPostEnhancements).toHaveBeenCalledTimes(1));
    expect(vi.mocked(setupPostEnhancements).mock.calls[0][0]).toBe(
      host.querySelector("#post-body")
    );
    body.unmount();
    viewer.unmount();
  });

  it("enhances again when a refresh brings different html", async () => {
    const body = render(<EntryPageBodyHtml html="<p>one</p>" />, { container: host });
    const viewer = render(<EntryPageBodyViewer entry={entryWith(["a.png"])} />);
    await waitFor(() => expect(setupPostEnhancements).toHaveBeenCalledTimes(1));

    body.rerender(<EntryPageBodyHtml html="<p>two</p>" />);
    await waitFor(() => expect(setupPostEnhancements).toHaveBeenCalledTimes(2));
    expect(cleanup).toHaveBeenCalledTimes(1);

    // The same html again (an RSC refresh) does not re-run them.
    body.rerender(<EntryPageBodyHtml html="<p>two</p>" />);
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 300));
    });
    expect(setupPostEnhancements).toHaveBeenCalledTimes(2);
    body.unmount();
    viewer.unmount();
  });
});
