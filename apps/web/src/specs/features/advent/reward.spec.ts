import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("i18next", () => ({
  default: {
    t: (k: string, o?: { n?: string }) =>
      ({
        "advent.reward-points": "Points",
        "advent.reward-hive": "HIVE",
        "advent.reward-spotlight": "Spotlight",
        "advent.spotlight-amount": `Promotion worth ${o?.n} Points`
      })[k] ?? k
  }
}));

import { prizeText, prizesText } from "@/features/advent/reward";

// The reader's default number format, whatever the machine running the specs uses
const inLocale = (tag: string) =>
  vi.spyOn(Number.prototype, "toLocaleString").mockImplementation(function (this: number, locales?: Intl.LocalesArgument) {
    return new Intl.NumberFormat(locales ?? tag).format(this);
  });

describe("advent prize wording", () => {
  afterEach(() => vi.restoreAllMocks());

  it("names a Spotlight prize as the Points of promotion it is worth", () => {
    inLocale("en-US");
    expect(prizeText("spotlight", 1000)).toBe("Promotion worth 1,000 Points");
  });

  it("names other prizes by amount and kind", () => {
    inLocale("en-US");
    expect(prizeText("points", 2500)).toBe("2,500 Points");
    expect(prizeText("hive", 125)).toBe("125 HIVE");
  });

  it("formats every prize amount the reader's way", () => {
    inLocale("de-DE");
    expect(prizeText("points", 2500)).toBe("2.500 Points");
    expect(prizeText("spotlight", 1000)).toBe("Promotion worth 1.000 Points");
  });

  it("lists every place's amount on a door, Spotlight included", () => {
    inLocale("de-DE");
    expect(prizesText("points", [2500, 1500, 1000])).toBe("2.500 / 1.500 / 1.000 Points");
    expect(prizesText("spotlight", [1000, 500])).toBe("Promotion worth 1.000 / 500 Points");
  });
});
