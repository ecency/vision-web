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
      for (const d of dots) expect(Number.isFinite(d.hx) && Number.isFinite(d.hy) && Number.isFinite(d.r), kind).toBe(true);
    }
  });

  it("is deterministic for a seed", () => {
    const a = buildModel(SPECIES.beetle.parts(), 4, 22), b = buildModel(SPECIES.beetle.parts(), 4, 22);
    expect(a.map((d) => [d.hx, d.hy, d.r])).toEqual(b.map((d) => [d.hx, d.hy, d.r]));
  });

  it("a cover knocks out the whole silhouette, pale fills included", () => {
    const sp = 4, kr = sp * 0.62;
    for (const cls of ["scribe", "scout", "smith", "herald"]) {
      const parts = SPECIES[cls].parts(), dots = buildModel(parts, sp, SPECIES[cls].seed, true);
      // the scene knocks out paper under every non-line fill dot, ink or not
      const knock = dots.filter((d) => !d.line && parts[d.p].kind === "fill");
      const near = (x: number, y: number) => knock.some((d) => Math.hypot(d.hx - x, d.hy - y) < Math.max(d.r, kr) * 1.25);
      // the lit top left of the face prints almost no ink, yet must still hide the grass behind it
      for (const [x, y] of [[160, 100], [170, 80], [200, 70], [150, 130], [200, 132]]) expect(near(x, y), `${cls} ${x},${y}`).toBe(true);
      // eyes blink and move on their own, so the face keeps its paper under them
      const face = parts.find((q) => q.name === "face")!;
      for (const [x, y] of [[172, 138], [228, 138], [172, 146], [228, 130]]) expect(dots.some((d) => d.p === face.id && d.knock && Math.hypot(d.hx - x, d.hy - y) < sp), `${cls} eye ${x},${y}`).toBe(true);
    }
    expect(buildModel(SPECIES.scribe.parts(), sp, 41).some((d) => d.knock)).toBe(false);
  });

  it("every fill of a covered character keeps at least one dot, however coarse the screen", () => {
    for (const kind of ["scribe", "herald", "gnat", "wasp", "beetle", "spider"]) {
      for (const sp of [4, 9.75]) {
        const parts = SPECIES[kind].parts(), dots = buildModel(parts, sp, SPECIES[kind].seed, true);
        for (const p of parts.filter((q) => q.kind === "fill")) expect(dots.some((d) => d.p === p.id && !d.line), `${kind} ${p.name} sp ${sp}`).toBe(true);
      }
    }
  });

  it("each hero has its own head shape, moving with the head", () => {
    const mark = { scribe: "ear-quill", scout: "goggle", smith: "helmet", herald: "plume" } as const;
    for (const [cls, name] of Object.entries(mark)) {
      const parts = SPECIES[cls].parts(), p = parts.find((q) => q.name === name);
      expect(p?.group, cls).toBe("head");
      // no other hero borrows it
      for (const other of Object.keys(mark).filter((k) => k !== cls)) expect(SPECIES[other].parts().some((q) => q.name === name), `${other} ${name}`).toBe(false);
    }
  });

  it("bosses can be hit and aimed at; every building is in the town", () => {
    for (const k of BOSS_KINDS) {
      expect(SPECIES[k].hit?.length, k).toBeGreaterThan(0);
      expect(SPECIES[k].aim?.length, k).toBeGreaterThan(0);
    }
    for (const id of BUILDING_IDS) expect(TOWN.some((b) => b.id === id), id).toBe(true);
  });
});
