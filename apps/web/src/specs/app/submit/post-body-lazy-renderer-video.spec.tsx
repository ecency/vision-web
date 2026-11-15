import React from "react";
import { fireEvent, render, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import { describe, expect, it } from "vitest";
import { PostBodyLazyRenderer } from "@/app/submit/_components/post-body-lazy-renderer";

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
});
