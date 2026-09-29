import { describe, expect, it } from "vitest";
import { FOLK, SPECIES } from "./art";
import { heroAt, isletAt, raidRow, walkRange, type HeroSpot } from "./scene";

// Four heroes at scale 0.5, their models' anchors 150px apart: boxes are
// 166px wide, so neighbours overlap by a few pixels at the weapon side.
const spots = (shown = true): HeroSpot[] =>
  (["scribe", "scout", "smith", "herald"] as const).map((hero, i) => ({ hero, ox: i * 150, oy: 0, s: 0.5, shown }));

describe("heroAt", () => {
  it("finds the hero under a tap", () => {
    expect(heroAt(100, 100, spots())).toBe("scribe");
    expect(heroAt(400, 100, spots())).toBe("smith");
  });

  it("gives an overlap to the hero standing nearest", () => {
    // x=190: inside scribe's box (it reaches to 196) and scout's (from 180)
    expect(heroAt(190, 100, spots())).toBe("scout");
    expect(heroAt(182, 100, spots())).toBe("scout");
  });

  it("misses outside every box and ignores hidden heroes", () => {
    expect(heroAt(100, 300, spots())).toBeNull();
    expect(heroAt(100, 100, spots(false))).toBeNull();
  });
});

describe("isletAt", () => {
  // two islets at scale 0.25; the second sits right behind the first
  const spots = [
    { community: "near", ox: 0, oy: 0, s: 0.25, shown: true },
    { community: "far", ox: 20, oy: 0, s: 0.25, shown: true }
  ];

  it("hits the islet itself, not the sky in its box", () => {
    expect(isletAt(50, 31, spots)).toBe("near"); // over the hall
    expect(isletAt(8, -1, spots.slice(0, 1))).toBeNull(); // box corner, open sky
  });

  it("gives an overlap to the nearer town, and skips hidden ones", () => {
    expect(isletAt(60, 31, spots)).toBe("near");
    expect(isletAt(60, 31, [{ ...spots[0], shown: false }, spots[1]])).toBe("far");
  });
});

describe("raidRow", () => {
  it("keeps every hero, props included, inside the slot", () => {
    for (const width of [320, 390, 430, 768, 1280]) {
      for (const rowH of [80, 165, 200]) {
        const { fs, xs } = raidRow(width, rowH);
        FOLK.forEach((k, i) => {
          const [x0, , x1] = SPECIES[k].box, ax = SPECIES[k].anchor[0];
          expect(xs[i] - (ax - x0) * fs, `${k} left at ${width}`).toBeGreaterThanOrEqual(0);
          expect(xs[i] + (x1 - ax) * fs, `${k} right at ${width}`).toBeLessThanOrEqual(width);
        });
        expect(xs).toEqual([...xs].sort((a, b) => a - b));
      }
    }
  });
});

describe("walkRange", () => {
  it("keeps the folk in view on a phone, facing either way", () => {
    for (const width of [320, 390, 430]) {
      const ts = width / 620, [lo, hi] = walkRange(width, ts), half = width / 2 / ts;
      for (const k of FOLK) {
        const [x0, , x1] = SPECIES[k].box, ax = SPECIES[k].anchor[0], reach = Math.max(ax - x0, x1 - ax) * 0.28;
        expect(lo - reach, `${k} at ${width}`).toBeGreaterThanOrEqual(700 - half);
        expect(hi + reach, `${k} at ${width}`).toBeLessThanOrEqual(700 + half);
      }
    }
  });

  it("follows the camera when the town is panned", () => {
    const width = 390, ts = width / 620, half = width / 2 / ts, camMax = (1400 * ts - width) / 2 + 12;
    for (const camX of [-camMax, -100, 0, 100, camMax]) {
      const [lo, hi] = walkRange(width, ts, camX), mid = 700 - camX / ts;
      expect(lo, `camX ${camX}`).toBeLessThanOrEqual(hi);
      // the stretch walked is on screen, inside the street
      expect(lo - 55, `camX ${camX}`).toBeGreaterThanOrEqual(Math.min(mid - half, 1120 - 55));
      expect(hi + 55, `camX ${camX}`).toBeLessThanOrEqual(Math.max(mid + half, 300 + 55));
      expect(lo).toBeGreaterThanOrEqual(300);
      expect(hi).toBeLessThanOrEqual(1120);
    }
  });

  it("uses the whole street when the screen shows it", () => {
    expect(walkRange(1400, 1)).toEqual([300, 1120]);
  });
});
