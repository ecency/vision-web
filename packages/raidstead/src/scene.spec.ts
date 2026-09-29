import { describe, expect, it } from "vitest";
import { heroAt, isletAt, type HeroSpot } from "./scene";

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
