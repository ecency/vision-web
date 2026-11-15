import React, { StrictMode } from "react";
import { fireEvent, render, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PostBodyLazyRenderer } from "@/app/submit/_components/post-body-lazy-renderer";
import { SubmitPreviewContent } from "@/app/submit/_components/submit-preview-content";

vi.mock("@/app/submit/_components/submit-poll-preview", () => ({
  SubmitPollPreview: () => null
}));
vi.mock("@/features/shared/tag", () => ({
  TagLink: ({ children }: { children: React.ReactNode }) => <>{children}</>
}));

/**
 * #1939: the classic editor preview renders videos as click-to-play
 * placeholders (data-embed-src, no href) but mounted none of the extensions
 * that turn a click into a player, so the play button did nothing.
 */

const YOUTUBE = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";
const YOUTUBE_2 = "https://www.youtube.com/watch?v=9bZkp7q19f0";

function Preview({ body }: { body: string }) {
  // The preview sits inside `.markdown-view`, which the video extensions scope to.
  return (
    <div className="preview-body markdown-view">
      <PostBodyLazyRenderer rawBody={body} />
    </div>
  );
}

async function videoLinks(container: HTMLElement, count: number) {
  return waitFor(() => {
    const links = container.querySelectorAll<HTMLElement>(".markdown-video-link-youtube");
    expect(links).toHaveLength(count);
    return Array.from(links);
  });
}

async function clickAndExpectPlayer(link: HTMLElement) {
  fireEvent.click(link.querySelector(".markdown-video-play") ?? link);
  await waitFor(() => expect(link.querySelector("iframe")).not.toBeNull());
  expect(link.querySelector("iframe")!.getAttribute("src")).toContain("youtube.com/embed/");
}

describe("classic editor preview: click-to-play video (#1939)", () => {
  it("clicking play creates the player iframe", async () => {
    const { container } = render(<Preview body={`Intro\n\n${YOUTUBE}\n\nOutro`} />);
    const [link] = await videoLinks(container, 1);
    expect(link.querySelector("iframe")).toBeNull();
    await clickAndExpectPlayer(link);
  });

  it.each([
    ["3Speak", "https://3speak.tv/watch?v=alice/abcdefgh", ".markdown-video-link-speak"]
  ])("a %s placeholder plays on click too", async (_name, url, selector) => {
    const { container } = render(<Preview body={`Intro\n\n${url}`} />);
    const link = await waitFor(() => {
      const found = container.querySelector<HTMLElement>(selector);
      expect(found).not.toBeNull();
      return found!;
    });
    fireEvent.click(link.querySelector(".markdown-video-play") ?? link);
    await waitFor(() => expect(link.querySelector("iframe")).not.toBeNull());
  });

  it("still plays after the body is edited, for the kept video and a newly added one", async () => {
    const { container, rerender } = render(<Preview body={`Intro\n\n${YOUTUBE}`} />);
    await videoLinks(container, 1);

    // Edit a paragraph above (every line below it re-keys) and add a second video.
    rerender(<Preview body={`Intro, edited\n\n${YOUTUBE}\n\nMore\n\n${YOUTUBE_2}`} />);
    const [first, second] = await videoLinks(container, 2);
    await clickAndExpectPlayer(second);
    await clickAndExpectPlayer(first);

    // Editing a paragraph BELOW keeps the playing video's line, and its player.
    rerender(<Preview body={`Intro, edited\n\n${YOUTUBE}\n\nMore, edited\n\n${YOUTUBE_2}`} />);
    await waitFor(() => expect(container.textContent).toContain("More, edited"));
    expect(first.isConnected).toBe(true);
    expect(first.querySelector("iframe")).not.toBeNull();
  });

  // Lines were keyed by their absolute index, so a block inserted ABOVE a
  // playing video re-keyed its line and remounted it, killing the player.
  it("keeps a playing video when a paragraph is inserted above it", async () => {
    const { container, rerender } = render(<Preview body={`Intro\n\n${YOUTUBE}\n\nOutro`} />);
    const [link] = await videoLinks(container, 1);
    await clickAndExpectPlayer(link);
    const iframe = link.querySelector("iframe");

    rerender(<Preview body={`New first paragraph\n\nIntro\n\n${YOUTUBE}\n\nOutro`} />);
    await waitFor(() => expect(container.textContent).toContain("New first paragraph"));
    expect(link.isConnected).toBe(true);
    expect(link.querySelector("iframe")).toBe(iframe);
  });

  it("keys identical blocks apart, so both copies of a video play", async () => {
    const { container } = render(<Preview body={`${YOUTUBE}\n\nBetween\n\n${YOUTUBE}`} />);
    const [first, second] = await videoLinks(container, 2);
    await clickAndExpectPlayer(first);
    await clickAndExpectPlayer(second);
  });
});

