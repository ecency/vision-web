import { describe, expect, it } from "vitest";
import { shouldShowShortContentHint } from "@/utils/short-content-hint";

const draft = (overrides: Record<string, unknown> = {}) => ({
  username: "alice",
  isEditing: false,
  text: "Thank you",
  ...overrides
});

describe("shouldShowShortContentHint", () => {
  it("warns on the short content the backend refuses", () => {
    expect(shouldShowShortContentHint(draft({ text: "Thank you" }))).toBe(true);
    expect(shouldShowShortContentHint(draft({ text: "Lol 😂" }))).toBe(true);
    expect(shouldShowShortContentHint(draft({ text: "❤️" }))).toBe(true);
  });

  it("counts a link-only body as too short, matching the backend rule", () => {
    expect(
      shouldShowShortContentHint(draft({ text: "https://i.example.com/a-very-long-url.gif" }))
    ).toBe(true);
  });

  it("counts emoji as code points, as the backend does", () => {
    // 13 astral emoji are 13 code points to Python's len() but 26 UTF-16 units. Getting
    // this wrong would stay silent and promise points the backend then refuses.
    expect(shouldShowShortContentHint(draft({ text: "😂".repeat(13) }))).toBe(true);
  });

  it("stays quiet once the body is long enough to earn", () => {
    expect(
      shouldShowShortContentHint(
        draft({ text: "Thank you, this is a genuinely useful reply with something to say" })
      )
    ).toBe(false);
  });

  it("stays quiet on an untouched composer", () => {
    expect(shouldShowShortContentHint(draft({ text: "" }))).toBe(false);
    expect(shouldShowShortContentHint(draft({ text: "   " }))).toBe(false);
    expect(shouldShowShortContentHint(draft({ text: undefined }))).toBe(false);
  });

  it("stays quiet when there is nothing to earn", () => {
    // Logged out earns nothing, and an edit never earns again: the original already
    // claimed the reward.
    expect(shouldShowShortContentHint(draft({ username: undefined }))).toBe(false);
    expect(shouldShowShortContentHint(draft({ username: "" }))).toBe(false);
    expect(shouldShowShortContentHint(draft({ isEditing: true }))).toBe(false);
  });
});
