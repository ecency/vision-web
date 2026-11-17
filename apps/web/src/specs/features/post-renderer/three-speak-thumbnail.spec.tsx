import { describe, expect, it } from "vitest";
import { injectThreeSpeakThumbnail } from "@/features/post-renderer/components/utils/threeSpeakThumbnail";
import { applyThreeSpeakVideos } from "@/features/post-renderer/components/utils/threespeakVideosEnhancer";

// The 3Speak placeholder takes its thumbnail from json_metadata.image, which
// the author writes. Like every other image in a post it loads through the
// image proxy, and metadata of the wrong shape must not break the post.

function speakLink(): HTMLElement {
  const el = document.createElement("a");
  el.className = "markdown-video-link markdown-video-link-speak";
  el.dataset.embedSrc = "https://play.3speak.tv/watch?v=alice/abcdefgh&mode=iframe";
  el.innerHTML = '<span class="markdown-video-play"></span>';
  return el;
}

describe("injectThreeSpeakThumbnail", () => {
  it("loads the thumbnail through the image proxy, not from the author's host", () => {
    const el = speakLink();
    injectThreeSpeakThumbnail(el, ["https://attacker.example/px.gif?post=1"]);
    const src = el.querySelector("img.video-thumbnail")?.getAttribute("src") ?? "";
    expect(src).toMatch(/^https:\/\/i(mages)?\.ecency\.com\//);
    expect(src).not.toContain("attacker.example");
  });

  it.each(["javascript:alert(1)", "data:image/gif;base64,AAAA", "//attacker.example/a.gif"])(
    "adds no thumbnail for %s",
    (image) => {
      const el = speakLink();
      injectThreeSpeakThumbnail(el, [image]);
      expect(el.querySelector("img.video-thumbnail")).toBeNull();
    }
  );

  it("ignores metadata that is not an array", () => {
    const el = speakLink();
    expect(() => injectThreeSpeakThumbnail(el, "https://x.example/y.jpg" as never)).not.toThrow();
    expect(el.querySelector("img.video-thumbnail")).toBeNull();
  });
});

describe("applyThreeSpeakVideos", () => {
  it("still sets up the player when json_metadata.image is a string", () => {
    const container = document.createElement("div");
    container.className = "markdown-view";
    container.appendChild(speakLink());
    document.body.appendChild(container);
    expect(() => applyThreeSpeakVideos(container, "https://x.example/y.jpg" as never)).not.toThrow();
    expect(container.querySelector(".markdown-video-link-speak .er-speak-frame")).not.toBeNull();
    container.remove();
  });
});
