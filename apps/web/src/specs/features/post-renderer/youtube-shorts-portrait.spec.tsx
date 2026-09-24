import React, { useRef } from "react";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { act, render } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { YoutubeVideoExtension } from "@/features/post-renderer/components/extensions/youtube-video-extension";

/**
 * YouTube Shorts are 9:16 but share the /embed/<id> URL of a landscape video,
 * so render-helper tags the wrapper with markdown-video-link-youtube-portrait
 * from the posted /shorts/ link (issue #1271). Two things must hold on web:
 * the stylesheet sizes that modifier 9:16, and the click-to-play extension
 * keeps the modifier when it swaps the thumbnail for the player. jsdom applies
 * no stylesheet, so the rule is asserted on the source.
 */

const here = dirname(fileURLToPath(import.meta.url));
const scss = readFileSync(
  resolve(here, "../../../features/post-renderer/ecency-renderer.scss"),
  "utf8"
);
const markdownScss = readFileSync(resolve(here, "../../../styles/_markdown.scss"), "utf8");

function Harness({ html }: { html: string }) {
  const ref = useRef<HTMLDivElement>(null);
  return (
    <div ref={ref}>
      <div className="markdown-view" dangerouslySetInnerHTML={{ __html: html }} />
      <YoutubeVideoExtension containerRef={ref} />
    </div>
  );
}

describe("YouTube Shorts portrait sizing", () => {
  it("styles the portrait modifier 9:16 with the shared portrait max width", () => {
    const match = scss.match(
      /\.markdown-video-link-youtube\.markdown-video-link-youtube-portrait\s*\{([^}]*)\}/
    );
    expect(match).not.toBeNull();
    const body = match![1];
    expect(body).toMatch(/padding-bottom:\s*0/);
    expect(body).toMatch(/aspect-ratio:\s*9\s*\/\s*16/);
    expect(body).toMatch(/height:\s*auto/);
    expect(body).toMatch(/max-width:\s*360px/);
  });

  it("crops the 4:3 thumbnail to the portrait frame", () => {
    const match = scss.match(
      /\.markdown-video-link-youtube\.markdown-video-link-youtube-portrait\s*\{[^}]*\.video-thumbnail\s*\{([^}]*)\}/
    );
    expect(match).not.toBeNull();
    expect(match![1]).toMatch(/object-fit:\s*cover/);
  });

  // The direct-embed iframe (embedVideosDirectly, waves) carries .youtube-player
  // and is sized by its wrapper. The global iframe rules outrank the wrapper's
  // `iframe` rule, so without the exclusion a Short rendered as a small player
  // at the top of a tall black box.
  it("keeps the direct-embed YouTube iframe out of the global iframe sizing", () => {
    expect(markdownScss).toContain(
      "iframe:not(.youtube-shorts-iframe):not(.speak-iframe):not(.portrait-embed):not(.youtube-player) {"
    );
    expect(scss).toContain(
      "iframe:where(:not(.youtube-shorts-iframe, .youtube-player, .speak-iframe, .portrait-embed)) {"
    );
  });

  it("keeps the portrait modifier after click-to-play swaps in the player", async () => {
    const html =
      '<a class="markdown-video-link markdown-video-link-youtube markdown-video-link-youtube-portrait" ' +
      'data-embed-src="https://www.youtube.com/embed/dQw4w9WgXcQ?autoplay=1" data-youtube="dQw4w9WgXcQ">' +
      '<img class="no-replace video-thumbnail" src="https://img.youtube.com/vi/dQw4w9WgXcQ/hqdefault.jpg">' +
      '<span class="markdown-video-play"></span></a>';
    const { container } = render(<Harness html={html} />);

    const anchor = container.querySelector<HTMLElement>(".markdown-video-link-youtube")!;
    expect(anchor.classList.contains("er-youtube")).toBe(true);

    await act(async () => {
      anchor.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    const iframe = anchor.querySelector(".er-youtube-frame iframe");
    expect(iframe).toBeTruthy();
    expect(iframe!.getAttribute("src")).toBe(
      "https://www.youtube.com/embed/dQw4w9WgXcQ?autoplay=1"
    );
    expect(anchor.classList.contains("markdown-video-link-youtube-portrait")).toBe(true);
  });
});
