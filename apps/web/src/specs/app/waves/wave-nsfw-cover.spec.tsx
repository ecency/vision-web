import React from "react";
import { vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import { WaveNsfwGate } from "@/app/waves/_components/wave-nsfw-gate";
import {
  isRememberedNsfwWave,
  rememberNsfwWave,
  waveNeedsNsfwCover
} from "@/app/waves/_utils/wave-nsfw";

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

describe("flagged waves remembered for the wave page", () => {
  it("knows a wave seen flagged in a feed, and only that one", () => {
    expect(isRememberedNsfwWave("alice", "wave-1")).toBe(false);
    rememberNsfwWave("alice", "wave-1");
    expect(isRememberedNsfwWave("alice", "wave-1")).toBe(true);
    expect(isRememberedNsfwWave("alice", "wave-2")).toBe(false);
    expect(isRememberedNsfwWave("bob", "wave-1")).toBe(false);
    expect(isRememberedNsfwWave(undefined, "wave-1")).toBe(false);
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

  it("has both strings in the catalog", async () => {
    const catalog = (await import("@/features/i18n/locales/en-US.json")).default as {
      waves: Record<string, string>;
    };
    expect(catalog.waves["nsfw-cover"]).toBeTruthy();
    expect(catalog.waves["nsfw-reveal"]).toBeTruthy();
  });
});
