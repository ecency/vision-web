import React, { StrictMode, useRef } from "react";
import { act, fireEvent, render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
// By file path: setup-any-spec stubs the "@/features/post-renderer" barrel.
import { YoutubeVideoExtension } from "@/features/post-renderer/components/extensions/youtube-video-extension";

// #235: the click-to-play placeholder hides the video's URL (render-helper drops
// the href). A small link to the original video sits under it, before and after
// play, so it can be opened or copied without going through the player.

const ID = "dQw4w9WgXcQ";

function youtubeLink(attrs: Record<string, string> = {}, className = "") {
  const extra = Object.entries(attrs)
    .map(([k, v]) => ` ${k}="${v}"`)
    .join("");
  return (
    `<p><a class="markdown-video-link markdown-video-link-youtube${className}" ` +
    `data-embed-src="https://www.youtube.com/embed/${ID}?autoplay=1" data-youtube="${ID}"${extra}>` +
    `<img class="no-replace video-thumbnail" src="https://img.youtube.com/vi/${ID}/hqdefault.jpg">` +
    `<span class="markdown-video-play"></span></a></p>`
  );
}

function Body({ html, pure = false }: { html: string; pure?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  return (
    <>
      <div
        ref={ref}
        className={pure ? "markdown-view markdown-view-pure" : "markdown-view"}
        dangerouslySetInnerHTML={{ __html: html }}
      />
      <YoutubeVideoExtension containerRef={ref} html={html} />
    </>
  );
}

const flush = () => act(async () => {});
const sourceLinks = (root: ParentNode) =>
  Array.from(root.querySelectorAll<HTMLAnchorElement>("a.er-youtube-source"));

describe("YouTube placeholder shows the video URL (#235)", () => {
  it("adds a link to the video right after the placeholder, opening in a new tab", async () => {
    const { container } = render(<Body html={youtubeLink()} />);
    await flush();

    const [link] = sourceLinks(container);
    expect(link).toBeDefined();
    expect(link.href).toBe(`https://www.youtube.com/watch?v=${ID}`);
    expect(link.textContent).toBe(`youtube.com/watch?v=${ID}`);
    expect(link.target).toBe("_blank");
    expect(link.rel.split(" ").sort()).toEqual(["nofollow", "noopener", "noreferrer"]);
    // A sibling, so clicking it does not start the player.
    expect(link.previousElementSibling?.classList.contains("markdown-video-link-youtube")).toBe(true);
  });

  it("keeps the link once the video plays, and clicking it does not start the player", async () => {
    const { container } = render(<Body html={youtubeLink()} />);
    await flush();

    fireEvent.click(sourceLinks(container)[0]);
    await flush();
    expect(container.querySelector("iframe")).toBeNull();

    fireEvent.click(container.querySelector(".markdown-video-link-youtube")!);
    await flush();
    expect(container.querySelector("iframe")).not.toBeNull();
    expect(sourceLinks(container)).toHaveLength(1);
  });

  it("keeps the start time and links a Short to its Shorts page", async () => {
    const { container, rerender } = render(<Body html={youtubeLink({ "data-start-time": "90" })} />);
    await flush();
    expect(sourceLinks(container)[0].href).toBe(`https://www.youtube.com/watch?v=${ID}&t=90s`);

    rerender(<Body html={youtubeLink({}, " markdown-video-link-youtube-portrait")} />);
    await flush();
    expect(sourceLinks(container).map((a) => a.href)).toEqual([
      `https://www.youtube.com/shorts/${ID}`
    ]);
  });

  it("leaves one link per video across re-renders, and none after unmount", async () => {
    const { container, rerender, unmount } = render(<Body html={youtubeLink()} />);
    await flush();
    rerender(<Body html={youtubeLink() + youtubeLink()} />);
    await flush();
    expect(sourceLinks(container)).toHaveLength(2);

    const host = container;
    unmount();
    await flush();
    expect(sourceLinks(host)).toHaveLength(0);
  });

  it("leaves one link under StrictMode's double effect run", async () => {
    const { container } = render(
      <StrictMode>
        <Body html={youtubeLink()} />
      </StrictMode>
    );
    await flush();
    expect(sourceLinks(container)).toHaveLength(1);
  });

  it("adds nothing for an id that is not a YouTube video id, or in a pure view", async () => {
    const bad = youtubeLink().replace(`data-youtube="${ID}"`, 'data-youtube="x&quot;onmouseover=1"');
    const { container, rerender } = render(<Body html={bad} />);
    await flush();
    expect(sourceLinks(container)).toHaveLength(0);

    rerender(<Body html={youtubeLink()} pure />);
    await flush();
    expect(sourceLinks(container)).toHaveLength(0);
  });
});

// The entry page enhances through setupPostEnhancements, not the extension.
describe("entry page YouTube enhancer shows the video URL (#235)", () => {
  it("adds the link, and a reset then re-run leaves exactly one", async () => {
    const { applyYoutubeVideos, resetYoutubeVideos } = await import(
      "@/features/post-renderer/components/utils/youtubeVideosEnhancer"
    );
    const host = document.createElement("div");
    host.innerHTML = `<div class="markdown-view">${youtubeLink({ "data-start-time": "5" })}</div>`;
    document.body.appendChild(host);

    let roots = applyYoutubeVideos(host);
    expect(sourceLinks(host).map((a) => a.href)).toEqual([
      `https://www.youtube.com/watch?v=${ID}&t=5s`
    ]);

    resetYoutubeVideos(host);
    expect(sourceLinks(host)).toHaveLength(0);

    roots.forEach((r) => act(() => r.unmount()));
    roots = applyYoutubeVideos(host);
    expect(sourceLinks(host)).toHaveLength(1);
    roots.forEach((r) => act(() => r.unmount()));
    host.remove();
  });

  it("adds no link for an id that is not a YouTube video id", async () => {
    const { applyYoutubeVideos } = await import(
      "@/features/post-renderer/components/utils/youtubeVideosEnhancer"
    );
    const host = document.createElement("div");
    host.innerHTML = `<div class="markdown-view">${youtubeLink().replace(
      `data-youtube="${ID}"`,
      'data-youtube="bad id!"'
    )}</div>`;
    document.body.appendChild(host);

    const roots = applyYoutubeVideos(host);
    expect(sourceLinks(host)).toHaveLength(0);
    roots.forEach((r) => act(() => r.unmount()));
    host.remove();
  });
});
