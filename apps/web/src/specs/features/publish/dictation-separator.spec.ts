import { describe, expect, test } from "vitest";
import { dictationSeparator } from "@/app/publish/_hooks/dictation-separator";

const text = (t: string) => ({ isText: true, text: t, type: { name: "text" } });
const node = (name: string) => ({ isText: false, type: { name } });

/**
 * Dictation inserts repeatedly into a live document, so what sits immediately before
 * the cursor is arbitrary. The original check used doc.textBetween, which renders
 * non-text leaves as an empty string -- making an inline image indistinguishable from
 * the start of a block, and running the transcript straight onto it.
 */
describe("dictationSeparator", () => {
  test("no space at the start of a block", () => {
    expect(dictationSeparator(null)).toBe("");
    expect(dictationSeparator(undefined)).toBe("");
  });

  test("a space after text that does not end in whitespace", () => {
    expect(dictationSeparator(text("hello"))).toBe(" ");
    expect(dictationSeparator(text("end."))).toBe(" ");
  });

  test("no space after text that already ends in whitespace", () => {
    expect(dictationSeparator(text("hello "))).toBe("");
    expect(dictationSeparator(text("line\n"))).toBe("");
    expect(dictationSeparator(text("tab\t"))).toBe("");
  });

  test("no space after a hard break, which already separates", () => {
    expect(dictationSeparator(node("hardBreak"))).toBe("");
  });

  test("a space after an inline image", () => {
    // The regression this helper exists for: images are inline, so textBetween
    // reported "" and the transcript was concatenated onto the image.
    expect(dictationSeparator(node("image"))).toBe(" ");
  });

  test("a space after any other inline atom", () => {
    expect(dictationSeparator(node("mention"))).toBe(" ");
    expect(dictationSeparator(node("emoji"))).toBe(" ");
  });

  test("empty text is treated as no content", () => {
    expect(dictationSeparator({ isText: true, text: "", type: { name: "text" } })).toBe(" ");
  });
});
