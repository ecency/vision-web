import { describe, expect, it } from "vitest";
import { BOSS_KINDS, BUILDING_IDS, SPECIES, TOWN } from "./art";
import { buildModel } from "./print";

describe("art", () => {
  it("every species prints into dots", () => {
    for (const [kind, spec] of Object.entries(SPECIES)) {
      const parts = spec.parts();
      parts.forEach((p, i) => expect(p.id, kind).toBe(i));
      const dots = buildModel(parts, 4, spec.seed);
      expect(dots.length, kind).toBeGreaterThan(50);
      for (const d of dots.slice(0, 50)) expect(Number.isFinite(d.hx) && Number.isFinite(d.r), kind).toBe(true);
    }
  });

  it("is deterministic for a seed", () => {
    const a = buildModel(SPECIES.beetle.parts(), 4, 22), b = buildModel(SPECIES.beetle.parts(), 4, 22);
    expect(a.map((d) => [d.hx, d.hy, d.r])).toEqual(b.map((d) => [d.hx, d.hy, d.r]));
  });

  it("bosses can be hit and aimed at; every building is in the town", () => {
    for (const k of BOSS_KINDS) {
      expect(SPECIES[k].hit?.length, k).toBeGreaterThan(0);
      expect(SPECIES[k].aim?.length, k).toBeGreaterThan(0);
    }
    for (const id of BUILDING_IDS) expect(TOWN.some((b) => b.id === id), id).toBe(true);
  });
});
