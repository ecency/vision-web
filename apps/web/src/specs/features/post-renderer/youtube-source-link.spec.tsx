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
    host.innerHTML = `<div class="markdown-view er-youtube-source-host">${youtubeLink({ "data-start-time": "5" })}</div>`;
    document.body.appendChild(host);
    const placeholder = host.querySelector<HTMLElement>(".markdown-video-link-youtube")!;
    expect(placeholder.matches(RESERVE)).toBe(true);

    let roots = applyYoutubeVideos(host);
    expect(placeholder.matches(RESERVE)).toBe(false);
    expect(sourceLinks(host).map((a) => a.href)).toEqual([
      `https://www.youtube.com/watch?v=${ID}&t=5s`
    ]);

    resetYoutubeVideos(host);
    expect(sourceLinks(host)).toHaveLength(0);
    // The reservation comes back with the link gone, so the gap height holds.
    expect(placeholder.matches(RESERVE)).toBe(true);

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


// An <iframe> the author pasted is kept by render-helper as a plain player with
// no placeholder, so it needs the caption too (#235 review).
const IFRAME_RESERVE =
  '.markdown-view.er-youtube-source-host iframe[src*="youtube.com/embed/"]' +
  ":not(.markdown-video-link *):not([data-enhanced])";

function youtubeIframe(src = `https://www.youtube.com/embed/${ID}`, className = "") {
  const cls = className ? ` class="${className}"` : "";
  return `<p>Intro</p><iframe${cls} src="${src}" frameborder="0" allowfullscreen="allowfullscreen"></iframe><p>After</p>`;
}

