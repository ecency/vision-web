import React from "react";
import { vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import { WaveNsfwGate } from "@/app/waves/_components/wave-nsfw-gate";
import { hasNsfwHint, waveNeedsNsfwCover, withNsfwHint } from "@/app/waves/_utils/wave-nsfw";

describe("waveNeedsNsfwCover", () => {
  it("covers a wave the API flagged", () => {
    expect(waveNeedsNsfwCover({ nsfw: true, json_metadata: { tags: ["waves"] } })).toBe(true);
  });

  it("covers a wave its author tagged, whatever the case", () => {
    expect(waveNeedsNsfwCover({ json_metadata: { tags: ["waves", " NSFW "] } })).toBe(true);
  });

  it("covers when either the API row or the refetched entry says so", () => {
    // The chain refetch replaces the API row in the cache and has no `nsfw` field.
    const apiRow = { nsfw: true, json_metadata: { tags: [] } };
    const chainEntry = { json_metadata: { tags: ["waves"] } };
    expect(waveNeedsNsfwCover(apiRow, chainEntry)).toBe(true);
    expect(waveNeedsNsfwCover(chainEntry, apiRow)).toBe(true);
    expect(waveNeedsNsfwCover(chainEntry, undefined)).toBe(false);
  });

  it("reads the boolean only: a missing or odd flag is not a verdict", () => {
    for (const nsfw of [undefined, null, false, "true", 1, { over: true }]) {
      expect(waveNeedsNsfwCover({ nsfw, json_metadata: { tags: ["waves"] } })).toBe(false);
    }
  });

  it("survives metadata in any shape", () => {
    expect(waveNeedsNsfwCover(null, undefined, {})).toBe(false);
    expect(waveNeedsNsfwCover({ json_metadata: null })).toBe(false);
    expect(waveNeedsNsfwCover({ json_metadata: { tags: "nsfw" } })).toBe(false);
    expect(waveNeedsNsfwCover({ json_metadata: { tags: [null, 7, "nsfwish"] } })).toBe(false);
  });
});

describe("the hint a covered card puts on its wave link", () => {
  it("is added for a flagged wave only, and read back from the URL", () => {
    expect(withNsfwHint("/waves/alice/wave-1", false)).toBe("/waves/alice/wave-1");
    const hinted = withNsfwHint("/waves/alice/wave-1", true);
    expect(hinted).toBe("/waves/alice/wave-1?sensitive=1");
    // Read the way the wave page reads it, so it survives a new tab.
    expect(hasNsfwHint(new URL(hinted, "https://example.test").searchParams)).toBe(true);
  });

  it("reads nothing but its own value", () => {
    expect(hasNsfwHint(new URLSearchParams(""))).toBe(false);
    expect(hasNsfwHint(new URLSearchParams("sensitive=0"))).toBe(false);
    expect(hasNsfwHint(new URLSearchParams("other=1"))).toBe(false);
    expect(hasNsfwHint(null)).toBe(false);
    expect(hasNsfwHint(undefined)).toBe(false);
  });
});

describe("WaveNsfwGate", () => {
  const content = (
    <div>
      <p>the words stay readable</p>
      <img src="https://images.test/a.png" alt="" />
    </div>
  );

  it("renders the content untouched when there is nothing to cover", () => {
    const { container } = render(
      <WaveNsfwGate covered={false} onReveal={() => {}}>
        {content}
      </WaveNsfwGate>
    );
    expect(screen.queryByTestId("wave-nsfw-gate")).toBeNull();
    expect(container.querySelector("[data-nsfw-covered]")).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("keeps the text and blurs the media behind a reveal button", () => {
    const { container } = render(
      <WaveNsfwGate covered={true} onReveal={() => {}}>
        {content}
      </WaveNsfwGate>
    );
    expect(screen.getByText("the words stay readable")).toBeInTheDocument();
    // i18next is globally mocked to echo keys.
    expect(screen.getByText("waves.nsfw-cover")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "waves.nsfw-reveal" })).toBeInTheDocument();
    // jsdom applies no CSS, so this pins the mechanism: the media sits inside a
    // wrapper whose classes blur pictures, players and embeds and make them inert.
    const wrapper = container.querySelector("[data-nsfw-covered]") as HTMLElement;
    expect(wrapper.querySelector("img")).not.toBeNull();
    for (const tag of ["img", "video", "iframe"]) {
      expect(wrapper.className).toContain(`[&_${tag}]:blur-2xl`);
      expect(wrapper.className).toContain(`[&_${tag}]:pointer-events-none`);
    }
  });

  it("reveals on click and keeps the click from reaching the card", () => {
    const onReveal = vi.fn();
    const onCardClick = vi.fn();
    render(
      // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions
      <div onClick={onCardClick}>
        <WaveNsfwGate covered={true} onReveal={onReveal}>
          {content}
        </WaveNsfwGate>
      </div>
    );
    fireEvent.click(screen.getByRole("button", { name: "waves.nsfw-reveal" }));
    expect(onReveal).toHaveBeenCalledTimes(1);
    // The card opens the wave on a click: reaching it would show the picture full size.
    expect(onCardClick).not.toHaveBeenCalled();
  });

  it("swallows a click on a link that wraps covered media", () => {
    // `[![](pic)](pic)` renders <a><img></a>. The image is inert, so the click
    // lands on the anchor, which would open the original picture.
    const onCardClick = vi.fn();
    const onLinkClick = vi.fn();
    const onTextLinkClick = vi.fn((e: React.MouseEvent) => e.preventDefault());
    render(
      // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions
      <div onClick={onCardClick} onAuxClick={onCardClick}>
        <WaveNsfwGate covered={true} onReveal={() => {}}>
          <a
            href="https://images.test/a.png"
            aria-label="picture"
            data-testid="media-link"
            onClick={onLinkClick}
          >
            <img src="https://images.test/a.png" alt="" />
          </a>
          <a href="https://example.test/page" data-testid="text-link" onClick={onTextLinkClick}>
            a plain link
          </a>
        </WaveNsfwGate>
      </div>
    );
    const mediaLink = screen.getByTestId("media-link");
    // dispatchEvent returns false when the default action was prevented
    expect(fireEvent.click(mediaLink)).toBe(false);
    expect(fireEvent.click(mediaLink.querySelector("img")!)).toBe(false);
    // middle click, the open-in-new-tab gesture
    expect(fireEvent(mediaLink, new MouseEvent("auxclick", { bubbles: true, cancelable: true, button: 1 }))).toBe(false);
    expect(onLinkClick).not.toHaveBeenCalled();
    expect(onCardClick).not.toHaveBeenCalled();
    // A link with no media in it keeps working.
    fireEvent.click(screen.getByTestId("text-link"));
    expect(onTextLinkClick).toHaveBeenCalledTimes(1);
  });

  it("has both strings in the catalog", async () => {
    const catalog = (await import("@/features/i18n/locales/en-US.json")).default as {
      waves: Record<string, string>;
    };
    expect(catalog.waves["nsfw-cover"]).toBeTruthy();
    expect(catalog.waves["nsfw-reveal"]).toBeTruthy();
  });
});
