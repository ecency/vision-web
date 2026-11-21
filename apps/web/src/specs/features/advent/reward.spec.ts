import { describe, expect, it, vi } from "vitest";

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

import { prizeText } from "@/features/advent/reward";

describe("advent prize wording", () => {
  it("names a Spotlight prize as the Points of promotion it is worth", () => {
    expect(prizeText("spotlight", 1000)).toBe("Promotion worth 1,000 Points");
  });

  it("names other prizes by amount and kind", () => {
    expect(prizeText("points", 2500)).toBe("2,500 Points");
    expect(prizeText("hive", 125)).toBe("125 HIVE");
  });
});