describe("a pasted YouTube iframe shows the video URL (#235)", () => {
  it("gets one caption right after it in an EcencyRenderer view, also after a re-render", async () => {
    const html = youtubeIframe();
    const { container, rerender } = render(
      <StrictMode>
        <Body html={html} />
      </StrictMode>
    );
    await flush();
    const links = sourceLinks(container);
    expect(links).toHaveLength(1);
    expect(links[0].href).toBe(`https://www.youtube.com/watch?v=${ID}`);
    expect(links[0].previousElementSibling?.tagName).toBe("IFRAME");

    rerender(
      <StrictMode>
        <Body html={`${html}<p>edited</p>`} />
      </StrictMode>
    );
    await flush();
    expect(sourceLinks(container)).toHaveLength(1);
  });

  it("links a Short's iframe to its Shorts page, centred like the Short", async () => {
    const { container } = render(
      <Body html={youtubeIframe(`https://www.youtube.com/embed/${ID}`, "portrait-embed")} />
    );
    await flush();
    const links = sourceLinks(container);
    expect(links.map((a) => a.textContent)).toEqual([`youtube.com/shorts/${ID}`]);
    expect(links[0].classList.contains("er-youtube-source-start")).toBe(false);
  });

  // A pasted landscape player is not centred on the post page (fixed width,
  // left edge), so its caption lines up with its left edge instead.
  it("starts a landscape iframe's caption at the player's left edge", async () => {
    const { container } = render(<Body html={youtubeIframe()} />);
    await flush();
    expect(sourceLinks(container)[0].classList.contains("er-youtube-source-start")).toBe(true);
  });

  it("adds nothing for another site's iframe, a bad id, a direct embed or a pure view", async () => {
    const cases = [
      youtubeIframe("https://player.vimeo.com/video/123456"),
      youtubeIframe("https://www.youtube.com/embed/abc.def,ghi"),
      `<a class="markdown-video-link markdown-video-link-youtube er-youtube" data-youtube="${ID}">` +
        `<span class="er-youtube-frame"><iframe class="youtube-player" src="https://www.youtube.com/embed/${ID}"></iframe></span></a>`
    ];
    for (const html of cases) {
      const { container, unmount } = render(<Body html={html} />);
      await flush();
      expect(sourceLinks(container)).toHaveLength(0);
      unmount();
    }
    const { container } = render(<Body html={youtubeIframe()} pure />);
    await flush();
    expect(sourceLinks(container)).toHaveLength(0);
  });

  // render-helper strips the query, so a playlist or live embed reaches the
  // client as embed/videoseries or embed/live_stream: not a video id.
  it("adds no caption for a playlist or live stream embed, but drops its room", async () => {
    for (const path of ["videoseries", "live_stream"]) {
      const { container, unmount } = render(
        <Body html={youtubeIframe(`https://www.youtube.com/embed/${path}`)} />
      );
      await flush();
      expect(sourceLinks(container)).toHaveLength(0);
      expect(container.querySelector<HTMLIFrameElement>("iframe")!.dataset.enhanced).toBe("true");
      unmount();
    }
  });

  // The sanitizer keeps an author-written class, so an iframe can carry
  // markdown-video-link itself; it is still a pasted player.
  it("captions an iframe that itself carries markdown-video-link", async () => {
    const { container } = render(
      <Body html={youtubeIframe(`https://www.youtube.com/embed/${ID}`, "markdown-video-link")} />
    );
    await flush();
    expect(sourceLinks(container)).toHaveLength(1);
    expect(container.querySelector("iframe")!.matches(IFRAME_RESERVE)).toBe(false);
  });

  it("gets one caption from the entry page enhancer, removed by a reset, one again on re-run", async () => {
    const { applyYoutubeVideos, resetYoutubeVideos } = await import(
      "@/features/post-renderer/components/utils/youtubeVideosEnhancer"
    );
    const host = document.createElement("div");
    host.innerHTML = `<div class="markdown-view er-youtube-source-host">${youtubeIframe()}</div>`;
    document.body.appendChild(host);
    const iframe = host.querySelector<HTMLIFrameElement>("iframe")!;
    expect(iframe.matches(IFRAME_RESERVE)).toBe(true);

    let roots = applyYoutubeVideos(host);
    // Same task: the room goes as the caption comes.
    expect(iframe.matches(IFRAME_RESERVE)).toBe(false);
    expect(sourceLinks(host).map((a) => a.href)).toEqual([`https://www.youtube.com/watch?v=${ID}`]);
    expect(iframe.nextElementSibling?.classList.contains("er-youtube-source")).toBe(true);

    resetYoutubeVideos(host);
    expect(sourceLinks(host)).toHaveLength(0);
    expect(iframe.matches(IFRAME_RESERVE)).toBe(true);

    roots.forEach((r) => act(() => r.unmount()));
    roots = applyYoutubeVideos(host);
    expect(sourceLinks(host)).toHaveLength(1);
    roots.forEach((r) => act(() => r.unmount()));
    host.remove();
  });

  it("drops the room for a bad id without adding a caption", async () => {
    const { applyYoutubeVideos } = await import(
      "@/features/post-renderer/components/utils/youtubeVideosEnhancer"
    );
    const host = document.createElement("div");
    host.innerHTML = `<div class="markdown-view er-youtube-source-host">${youtubeIframe(
      "https://www.youtube.com/embed/abc.def,ghi"
    )}</div>`;
    document.body.appendChild(host);
    const iframe = host.querySelector<HTMLIFrameElement>("iframe")!;
    applyYoutubeVideos(host);
    expect(iframe.matches(IFRAME_RESERVE)).toBe(false);
    expect(sourceLinks(host)).toHaveLength(0);
    host.remove();
  });

  it("drops the room in the extension's views once enhanced", async () => {
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
    const { container } = render(<Host html={youtubeIframe()} />);
    await flush();
    const iframe = container.querySelector<HTMLIFrameElement>("iframe")!;
    expect(iframe.matches(IFRAME_RESERVE)).toBe(false);
    expect(iframe.nextElementSibling?.classList.contains("er-youtube-source")).toBe(true);
  });
});
