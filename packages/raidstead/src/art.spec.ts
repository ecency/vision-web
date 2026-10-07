import { describe, expect, it } from "vitest";
import { BOSS_KINDS, BUILDING_IDS, SPECIES, TOWN } from "./art";
import { COL, PRINT, buildModel, path, pip } from "./print";

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

  it("shots aimed at a boss land on its body", () => {
    for (const kind of BOSS_KINDS) {
      const spec = SPECIES[kind];
      const body = spec.parts().filter((p) => p.kind === "fill" && p.poly && !["ground", "shadow", "foot", "phone"].includes(p.group!) && !p.limb);
      // the scene aims within 0.8 of each aim ellipse's radii
      for (const [cx, cy, rx, ry] of spec.aim!) for (let a = 0; a < 6.283; a += 0.2) for (const k of [0, 0.4, 0.8]) {
        const x = cx + Math.cos(a) * rx * k, y = cy + Math.sin(a) * ry * k;
        expect(body.some((p) => pip(x, y, p.poly!)), `${kind} ${x.toFixed(0)},${y.toFixed(0)}`).toBe(true);
      }
    }
  });

  it("pale highlights are fills: a line prints its first ink solid", () => {
    // ghost hairlines (wing veins, webs) and the herald's coral plume ribs are solid on purpose
    const solidOnPurpose = [COL.ghost, COL.gold];
    for (const [kind, spec] of Object.entries(SPECIES))
      for (const p of spec.parts()) if (p.kind === "line" && p.color && !solidOnPurpose.includes(p.color))
        // a colour missing from PRINT prints solid night; one with no inks (white) prints nothing
        expect(p.color in PRINT ? PRINT[p.color][0]?.[1] ?? 0 : 1, `${kind} ${p.name}`).toBeGreaterThanOrEqual(0.5);
  });

  it("no pest part shrinks to one big paper dot at phone dot pitches", () => {
    // a fill that catches no screen point prints one paper dot over its whole box;
    // fine for a pupil's shine, a blot in the town for a wing or a highlight band
    for (const kind of [...BOSS_KINDS, "wasp", "spider", "gnat"]) {
      const spec = SPECIES[kind];
      // the coarsest pitch each one gets on a phone, Canvas 2D fallback included
      const max = ({ spider: 14, gnat: 11.5 } as Record<string, number>)[kind] ?? 11;
      for (let sp = 3; sp <= max; sp += 0.25) {
        const parts = spec.parts();
        for (const d of buildModel(parts, sp, spec.seed, true)) if (d.knock && d.r > 6) {
          const [x0, y0, x1, y1] = parts[d.p].bb!;
          expect(Math.abs(d.r - Math.hypot(x1 - x0, y1 - y0) / 2 / 1.25) > 1e-9, `${kind} ${parts[d.p].name} at ${sp}`).toBe(true);
        }
      }
    }
  });

  it("a path is one stroke: a second M is refused, not joined by a stray line", () => {
    expect(() => path("M150 238 Q158 262 146 284 M252 236 Q262 258 256 276")).toThrow(/more than one M/);
    expect(path("M150 238 Q158 262 146 284").length).toBe(15);
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
