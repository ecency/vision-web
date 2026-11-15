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

// The caption's room is reserved only on a placeholder that is about to get a
// caption: inside a view that inserts one (the marker class) and not yet
// enhanced. Elsewhere (waves direct embeds, previews rendered without the
// enhancer, an id the client rejects) no caption comes, so no gap is left.
const RESERVE =
  ".markdown-view.er-youtube-source-host .markdown-video-link-youtube[data-youtube]" +
  ":not(.er-youtube):not([data-enhanced])";

describe("YouTube URL caption room (#235)", () => {
  async function enhance(html: string) {
    const { applyYoutubeVideos } = await import(
      "@/features/post-renderer/components/utils/youtubeVideosEnhancer"
    );
    const host = document.createElement("div");
    host.innerHTML = `<div class="markdown-view er-youtube-source-host">${html}</div>`;
    document.body.appendChild(host);
    const placeholder = host.querySelector<HTMLElement>(".markdown-video-link-youtube")!;
    const reservedBefore = placeholder.matches(RESERVE);
    const roots = applyYoutubeVideos(host);
    // Same task as the enhancer call: no frame between dropping the room and the caption.
    const reservedAfter = placeholder.matches(RESERVE);
    const next = placeholder.nextElementSibling;
    roots.forEach((r) => act(() => r.unmount()));
    host.remove();
    return { reservedBefore, reservedAfter, next };
  }

  it("moves the room to the caption in the same step the enhancer adds it", async () => {
    const { reservedBefore, reservedAfter, next } = await enhance(youtubeLink());
    expect(reservedBefore).toBe(true);
    expect(reservedAfter).toBe(false);
    expect(next?.classList.contains("er-youtube-source")).toBe(true);
  });

  it("drops the room for an id the client rejects", async () => {
    const { reservedAfter, next } = await enhance(
      youtubeLink().replace(`data-youtube="${ID}"`, 'data-youtube="abc.def,ghi"')
    );
    expect(reservedAfter).toBe(false);
    expect(next?.classList.contains("er-youtube-source") ?? false).toBe(false);
  });

  it("never reserves room under a direct embed (waves)", () => {
    const host = document.createElement("div");
    host.innerHTML =
      `<div class="markdown-view er-youtube-source-host">` +
      youtubeLink({}, " er-youtube").replace(
        '<span class="markdown-video-play"></span>',
        '<span class="er-youtube-frame"><iframe class="youtube-player"></iframe></span>'
      ) +
      `</div>`;
    expect(host.querySelector(".markdown-video-link-youtube")!.matches(RESERVE)).toBe(false);
  });

  it("the extension's views drop the room once enhanced", async () => {
    function Host({ html }: { html: string }) {
      const ref = useRef<HTMLDivElement>(null);
      return (
        <>
          <div
            ref={ref}
            className="markdown-view er-youtube-source-host"
            dangerouslySetInnerHTML={{ __html: html }}
          />
          <YoutubeVideoExtension containerRef={ref} html={html} />
        </>
      );
    }
    const { container } = render(<Host html={youtubeLink()} />);
    await flush();
    const placeholder = container.querySelector<HTMLElement>(".markdown-video-link-youtube")!;
    expect(placeholder.matches(RESERVE)).toBe(false);
    expect(placeholder.nextElementSibling?.classList.contains("er-youtube-source")).toBe(true);
  });
});

// Only the views that insert the caption carry the marker the room keys off.
describe("YouTube URL caption host marker (#235)", () => {
  it("is on the entry page body", async () => {
    const { EntryPageBodyHtml } = await import(
      "@/app/(dynamicPages)/entry/[category]/[author]/[permlink]/_components/entry-page-body-html"
    );
    const { container } = render(<EntryPageBodyHtml html="<p>x</p>" />);
    expect(container.querySelector("#post-body")?.classList.contains("er-youtube-source-host")).toBe(
      true
    );
  });

  it("is on an EcencyRenderer view that mounts the YouTube extension, and only there", async () => {
    const { EcencyRenderer } = await import(
      "@/features/post-renderer/components/ecency-renderer"
    );
    const hostOf = (el: React.ReactElement) => {
      const { container, unmount } = render(el);
      const has = !!container.querySelector(".markdown-view.er-youtube-source-host");
      unmount();
      return has;
    };
    expect(hostOf(<EcencyRenderer value="body" />)).toBe(true);
    expect(hostOf(<EcencyRenderer value="body" pure={true} />)).toBe(false);
    expect(
      hostOf(<EcencyRenderer value="body" renderOptions={{ embedVideosDirectly: true }} />)
    ).toBe(false);
  });
});

