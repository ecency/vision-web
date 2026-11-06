import { describe, expect, it } from "vitest";
import { BOSS_KINDS, FOLK } from "./art";
import { drawShareCard, portrait, portraitSvg } from "./portrait";
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

// A 2D context that records what is drawn on it, for a page without a real canvas.
function recordingCanvas() {
  const calls: { name: string; args: unknown[] }[] = [];
  const g = new Proxy({} as Record<string, unknown>, {
    get: (o, k: string) => (k in o ? o[k] : (...args: unknown[]) => void calls.push({ name: k, args })),
    set: (o, k: string, v) => ((o[k] = v), true)
  });
  const canvas = { width: 0, height: 0, getContext: () => g } as unknown as HTMLCanvasElement;
  return { canvas, calls };
}

describe("share card", () => {
  it("draws the pest portrait and the alliance title for each pest kind", () => {
    for (const kind of BOSS_KINDS) {
      const { canvas, calls } = recordingCanvas();
      expect(() =>
        drawShareCard(canvas, {
          kind,
          title: "Ink & Oak",
          outcome: "chased off",
          week: "Season 2, week 1",
          topLabel: "Top raiders",
          top: [
            { account: "ann", damage: 40 },
            { account: "bob", damage: 12 },
            { account: "cat", damage: 9 }
          ]
        })
      ).not.toThrow();
      expect(canvas.width, kind).toBe(1200);
      expect(canvas.height, kind).toBe(630);
      expect(calls.filter((c) => c.name === "arc").length, kind).toBeGreaterThan(100);
      const texts = calls.filter((c) => c.name === "fillText").map((c) => String(c.args[0]));
      expect(texts, kind).toContain("Ink & Oak");
      expect(texts.join(" "), kind).toContain("@ann");
    }
  });

  it("draws nothing and does not throw without a 2D context", () => {
    const canvas = { width: 0, height: 0, getContext: () => null } as unknown as HTMLCanvasElement;
    expect(() => drawShareCard(canvas, { kind: "beetle", title: "x", outcome: "y", week: "z", topLabel: "t", top: [] })).not.toThrow();
  });
});
