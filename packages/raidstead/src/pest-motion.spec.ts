import { describe, expect, it } from "vitest";
import { SPECIES } from "./art";
import { limbPose, segmentPose, type Limb } from "./pest-motion";
import { I, apply, mul, rotAbout, tr, type Pt } from "./print";

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

  it("keeps every segment near its drawn length, even at a hit's or a death's walk", () => {
    const len = (a: Pt, b: Pt) => Math.hypot(b[0] - a[0], b[1] - a[1]);
    for (const kind of ["beetle", "queen", "twins", "spider"]) {
      for (const limb of SPECIES[kind].parts().filter(p => p.segment === "upper").map(p => p.limb as Limb)) {
        for (let time = 0; time < 7; time += 0.25) for (const amount of [1, 2.2, 3]) {
          const upper = limbPose(limb, "upper", I, time, amount), lower = limbPose(limb, "lower", I, time, amount);
          const su = len(apply(upper, ...limb.hip), apply(upper, ...limb.knee)) / len(limb.hip, limb.knee);
          const sl = len(apply(lower, ...limb.knee), apply(lower, ...limb.foot)) / len(limb.knee, limb.foot);
          for (const s of [su, sl]) { expect(s).toBeGreaterThan(0.93); expect(s).toBeLessThan(1.04); }
        }
      }
    }
  });

  it("steps toward the pest's facing: outward on symmetric pests, forward on each twin", () => {
    const step = (limb: Limb) => apply(limbPose(limb, "lower", I, Math.PI / 2 - limb.phase, 1), ...limb.foot)[0] - limb.foot[0];
    for (const kind of ["beetle", "queen", "spider"])
      for (const limb of SPECIES[kind].parts().filter(p => p.segment === "upper").map(p => p.limb as Limb))
        expect(Math.sign(step(limb))).toBe(Math.sign(limb.foot[0] - limb.hip[0]));
    for (const p of SPECIES.twins.parts().filter(p => p.segment === "upper"))
      expect(Math.sign(step(p.limb))).toBe(p.group === "Lleg" ? 1 : -1);
  });

  it("plants feet independent of time when stepping is disabled", () => {
    const limb = SPECIES.beetle.parts().find(p => p.segment === "upper")!.limb as Limb;
    for (const time of [0, 1, 4, 9]) near(apply(limbPose(limb, "lower", tr(2, 1), time, 0), ...limb.foot), limb.foot);
  });
});
