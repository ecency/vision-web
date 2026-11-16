import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { regexMatches } from "@/utils/regex-matches";

// Safari 12 has no String.prototype.matchAll (#1701). The helper must not
// reach for it, so the whole spec runs with it removed.
const nativeMatchAll = String.prototype.matchAll;
beforeAll(() => {
  // @ts-expect-error simulating an engine without matchAll
  delete String.prototype.matchAll;
});
afterAll(() => {
  String.prototype.matchAll = nativeMatchAll;
});

const viaMatchAll = (text: string, re: RegExp) =>
  [...nativeMatchAll.call(text, re)].map((m) => ({ text: m[0], groups: [...m], index: m.index }));
const viaHelper = (text: string, re: RegExp) =>
  regexMatches(text, re).map((m) => ({ text: m[0], groups: [...m], index: m.index }));

describe("regexMatches", () => {
  it.each([
    ["tag:a tag:b,c author:x", /(^|\s)tag:([^\s]+)/g],
    ["#travel #photo-walk #ünïcode", new RegExp("#([\\p{L}\\p{N}\\p{M}_-]+)", "gu")],
    ["no match here", /zzz/g],
    ["abc", /x*/g],
    ["😀a😀", /(?:)/gu],
    ["\uD83Dab", /(?:)/gu],
    ["a\uDE00\uD83D", /(?:)/gu],
    ["AbAB", /ab/gi]
  ])("gives what matchAll gives for %s", (text, re) => {
    expect(viaHelper(text, re)).toEqual(viaMatchAll(text, re));
  });

  it("neither reads nor moves the caller's lastIndex", () => {
    const re = /a/g;
    re.lastIndex = 2;
    expect(regexMatches("aaa", re)).toHaveLength(3);
    expect(re.lastIndex).toBe(2);
  });

  it("treats a non-global pattern as global instead of throwing", () => {
    expect(regexMatches("a1b2", /\d/).map((m) => m[0])).toEqual(["1", "2"]);
  });
});
