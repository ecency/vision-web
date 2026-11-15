import React from "react";
import { act, fireEvent, render } from "@testing-library/react";
import { renderPostBody } from "@ecency/render-helper";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
// Imported by file path on purpose: setup-any-spec stubs the "@/features/post-renderer"
// barrel to a null component for every other spec.
import { EcencyRenderer } from "@/features/post-renderer/components/ecency-renderer";
import { setupPostEnhancements } from "@/features/post-renderer/components/utils/setupPostEnhancements";

// renderPostBody is stubbed so the markup is exactly the click-to-play shape
// render-helper emits for a YouTube and a 3Speak link.
vi.mock("@ecency/render-helper", async () => ({
  ...(await vi.importActual<typeof import("@ecency/render-helper")>("@ecency/render-helper")),
  renderPostBody: vi.fn()
}));

const YOUTUBE_SRC = "https://www.youtube.com/embed/dQw4w9WgXcQ";
const SPEAK_SRC = "https://play.3speak.tv/watch?v=alice/abc123&mode=iframe";

const YOUTUBE_LINK =
  `<a class="markdown-video-link markdown-video-link-youtube" data-embed-src="${YOUTUBE_SRC}">` +
  `<img class="no-replace video-thumbnail" src="https://img.youtube.com/vi/dQw4w9WgXcQ/hqdefault.jpg">` +
  `<span class="markdown-video-play"></span></a>`;
const SPEAK_LINK =
  `<a class="markdown-video-link markdown-video-link-speak" data-embed-src="${SPEAK_SRC}">` +
  `<img class="no-replace video-thumbnail" src="https://images.3speak.tv/abc123.png">` +
  `<span class="markdown-video-play"></span></a>`;

const ODYSEE_SRC = "https://odysee.com/$/embed/@channel:2/video:e";
const ODYSEE_LINK =
  `<a class="markdown-video-link markdown-video-link-odysee" data-embed-src="${ODYSEE_SRC}">` +
  `<span class="markdown-video-play"></span></a>`;

// unmountRootsLater defers root teardown to a microtask.
const flush = () => act(async () => {});

function visible(el: Element | null) {
  return el instanceof HTMLElement && el.style.display !== "none";
}

