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

describe("advent prize wording", () => {
  it("names a Spotlight prize as the Points of promotion it is worth", () => {
    expect(prizeText("spotlight", 1000)).toBe("Promotion worth 1,000 Points");
  });

  it("names other prizes by amount and kind", () => {
    expect(prizeText("points", 2500)).toBe("2,500 Points");
    expect(prizeText("hive", 125)).toBe("125 HIVE");
  });

  describe("in the reader's locale", () => {
    afterEach(() => vi.restoreAllMocks());
    // a German browser: the default locale formats 2500 as "2.500"
    const german = () =>
      vi.spyOn(Number.prototype, "toLocaleString").mockImplementation(function (this: number, locales?: Intl.LocalesArgument) {
        return new Intl.NumberFormat(locales ?? "de-DE").format(this);
      });

    it("formats every prize amount the reader's way", () => {
      german();
      expect(prizeText("points", 2500)).toBe("2.500 Points");
      expect(prizeText("spotlight", 1000)).toBe("Promotion worth 1.000 Points");
    });

    it("lists every place's amount on a door, Spotlight included", () => {
      german();
      expect(prizesText("points", [2500, 1500, 1000])).toBe("2.500 / 1.500 / 1.000 Points");
      expect(prizesText("spotlight", [1000, 500])).toBe("Promotion worth 1.000 / 500 Points");
    });
  });
});
