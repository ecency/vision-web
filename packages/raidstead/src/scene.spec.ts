import { describe, expect, it } from "vitest";
import { heroAt, type HeroSpot } from "./scene";

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
