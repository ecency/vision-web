import React, { useRef } from "react";
import { act, render } from "@testing-library/react";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { EmbedVideoExtension } from "@/features/post-renderer/components/extensions/embed-video-extension";

/**
 * Renders a post body the way EcencyRenderer does (dangerouslySetInnerHTML into
 * a .markdown-view container) and mounts the extension against it.
 */
function Harness({ html }: { html: string }) {
  const ref = useRef<HTMLDivElement>(null);
  return (
    <div ref={ref}>
      <div className="markdown-view" dangerouslySetInnerHTML={{ __html: html }} />
      <EmbedVideoExtension containerRef={ref} />
    </div>
  );
}

function videoLink(cls: string, embedSrc: string) {
  return `<a class="markdown-video-link ${cls}" data-embed-src="${embedSrc}"><span class="markdown-video-play"></span></a>`;
}

describe("EmbedVideoExtension", () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
  });

  afterEach(() => {
    container.remove();
  });

  it.each([
    ["markdown-video-link-odysee", "https://odysee.com/$/embed/@channel:2/video:e"],
    ["markdown-video-link-bitchute", "https://www.bitchute.com/embed/abc123def/"],
    ["markdown-video-link-rumble", "https://www.rumble.com/embed/v1abc23/?pub=4"],
    ["markdown-video-link-brighteon", "https://www.brighteon.com/embed/abc123"]
  ])("plays %s on click", async (cls, embedSrc) => {
    const { container: root } = render(<Harness html={videoLink(cls, embedSrc)} />, {
      container
    });

    const anchor = root.querySelector<HTMLElement>(`.${cls}`)!;
    expect(anchor).toBeTruthy();
    // Marked as enhanced, and no iframe until the reader asks for one.
    expect(anchor.classList.contains("er-embed")).toBe(true);
    expect(anchor.querySelector("iframe")).toBeNull();

    await act(async () => {
      anchor.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    const iframe = anchor.querySelector("iframe");
    expect(iframe).toBeTruthy();
    expect(iframe!.getAttribute("src")).toBe(embedSrc);
    // Placeholder gets out of the way once the player is in.
    expect(
      (anchor.querySelector<HTMLElement>(".markdown-video-play")!).style.display
    ).toBe("none");
  });

  it("ignores an off-allowlist embed src", async () => {
    const { container: root } = render(
      <Harness
        html={videoLink("markdown-video-link-odysee", "https://evil.example/$/embed/x:1")}
      />,
      { container }
    );

    const anchor = root.querySelector<HTMLElement>(".markdown-video-link-odysee")!;
    // Never enhanced, so a click cannot mount a player.
    expect(anchor.classList.contains("er-embed")).toBe(false);

    await act(async () => {
      anchor.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(anchor.querySelector("iframe")).toBeNull();
  });

  it("leaves providers that own their enhancer alone", () => {
    const { container: root } = render(
      <Harness
        html={videoLink(
          "markdown-video-link-youtube",
          "https://www.youtube.com/embed/qK3d1eoH-Qs?autoplay=1"
        )}
      />,
      { container }
    );

    const anchor = root.querySelector<HTMLElement>(".markdown-video-link-youtube")!;
    expect(anchor.classList.contains("er-embed")).toBe(false);
  });

  it("skips a pure (non-enhanced) markdown view", () => {
    function PureHarness() {
      const ref = useRef<HTMLDivElement>(null);
      return (
        <div ref={ref}>
          <div
            className="markdown-view markdown-view-pure"
            dangerouslySetInnerHTML={{
              __html: videoLink(
                "markdown-video-link-odysee",
                "https://odysee.com/$/embed/@channel:2/video:e"
              )
            }}
          />
          <EmbedVideoExtension containerRef={ref} />
        </div>
      );
    }

    const { container: root } = render(<PureHarness />, { container });
    const anchor = root.querySelector<HTMLElement>(".markdown-video-link-odysee")!;
    expect(anchor.classList.contains("er-embed")).toBe(false);
  });
});
