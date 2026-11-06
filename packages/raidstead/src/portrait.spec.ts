import { describe, expect, it } from "vitest";
import { BOSS_KINDS, FOLK } from "./art";
import { portrait, portraitSvg } from "./portrait";
import { INKS, LIME, VIOLET } from "./print";

const inside = (p: ReturnType<typeof portrait>) =>
  p.dots.every((d) => d.x - d.r >= -0.01 && d.y - d.r >= -0.01 && d.x + d.r <= p.width + 0.01 && d.y + d.r <= p.height + 0.01);

describe("portrait", () => {
  it("fits every pest and townsfolk into its frame, the parts outside the model's box included", () => {
    for (const kind of [...BOSS_KINDS, "wasp", "spider", "gnat", ...FOLK]) {
      const p = portrait(kind, { width: 200, height: 150, pad: 4 });
      expect(p.dots.length, kind).toBeGreaterThan(100);
      expect(inside(p), kind).toBe(true);
    }
    // All appendages still fit a compact card.
    expect(inside(portrait("beetle", { width: 120, height: 90, pad: 0 }))).toBe(true);
  });

  it("the full picture prints in the game's inks", () => {
    const colors = new Set(portrait("beetle", { width: 200, height: 150 }).dots.map((d) => d.color));
    expect(colors.has(INKS[VIOLET].c)).toBe(true);
    expect(colors.has(INKS[LIME].c)).toBe(true);
  });

  it("renders as a standalone SVG", () => {
    const svg = portraitSvg("scout", { width: 120, height: 150 });
    expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg" width="120" height="150"')).toBe(true);
    expect(svg.match(/<circle /g)!.length).toBeGreaterThan(100);
  });

  it("draws nothing when the padding leaves no room", () => {
    expect(portrait("beetle", { width: 12, height: 40, pad: 6 }).dots).toEqual([]);
    expect(portrait("beetle", { width: 10, height: 40, pad: 6 }).dots).toEqual([]);
    expect(portrait("beetle", { width: 40, height: 12, pad: 6 }).dots).toEqual([]);
    expect(portrait("beetle", { width: 13, height: 13, pad: 6 }).dots.every((d) => d.r > 0)).toBe(true);
  });

  it("refuses an unknown model", () => {
    expect(() => portrait("dragon", { width: 10, height: 10 })).toThrow("unknown model dragon");
  });
});