// React 18+ StrictMode runs every effect setup, cleanup, setup on mount. The
// YouTube and 3Speak extensions left their marker class behind on cleanup, so
// the second setup skipped every placeholder and the play button did nothing.
describe("classic editor preview under StrictMode (#1939)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  function StrictPreview({ body }: { body: string }) {
    return (
      <StrictMode>
        <Preview body={body} />
      </StrictMode>
    );
  }

  it("a YouTube placeholder plays on click", async () => {
    const { container } = render(<StrictPreview body={`Intro\n\n${YOUTUBE}`} />);
    const [link] = await videoLinks(container, 1);
    await clickAndExpectPlayer(link);
    expect(link.querySelectorAll(".er-youtube-frame")).toHaveLength(1);
  });

  it("a 3Speak placeholder plays on click", async () => {
    const { container } = render(
      <StrictPreview body={`Intro\n\nhttps://3speak.tv/watch?v=alice/abcdefgh`} />
    );
    const link = await waitFor(() => {
      const found = container.querySelector<HTMLElement>(".markdown-video-link-speak");
      expect(found).not.toBeNull();
      return found!;
    });
    fireEvent.click(link.querySelector(".markdown-video-play") ?? link);
    await waitFor(() => expect(link.querySelector("iframe")).not.toBeNull());
    expect(link.querySelectorAll(".er-speak-frame")).toHaveLength(1);
  });

  it("unmounts no root synchronously during a render", async () => {
    const consoleError = vi.spyOn(console, "error");
    const { container, rerender, unmount } = render(<StrictPreview body={`Intro\n\n${YOUTUBE}`} />);
    await videoLinks(container, 1);
    rerender(<StrictPreview body={`Intro\n\n${YOUTUBE}\n\n${YOUTUBE_2}`} />);
    await videoLinks(container, 2);
    unmount();
    await Promise.resolve();
    const syncUnmount = consoleError.mock.calls.filter(([msg]) =>
      String(msg).includes("synchronously unmount a root")
    );
    expect(syncUnmount).toHaveLength(0);
  });
});

/**
 * #1939 on the real editor DOM: `.markdown-view` wraps the lazy renderer from
 * outside, while each preview line hands the extensions its own inner div.
 * Element-scoped querySelectorAll matches ancestors outside that div, so the
 * `.markdown-view .markdown-video-link-*` selectors must still find the links.
 */
describe("SubmitPreviewContent: video placeholders play in the real editor structure", () => {
  it.each([
    ["YouTube", "https://www.youtube.com/watch?v=dQw4w9WgXcQ", ".markdown-video-link-youtube"],
    ["3Speak", "https://3speak.tv/watch?v=alice/abcdefgh", ".markdown-video-link-speak"],
    ["Odysee", "https://odysee.com/@channel:2/video:e", ".markdown-video-link-odysee"]
  ])("%s plays on click", async (_name, url, selector) => {
    const { container } = render(
      <SubmitPreviewContent title="t" tags={["hive"]} body={`Intro\n\n${url}\n\nOutro`} />
    );
    const link = await waitFor(() => {
      const found = container.querySelector<HTMLElement>(selector);
      expect(found).not.toBeNull();
      return found!;
    });
    expect(link.closest(".markdown-view")).toHaveClass("preview-body");
    expect(link.querySelector("iframe")).toBeNull();
    fireEvent.click(link.querySelector(".markdown-video-play") ?? link);
    await waitFor(() => expect(link.querySelector("iframe")).not.toBeNull());
  });
});
