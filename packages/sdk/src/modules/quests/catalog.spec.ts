import { describe, expect, it } from "vitest";
import {
  earnsQuestContentCredit,
  measureQuestContentLength,
  QUEST_MIN_CONTENT_LENGTH
} from "./catalog";

/**
 * These mirror the ePoints verifier's content rule:
 *
 *   bodyy = re.sub(r'http://\S+|https://\S+', '', op_data.get('body') or '')
 *   return op_data.get('author') == user and len(bodyy) > CONTENT_MIN_LENGTH
 *
 * If the backend rule moves, these are the tests that should fail first.
 */
describe("quest content rule", () => {
  it("strips URLs before measuring, so a link-only reply measures as empty", () => {
    expect(measureQuestContentLength("https://i.example.com/a-very-long-image-url.gif")).toBe(0);
    expect(
      measureQuestContentLength("http://a.example.com/x.png https://b.example.com/y.png")
    ).toBe(1); // the space between them
  });

  it("counts everything that is not a URL, without trimming", () => {
    expect(measureQuestContentLength("Thank you")).toBe(9);
    expect(measureQuestContentLength("  hi  ")).toBe(6);
    expect(measureQuestContentLength(undefined)).toBe(0);
    expect(measureQuestContentLength(null)).toBe(0);
  });

  it("rejects the short replies the backend rejects", () => {
    expect(earnsQuestContentCredit("Thank you")).toBe(false);
    expect(earnsQuestContentCredit("Lol 😂")).toBe(false);
    expect(earnsQuestContentCredit("❤️")).toBe(false);
    expect(earnsQuestContentCredit("https://i.example.com/kiss.gif")).toBe(false);
    expect(earnsQuestContentCredit("")).toBe(false);
  });

  it("is strictly greater than the minimum, matching the backend comparison", () => {
    const exactly = "a".repeat(QUEST_MIN_CONTENT_LENGTH);
    const oneMore = "a".repeat(QUEST_MIN_CONTENT_LENGTH + 1);

    expect(earnsQuestContentCredit(exactly)).toBe(false);
    expect(earnsQuestContentCredit(oneMore)).toBe(true);
  });

  it("accepts a normal reply that happens to contain a link", () => {
    expect(
      earnsQuestContentCredit("This is a real reply with plenty to say https://example.com/x")
    ).toBe(true);
  });
});