describe("post renderer video click-to-play survives re-renders (#2082)", () => {
  let host: HTMLDivElement;

  beforeEach(() => {
    host = document.createElement("div");
    document.body.appendChild(host);
  });

  afterEach(() => {
    host.remove();
    vi.mocked(renderPostBody).mockReset();
  });

  it("YouTube still plays after a re-render with the same value and a new className", async () => {
    vi.mocked(renderPostBody).mockReturnValue(YOUTUBE_LINK);
    const { rerender } = render(<EcencyRenderer value="body" className="a" />, {
      container: host
    });
    await flush();
    rerender(<EcencyRenderer value="body" className="b" />);
    await flush();

    const link = host.querySelector<HTMLElement>(".markdown-video-link-youtube")!;
    await act(async () => {
      fireEvent.click(link);
    });

    expect(link.querySelector("iframe.youtube-shorts-iframe")?.getAttribute("src")).toBe(
      YOUTUBE_SRC
    );
  });

  it("YouTube plays the new video after the body changes", async () => {
    vi.mocked(renderPostBody).mockReturnValue(YOUTUBE_LINK);
    const { rerender } = render(<EcencyRenderer value="one" />, { container: host });
    await flush();
    const next = YOUTUBE_LINK.replaceAll("dQw4w9WgXcQ", "aaaaaaaaaaa");
    vi.mocked(renderPostBody).mockReturnValue(next);
    rerender(<EcencyRenderer value="two" />);
    await flush();

    const link = host.querySelector<HTMLElement>(".markdown-video-link-youtube")!;
    await act(async () => {
      fireEvent.click(link);
    });

    expect(link.querySelector("iframe.youtube-shorts-iframe")?.getAttribute("src")).toBe(
      "https://www.youtube.com/embed/aaaaaaaaaaa"
    );
  });

  it("a 3Speak reset shows the thumbnail and play button again", async () => {
    vi.mocked(renderPostBody).mockReturnValue(SPEAK_LINK);
    const { rerender } = render(<EcencyRenderer value="body" images={["a.png"]} />, {
      container: host
    });
    await flush();

    const link = host.querySelector<HTMLElement>(".markdown-video-link-speak")!;
    await act(async () => {
      fireEvent.click(link);
    });
    expect(link.querySelector("iframe.speak-iframe")).not.toBeNull();
    expect(visible(link.querySelector(".video-thumbnail"))).toBe(false);

    // A new images array re-runs the extension: reset, then enhance again.
    rerender(<EcencyRenderer value="body" images={["b.png"]} />);
    await flush();

    expect(link.querySelector("iframe.speak-iframe")).toBeNull();
    expect(visible(link.querySelector(".video-thumbnail"))).toBe(true);
    expect(visible(link.querySelector(".markdown-video-play"))).toBe(true);

    await act(async () => {
      fireEvent.click(link);
    });
    expect(link.querySelector("iframe.speak-iframe")).not.toBeNull();
  });

  it("post-body enhancements run twice on the same DOM still enhance and play every video", async () => {
    host.innerHTML = `<div class="markdown-view">${YOUTUBE_LINK}${SPEAK_LINK}</div>`;
    const body = host.firstElementChild as HTMLElement;

    const youtube = body.querySelector<HTMLElement>(".markdown-video-link-youtube")!;
    const speak = body.querySelector<HTMLElement>(".markdown-video-link-speak")!;

    let cleanup!: () => void;
    await act(async () => {
      cleanup = setupPostEnhancements(body);
    });
    // Play both first, so the thumbnails and play buttons are hidden when the
    // cleanup runs and have to come back.
    await act(async () => {
      fireEvent.click(youtube);
      fireEvent.click(speak);
    });
    expect(visible(youtube.querySelector(".video-thumbnail"))).toBe(false);
    expect(visible(speak.querySelector(".video-thumbnail"))).toBe(false);
    await act(async () => {
      cleanup();
    });
    await act(async () => {
      cleanup = setupPostEnhancements(body);
    });

    for (const link of [youtube, speak]) {
      expect(link.querySelector("iframe")).toBeNull();
      expect(visible(link.querySelector(".video-thumbnail"))).toBe(true);
      expect(visible(link.querySelector(".markdown-video-play"))).toBe(true);
    }
    expect(youtube.querySelectorAll(".er-youtube-frame")).toHaveLength(1);
    expect(speak.querySelectorAll(".er-speak-frame")).toHaveLength(1);

    await act(async () => {
      fireEvent.click(youtube);
      fireEvent.click(speak);
    });

    expect(youtube.querySelector("iframe.youtube-shorts-iframe")?.getAttribute("src")).toBe(
      YOUTUBE_SRC
    );
    expect(speak.querySelector("iframe.speak-iframe")?.getAttribute("src")).toBe(SPEAK_SRC);

    await act(async () => {
      cleanup();
    });
  });

  it("cleanup from a React effect does not unmount the roots synchronously", async () => {
    host.innerHTML = `<div class="markdown-view">${YOUTUBE_LINK}${SPEAK_LINK}</div>`;
    const body = host.firstElementChild as HTMLElement;
    // The entry page calls the cleanup from an effect cleanup, where a
    // synchronous root.unmount() makes React log a "synchronously unmount a
    // root while React was already rendering" error.
    function Enhancer() {
      React.useEffect(() => setupPostEnhancements(body), []);
      return null;
    }
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const reactHost = document.createElement("div");
      document.body.appendChild(reactHost);
      const { unmount } = render(<Enhancer />, { container: reactHost });
      await flush();
      unmount();
      await flush();
      reactHost.remove();
      const messages = errors.mock.calls.map((call) => String(call[0]));
      expect(messages.filter((m) => m.includes("synchronously unmount"))).toEqual([]);
    } finally {
      errors.mockRestore();
    }
  });

  it("3Speak plays the new video after the body changes", async () => {
    vi.mocked(renderPostBody).mockReturnValue(SPEAK_LINK);
    const { rerender } = render(<EcencyRenderer value="one" />, { container: host });
    await flush();
    vi.mocked(renderPostBody).mockReturnValue(SPEAK_LINK.replaceAll("abc123", "def456"));
    rerender(<EcencyRenderer value="two" />);
    await flush();

    const link = host.querySelector<HTMLElement>(".markdown-video-link-speak")!;
    await act(async () => {
      fireEvent.click(link);
    });

    expect(link.querySelector("iframe.speak-iframe")?.getAttribute("src")).toBe(
      "https://play.3speak.tv/watch?v=alice/def456&mode=iframe"
    );
  });

  it("3Speak keeps playing when the images prop is a new array with the same urls", async () => {
    vi.mocked(renderPostBody).mockReturnValue(SPEAK_LINK);
    const { rerender } = render(<EcencyRenderer value="body" images={["a.png"]} />, {
      container: host
    });
    await flush();
    const link = host.querySelector<HTMLElement>(".markdown-video-link-speak")!;
    await act(async () => {
      fireEvent.click(link);
    });

    rerender(<EcencyRenderer value="body" images={["a.png"]} />);
    await flush();

    expect(link.querySelector("iframe.speak-iframe")).not.toBeNull();
  });

  it("3Speak picks up a thumbnail from images that arrive after the first render", async () => {
    // No thumbnail in the markup: it comes from the post's json_metadata.image.
    const bare = SPEAK_LINK.replace(/<img[^>]*>/, "");
    vi.mocked(renderPostBody).mockReturnValue(bare);
    const { rerender } = render(<EcencyRenderer value="body" />, { container: host });
    await flush();
    const link = host.querySelector<HTMLElement>(".markdown-video-link-speak")!;
    expect(link.querySelector(".video-thumbnail")).toBeNull();

    rerender(<EcencyRenderer value="body" images={["https://images.3speak.tv/abc123.png"]} />);
    await flush();

    expect(link.querySelector(".video-thumbnail")?.getAttribute("src")).toBe(
      "https://images.3speak.tv/abc123.png"
    );
  });

  it("an Odysee video keeps playing when the markdown changes but renders the same html", async () => {
    vi.mocked(renderPostBody).mockReturnValue(ODYSEE_LINK);
    const { rerender } = render(<EcencyRenderer value="one" />, { container: host });
    await flush();
    const link = host.querySelector<HTMLElement>(".markdown-video-link-odysee")!;
    await act(async () => {
      fireEvent.click(link);
    });
    expect(link.querySelector("iframe")?.getAttribute("src")).toBe(ODYSEE_SRC);

    rerender(<EcencyRenderer value="one " />);
    await flush();

    expect(link.isConnected).toBe(true);
    expect(link.querySelector("iframe")?.getAttribute("src")).toBe(ODYSEE_SRC);
  });
});
