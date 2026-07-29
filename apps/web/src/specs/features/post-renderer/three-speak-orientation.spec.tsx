import React from "react";
import { act, render } from "@testing-library/react";
import { renderPostBody } from "@ecency/render-helper";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { EcencyRenderer } from "@/features/post-renderer/components/ecency-renderer";

// renderPostBody is stubbed so each case can pin the exact markup the listener
// has to cope with. The contract test at the bottom uses the real one.
vi.mock("@ecency/render-helper", async () => ({
  ...(await vi.importActual<typeof import("@ecency/render-helper")>("@ecency/render-helper")),
  renderPostBody: vi.fn()
}));

const PLAYER_ORIGIN = "https://play.3speak.tv";
const SPEAK_SRC = "https://play.3speak.tv/watch?v=alice/abc123&mode=iframe";

const STANDALONE_IFRAME = `<iframe class="speak-iframe" src="${SPEAK_SRC}"></iframe>`;
const WRAPPED_IFRAME =
  `<a class="markdown-video-link markdown-video-link-speak er-speak">` +
  `<span class="er-speak-frame"><iframe class="speak-iframe" src="${SPEAK_SRC}"></iframe></span></a>`;

function playerReady(data: Record<string, unknown>, source: Window | null, origin = PLAYER_ORIGIN) {
  return new MessageEvent("message", {
    origin,
    data: { type: "3speak-player-ready", ...data },
    source
  });
}

describe("EcencyRenderer 3Speak orientation", () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
  });

  afterEach(() => {
    container.remove();
    vi.mocked(renderPostBody).mockReset();
  });

  function mount(html: string, embedVideosDirectly?: boolean) {
    vi.mocked(renderPostBody).mockReturnValue(html);
    const { container: root } = render(
      <EcencyRenderer
        value="body"
        pure
        renderOptions={embedVideosDirectly ? { embedVideosDirectly: true } : undefined}
      />,
      { container }
    );
    return root.querySelector<HTMLIFrameElement>("iframe.speak-iframe")!;
  }

  it("sizes an author-pasted iframe that has no video-link wrapper", async () => {
    const iframe = mount(STANDALONE_IFRAME);
    expect(iframe.closest(".markdown-video-link-speak")).toBeNull();

    await act(async () => {
      window.dispatchEvent(
        playerReady({ isVertical: true, aspectRatio: 1080 / 1920 }, iframe.contentWindow)
      );
    });

    expect(iframe.classList.contains("speak-portrait")).toBe(true);
  });

  it("marks a square author-pasted iframe", async () => {
    const iframe = mount(STANDALONE_IFRAME);

    await act(async () => {
      window.dispatchEvent(
        playerReady({ isVertical: false, aspectRatio: 1 }, iframe.contentWindow)
      );
    });

    expect(iframe.classList.contains("speak-square")).toBe(true);
  });

  it("leaves a landscape clip alone", async () => {
    const iframe = mount(STANDALONE_IFRAME);

    await act(async () => {
      window.dispatchEvent(
        playerReady({ isVertical: false, aspectRatio: 1920 / 1080 }, iframe.contentWindow)
      );
    });

    expect(iframe.classList.contains("speak-portrait")).toBe(false);
    expect(iframe.classList.contains("speak-square")).toBe(false);
  });

  it("ignores a message from another origin", async () => {
    const iframe = mount(STANDALONE_IFRAME);

    await act(async () => {
      window.dispatchEvent(
        playerReady({ isVertical: true }, iframe.contentWindow, "https://evil.example")
      );
    });

    expect(iframe.classList.contains("speak-portrait")).toBe(false);
  });

  it("classes the wrapper, not the iframe, when videos are embedded directly", async () => {
    const iframe = mount(WRAPPED_IFRAME, true);
    const wrapper = iframe.closest(".markdown-video-link-speak")!;

    await act(async () => {
      window.dispatchEvent(playerReady({ isVertical: true }, iframe.contentWindow));
    });

    expect(wrapper.classList.contains("speak-portrait")).toBe(true);
    expect(iframe.classList.contains("speak-portrait")).toBe(false);
  });

  it("leaves a wrapped player to ThreeSpeakVideoExtension outside direct-embed mode", async () => {
    const iframe = mount(WRAPPED_IFRAME);
    const wrapper = iframe.closest(".markdown-video-link-speak")!;

    await act(async () => {
      window.dispatchEvent(playerReady({ isVertical: true }, iframe.contentWindow));
    });

    expect(wrapper.classList.contains("speak-portrait")).toBe(false);
    expect(iframe.classList.contains("speak-portrait")).toBe(false);
  });

  it("render-helper really does leave a pasted 3Speak iframe unwrapped", async () => {
    const { renderPostBody: actualRenderPostBody } =
      await vi.importActual<typeof import("@ecency/render-helper")>("@ecency/render-helper");

    const host = document.createElement("div");
    host.innerHTML = actualRenderPostBody(
      `<iframe src="https://3speak.tv/embed?v=alice/abc123"></iframe>`,
      false,
      false,
      "ecency.com"
    );

    const iframe = host.querySelector("iframe.speak-iframe");
    expect(iframe).toBeTruthy();
    expect(iframe!.closest(".markdown-video-link-speak")).toBeNull();
  });
});
