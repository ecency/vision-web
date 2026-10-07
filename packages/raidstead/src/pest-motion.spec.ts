import { describe, expect, it } from "vitest";
import { SPECIES } from "./art";
import { limbPose, segmentPose, type Limb } from "./pest-motion";
import { apply, mul, rotAbout, tr, type Pt } from "./print";

const near = (a: Pt, b: Pt) => a.forEach((v, i) => expect(v).toBeCloseTo(b[i], 8));

describe("pest limbs", () => {
  it("maps both endpoints, including vertical and reversed segments", () => {
    for (const [a, b] of [[[0, 0], [0, 20]], [[20, 10], [-10, 2]], [[4, 8], [30, 8]]] as [Pt, Pt][]) {
      const m = segmentPose(a, b, [15, 7], [38, 51]);
      near(apply(m, ...a), [15, 7]);
      near(apply(m, ...b), [38, 51]);
    }
  });

  it("keeps every articulated knee connected and the hip attached throughout a step", () => {
    for (const kind of ["beetle", "queen", "twins", "spider", "wasp"]) {
      const limbs = SPECIES[kind].parts().filter(p => p.segment === "upper").map(p => p.limb as Limb);
      expect(limbs.length).toBeGreaterThan(0);
      for (const limb of limbs) for (const time of [0, 0.6, 1.2, 2, 4, 6]) {
        const body = mul(tr(2, -1), rotAbout(200, 160, 0.025));
        const upper = limbPose(limb, "upper", body, time);
        const lower = limbPose(limb, "lower", body, time);
        const joint = limbPose(limb, "joint", body, time);
        near(apply(upper, ...limb.hip), apply(body, ...limb.hip));
        near(apply(upper, ...limb.knee), apply(lower, ...limb.knee));
        near(apply(joint, ...limb.knee), apply(lower, ...limb.knee));
        const foot = apply(lower, ...limb.foot);
        expect(foot[1]).toBeLessThanOrEqual(limb.foot[1] + 1e-8);
        if (Math.sin(time + limb.phase) <= 0.55) near(foot, limb.foot);
      }
    }
  });

  it("plants feet independent of time when stepping is disabled", () => {
    const limb = SPECIES.beetle.parts().find(p => p.segment === "upper")!.limb as Limb;
    for (const time of [0, 1, 4, 9]) near(apply(limbPose(limb, "lower", tr(2, 1), time, 0), ...limb.foot), limb.foot);
  });
});
