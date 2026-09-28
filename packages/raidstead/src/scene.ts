// The living picture: every model is a cloud of print dots on springs,
// posed by code each frame and drawn with WebGL (Canvas 2D as a fallback).
// It holds no game rules. The page tells it what the world looks like
// (sync) and what just happened (attack, cheer); the server decides both.

import { BUILDING_IDS, FOLK, SPECIES, TOWN, type BossKind, type BuildingId, type Ellipse, type FolkClass } from "./art";
import {
  CORAL, I, INKS, KNOCK, LIME, NIGHT, PAPER, VIOLET, addSpirals, apply, buildModel, clamp, ease, hex, mul, mulberry,
  rotAbout, scaleAbout, tr, type Dot, type Mat, type Part, type Pt,
} from "./print";

export type AttackType = "ink" | "signal" | "forge";
export type View = "raid" | "town";

export interface SceneWorld {
  view: View;
  boss: { kind: BossKind; alive: boolean };
  gnats: number;
  wasp: boolean;
  town: Record<BuildingId, number>;
  web: BuildingId | null;
}

export type TapTarget =
  | { kind: "boss"; side: 0 | 1 }
  | { kind: "gnat" }
  | { kind: "wasp" }
  | { kind: "building"; id: BuildingId | "homes" };

/// What an attack did, known once the server answers.
export type Impact =
  | { kind: "boss"; weak: boolean; killed: boolean }
  | { kind: "gnat" }
  | { kind: "wasp"; dodged: boolean }
  | { kind: "echo" }
  | { kind: "miss" };

export interface Shot {
  /// Gives the shot its outcome; it plays when the projectile lands.
  resolve(impact: Impact): void;
}

export interface Rect { left: number; top: number; width: number; height: number }

export interface Scene {
  /// The part of the host the world may use (the HUD covers the rest), in CSS px relative to the host.
  setSlot(rect: Rect): void;
  sync(world: SceneWorld): void;
  attack(type: AttackType, target: "boss" | "gnat" | "wasp", side?: 0 | 1): Shot;
  cheer(who?: FolkClass): void;
  readonly renderer: "webgl" | "2d";
  destroy(): void;
}

export interface SceneOptions {
  onTap?: (target: TapTarget) => void;
  reducedMotion?: boolean;
}

interface DotState extends Dot {
  x: number; y: number; vx: number; vy: number; a: number; flash: number; delay: number; free: boolean; ba: number;
}
interface Model { kind: string; sp: number; parts: Part[]; dots: Dot[] }
type InstState = "idle" | "assemble" | "dying" | "gone";
interface Act { type: "attack" | "cheer"; t0: number; dur?: number; fired?: boolean; onFire?: () => void }
interface Inst {
  kind: string; model: Model | null; dots: DotState[]; mats: Mat[]; s: number; ox: number; oy: number;
  state: InstState; stateT: number; flinch: number; flinchV: number; hop: number; hopV: number; phase: number;
  blink: number; blinkAt: number; act: Act | null; walk: number; look: Pt; morph: number;
  // town and folk extras
  stage?: number; stageShown?: number; walking?: boolean; wave?: boolean; flip?: number; stepT?: number; lift?: number; ang?: number;
}
interface Spark { x: number; y: number; vx: number; vy: number; r: number; ink: number; life: number; age: number }
interface Flight { from: Pt; to: Pt; t0: number; dur: number; ink: number; target: "boss" | "gnat" | "wasp"; side: 0 | 1; impact: Impact | null; landed: boolean }

const ATTACK: Record<AttackType, { ink: number; hero: FolkClass }> = { ink: { ink: VIOLET, hero: "scribe" }, signal: { ink: LIME, hero: "scout" }, forge: { ink: CORAL, hero: "smith" } };
const TIP: Record<FolkClass, Pt> = { scribe: [380, 100], scout: [350, 182], smith: [330, 130], herald: [360, 240] };

export function createScene(host: HTMLElement, opts: SceneOptions = {}): Scene {
  const reduced = opts.reducedMotion ?? (typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches);
  const rnd = Math.random;
  let W = 1, H = 1;

  // ---------- models ----------
  const modelCache = new Map<string, Model>();
  function getModel(kind: string, sp: number): Model {
    const q = Math.max(1, Math.round(sp * 4) / 4), key = kind + ":" + q;
    let m = modelCache.get(key);
    if (!m) {
      const spec = SPECIES[kind], parts = spec.parts(), dots = buildModel(parts, q, spec.seed);
      if (spec.boss) addSpirals(parts, dots);
      // buildings rise from the ground: each dot knows its height, 0 at the base and 1 at the top
      if (spec.building) { const [, y0, , y1] = spec.box; for (const d of dots) d.h = clamp((y1 - d.hy) / (y1 - y0), 0, 1); }
      m = { kind, sp: q, parts, dots };
      modelCache.set(key, m);
    }
    return m;
  }

  // ---------- instances ----------
  let t = 0;
  const makeInst = (kind: string, extra: Partial<Inst> = {}): Inst => ({
    kind, model: null, dots: [], mats: [], s: 1, ox: 0, oy: 0, state: "idle", stateT: 0, flinch: 0, flinchV: 0, hop: 0, hopV: 0,
    phase: rnd() * 6.283, blink: 1, blinkAt: 1 + rnd() * 3, act: null, walk: 0.5, look: [0, 0], morph: 0, ...extra,
  });
  function setModel(inst: Inst, s: number, first: boolean) {
    // target dot spacing on screen, in CSS px; small sprites get finer dots,
    // and the Canvas 2D fallback (one drawImage per dot) gets coarser ones
    const S = (s < 0.6 ? 2.7 : 3.3) * (which === "2d" ? 1.5 : 1);
    const m = getModel(inst.kind, S / s);
    inst.s = s;
    if (inst.model === m) return;
    inst.model = m;
    inst.dots = m.dots.map((d) => ({ ...d, x: 0, y: 0, vx: 0, vy: 0, a: first ? 0 : 1, flash: 0, delay: 0, free: false, ba: d.ba || 1 }));
    if (!first) { poseInst(inst); for (const d of inst.dots) { const [x, y] = target(inst, d); d.x = x; d.y = y; } }
  }
  const place = (inst: Inst, ax: number, ay: number) => { const a = SPECIES[inst.kind].anchor; inst.ox = ax - a[0] * inst.s; inst.oy = ay - a[1] * inst.s; };
  const toScreen = (inst: Inst, lx: number, ly: number): Pt => [inst.ox + lx * inst.s + inst.flinch, inst.oy + ly * inst.s + inst.hop];
  function target(inst: Inst, d: DotState): Pt {
    let hx = d.hx, hy = d.hy;
    const p = inst.model!.parts[d.p];
    if (p.kind === "ring") { const u = d.u! + t * 0.25; hx = p.cx + Math.cos(u) * p.rx; hy = p.cy + Math.sin(u) * p.ry; }
    else if (d.spiral) { hx += (d.ax! - hx) * inst.morph; hy += (d.ay! - hy) * inst.morph; }
    const m = inst.mats[d.p];
    return toScreen(inst, m[0] * hx + m[2] * hy + m[4], m[1] * hx + m[3] * hy + m[5]);
  }
  function assemble(inst: Inst, from = 0) {
    if (!inst.model) return;
    inst.state = "assemble"; inst.stateT = 0; inst.morph = 0;
    const order = inst.model.parts.length;
    for (const d of inst.dots) {
      d.free = false; d.flash = 0; d.vx = d.vy = 0; d.a = 0;
      d.delay = d.p / order * 0.6 + rnd() * 0.35 + from;
      if (reduced) { poseInst(inst); const [x, y] = target(inst, d); d.x = x; d.y = y; }
      else { const a = rnd() * 6.283, r = Math.max(W, H) * (0.5 + rnd() * 0.4); d.x = W / 2 + Math.cos(a) * r; d.y = H / 2 + Math.sin(a) * r; }
    }
  }
  function dissolve(inst: Inst, wait = 0) {
    if (inst.state === "gone" || inst.state === "dying") return;
    inst.state = "dying"; inst.stateT = 0;
    const [x0, , x1] = SPECIES[inst.kind].box;
    for (const d of inst.dots) d.delay = wait + rnd() * 0.6 + (d.hx - x0) / (x1 - x0) * 0.5;
  }
  function hide(inst: Inst) { inst.state = "gone"; for (const d of inst.dots) { d.a = 0; d.free = true; } }
  function impulse(inst: Inst, px: number, py: number, R: number, power: number) {
    for (const d of inst.dots) {
      const dx = d.x - px, dy = d.y - py, dist = Math.hypot(dx, dy) || 1;
      if (dist > R) continue;
      const f = (1 - dist / R) ** 1.5 * power * (0.6 + rnd() * 0.8);
      d.vx += dx / dist * f; d.vy += dy / dist * f; d.flash = Math.max(d.flash, 1 - dist / R);
    }
  }
  const shown = (inst: Inst) => inst.state === "idle" || inst.state === "assemble";

  // ---------- poses (per-part matrices from code) ----------
  // Eyes blink with the instance, pupils look toward the pointer, and stop
  // looking as the defeat spiral takes over.
  function eyeMat(inst: Inst, p: Part, m: Mat): Mat {
    if (!p.eye) return m;
    m = mul(m, scaleAbout(p.ec[0], p.ec[1], 1, inst.blink));
    if (p.eye === "pupil") { const k = 1 - inst.morph; m = mul(m, tr(inst.look[0] * k, inst.look[1] * k)); }
    return m;
  }
  const dying = (b: Inst) => (b.state === "dying" || b.state === "gone" ? Math.min(1, b.stateT) : 0);
  const wob = (f: number, ph = 0) => (reduced ? 0 : Math.sin(t * f + ph));
  const parts = (i: Inst) => i.model!.parts;
  const POSE: Record<string, (i: Inst) => void> = {
    beetle(b) {
      const breathe = wob(2.2) * 0.02, droop = dying(b) * 0.5;
      const body = scaleAbout(200, 236, 1 + breathe, 1 - breathe * 0.7);
      const head = mul(tr(0, wob(2.2, 0.7) * 1.3), rotAbout(200, 128, wob(1.1) * 0.035));
      for (const p of parts(b)) {
        let m = I;
        if (p.group === "shadow") m = scaleAbout(200, 262, 1 + breathe * 2 - b.hop * 0.004 / b.s, 1);
        else if (p.group === "body") m = body;
        else if (p.group === "leg") m = mul(body, rotAbout(p.pivot[0], p.pivot[1], Math.sin(t * 9 + p.i * 1.9) * 0.1 * b.walk));
        else if (p.group === "head") m = head;
        else if (p.group === "ant") m = mul(head, rotAbout(p.pivot[0], p.pivot[1], p.side * (wob(1.8, p.side) * 0.14 + droop)));
        b.mats[p.id] = eyeMat(b, p, m);
      }
    },
    slug(b) {
      const w = wob(2.2), droop = dying(b) * 0.45;
      const body = scaleAbout(40, 252, 1 + w * 0.035, 1 - w * 0.03);
      const G: Record<string, Mat> = {
        ground: I, shadow: scaleAbout(190, 262, 1 + w * 0.03, 1), glow: scaleAbout(350, 196, 1 + wob(3) * 0.04, 1 + wob(3) * 0.04), body,
        stalkL: mul(body, rotAbout(276, 156, wob(1.6) * 0.12 - droop)), stalkR: mul(body, rotAbout(290, 152, wob(1.6, 1.3) * 0.12 + droop)),
        phone: mul(body, tr(0, wob(1.3) * 2)),
      };
      G.feed = mul(G.phone, tr(0, reduced ? 0 : -((t * 14) % 12)));
      for (const p of parts(b)) b.mats[p.id] = eyeMat(b, p, G[p.group!] || I);
    },
    twins(b) {
      const droop = dying(b) * 0.4, G: Record<string, Mat | ((p: Part) => Mat)> = { shadow: I, arcs: scaleAbout(200, 196, 1 + wob(5) * 0.14, 1 + wob(5) * 0.05) };
      for (const [g, cx, ph] of [["L", 104, 0], ["R", 296, Math.PI]] as [string, number, number][]) {
        const bob = wob(2.6, ph) * 4, sq = wob(2.6, ph) * 0.02;
        const base = mul(tr(0, bob), scaleAbout(cx, 256, 1 + sq, 1 - sq));
        G[g] = base;
        // the right twin repeats the left twin's mouth a beat later: the echo
        G[g + "m"] = (p) => mul(base, scaleAbout(p.mc[0], p.mc[1], 1, 0.55 + 0.45 * Math.abs(wob(5, g === "L" ? 0 : -1.2))));
        G[g + "a"] = (p) => mul(base, rotAbout(p.pivot[0], p.pivot[1], p.side * (wob(1.8, ph + p.side) * 0.12 + droop)));
      }
      for (const p of parts(b)) { const m = G[p.group!]; b.mats[p.id] = eyeMat(b, p, typeof m === "function" ? m(p) : m || I); }
    },
    queen(b) {
      const body = rotAbout(200, 258, wob(0.9) * 0.025);
      const head = mul(body, mul(tr(0, wob(1.8) * 1.5), rotAbout(200, 140, wob(1.1) * 0.04)));
      const crown = mul(head, tr(0, -Math.abs(wob(1.8)) * 2.5 - dying(b) * 12));
      for (const p of parts(b)) {
        let m = I;
        if (p.group === "body") m = body;
        else if (p.group === "leg") m = mul(body, rotAbout(p.pivot[0], p.pivot[1], Math.sin(t * 4 + p.i * 1.7) * 0.06 * b.walk));
        else if (p.group === "head") m = head;
        else if (p.group === "crown") m = crown;
        b.mats[p.id] = eyeMat(b, p, m);
      }
    },
    wasp(w) {
      const body = mul(tr(0, wob(3) * 4), rotAbout(282, 166, wob(2) * 0.04));
      const G: Record<string, Mat> = { body, wings: mul(body, scaleAbout(214, 126, 1, reduced ? 0.8 : 0.3 + 0.7 * Math.abs(Math.sin(t * 30)))), sign: mul(body, rotAbout(112, 198, wob(1.7) * 0.08)) };
      for (const p of parts(w)) w.mats[p.id] = eyeMat(w, p, p.group === "legs" ? mul(body, rotAbout(p.pivot[0], p.pivot[1], wob(2.4, p.id) * 0.12)) : G[p.group!] || I);
    },
    island(i) { for (const p of parts(i)) i.mats[p.id] = I; },
    spider(sp) {
      const body = tr(0, wob(2) * 3);
      for (const p of parts(sp)) sp.mats[p.id] = eyeMat(sp, p, p.group === "leg" ? mul(body, rotAbout(p.pivot[0], p.pivot[1], wob(7, p.k) * 0.08 * p.side)) : p.group === "web" ? I : body);
    },
    gnat(g) {
      const flap = reduced ? 0.8 : 0.35 + 0.65 * Math.abs(Math.sin(t * 26 + g.phase)), bob = reduced ? 0 : Math.sin(t * 3 + g.phase) * 3;
      const body = tr(0, bob);
      for (const p of parts(g)) g.mats[p.id] = p.group === "wingL" || p.group === "wingR" ? mul(body, scaleAbout(p.pivot[0], p.pivot[1], 1, flap)) : body;
    },
  };
  function poseBuilding(b: Inst) {
    const G: Record<string, Mat> = {
      flag: scaleAbout(100, -33, 1 + wob(4, b.phase) * 0.1, 1 - wob(4, b.phase) * 0.12),
      glass: rotAbout(118, 124, wob(0.7, b.phase) * 0.2),
      glow: scaleAbout(100, 104, 1 + wob(3) * 0.05, 1 + wob(3) * 0.05),
      flame: scaleAbout(100, 132, 1 + wob(9) * 0.07, 1 + wob(7, 1) * 0.12),
      cup: tr(0, wob(1.5) * 2),
    };
    for (const p of parts(b)) {
      let m = G[p.group!] || I;
      if (p.group === "smoke") { const u = reduced ? 0 : (t * 0.3 + p.sm[1] * 0.013) % 1; m = mul(tr(u * 14, -u * 46), scaleAbout(p.sm[0], p.sm[1], 0.7 + u * 0.7, 0.7 + u * 0.7)); }
      b.mats[p.id] = m;
    }
  }
  function poseFolk(f: Inst) {
    const ph = f.phase;
    let bob = reduced ? 0 : Math.sin(t * 2.4 + ph) * 3, armR = reduced ? 0 : Math.sin(t * 1.6 + ph) * 0.06, armL = -armR * 0.7, squash = 0, lift = 0, eyeY = 1;
    const a = f.act;
    if (a) {
      const u = t - a.t0;
      if (a.type === "attack") {
        if (u < 0.16) { const k = ease(u / 0.16); armR = 0.35 * k; squash = 0.06 * k; }
        else if (u < 0.3) { const k = ease((u - 0.16) / 0.14); armR = 0.35 - 1.75 * k; squash = 0.06 - 0.14 * k; lift = -20 * k; }
        else if (u < 0.75) { const k = ease((u - 0.3) / 0.45); armR = -1.4 * (1 - k); squash = -0.08 * (1 - k); lift = -20 * (1 - k); }
        else f.act = null;
        if (!a.fired && u >= 0.28) { a.fired = true; a.onFire?.(); }
      } else {
        const dur = a.dur || 2;
        if (u > dur) f.act = null;
        else { const b = Math.abs(Math.sin(u * Math.PI * 2.4)); lift = -24 * b * (reduced ? 0 : 1); armR = -1.5; armL = 1.5; eyeY = 0.3; squash = -0.05 * b; }
      }
    }
    // walk cycle: feet step in turn, the body bobs twice a stride and leans in, arms swing against the feet
    let stepL: Pt = [0, 0], stepR: Pt = [0, 0], lean = 0;
    if (f.walking && !a && !reduced) {
      const p = f.stepT || 0, sw = Math.sin(p);
      stepL = [sw * 22, -Math.max(0, Math.cos(p)) * 16]; stepR = [-sw * 22, -Math.max(0, -Math.cos(p)) * 16];
      lift += -Math.abs(Math.sin(p)) * 7; armL = -sw * 0.45; armR = sw * 0.45; lean = 0.05; bob = 0;
    } else if (f.wave && !a) { armR = -1.2 + Math.sin(t * 10) * 0.25; }
    f.lift = lift;
    const breath = reduced ? 0 : Math.sin(t * 2.4 + ph + 1) * 0.012;
    const body = mul(mul(tr(0, lift), rotAbout(200, 382, lean)), scaleAbout(200, 382, 1 + squash + breath, 1 - squash - breath));
    const head = mul(body, mul(tr(0, bob * 0.6), rotAbout(200, 200, reduced ? 0 : Math.sin(t * 1.1 + ph) * 0.035)));
    const mArmL = mul(body, rotAbout(138, 240, armL)), mArmR = mul(body, rotAbout(262, 240, armR));
    for (const p of parts(f)) {
      let m = body;
      switch (p.group) {
        case "shadow": m = scaleAbout(200, 398, 1 + lift * 0.004, 1); break;
        case "footL": m = tr(stepL[0], stepL[1] + (f.walking ? 0 : lift * 0.85)); break;
        case "footR": m = tr(stepR[0], stepR[1] + (f.walking ? 0 : lift * 0.85)); break;
        case "armL": m = mArmL; break;
        case "flag": m = mul(mArmL, rotAbout(94, 182, reduced ? 0 : Math.sin(t * 4 + ph) * 0.06)); break;
        case "armR": m = mArmR; break;
        case "head": m = head; break;
        case "eyeL": case "eyeR": m = mul(head, scaleAbout(p.ec[0], p.ec[1], 1, f.blink * eyeY)); break;
      }
      // face the way we walk: mirror around the body's centre line
      f.mats[p.id] = f.flip === -1 ? mul(scaleAbout(200, 0, -1, 1), m) : m;
    }
  }
  function poseInst(i: Inst) {
    if (!i.model) return;
    if (POSE[i.kind]) POSE[i.kind](i);
    else if (SPECIES[i.kind].building) poseBuilding(i);
    else poseFolk(i);
  }

  // ---------- the world ----------
  // hidden until the first sync says a boss is there, which assembles it
  const boss = makeInst("beetle", { state: "gone" }), wasp = makeInst("wasp", { state: "gone" });
  const folk = Object.fromEntries(FOLK.map((k) => [k, makeInst(k)])) as Record<FolkClass, Inst>;
  let gnats: Inst[] = [];
  const sparks: Spark[] = [], flights: Flight[] = [];
  let slot: Rect = { left: 0, top: 0, width: 1, height: 1 }, pointer: Pt | null = null;
  let bossCenter: Pt = [0, 0], orbitR = 100, gnatS = 0.5, horizon = 0;
  const island = makeInst("island"), spider = makeInst("spider", { state: "gone" });
  const bld = Object.fromEntries(TOWN.map((b) => [b.id, makeInst(b.id, { stage: b.id === "homes" ? 3 : 0, stageShown: b.id === "homes" ? 3 : 0 })])) as Record<string, Inst>;
  let view: View = "raid", ts = 0.5, townX0 = 0, townY0 = 0, camX = 0, camV = 0, camMax = 0;
  const walkers = FOLK.map((k, i) => ({ k, x: 360 + i * 190, dir: i % 2 ? -1 : 1, speed: 34 + i * 5, until: 2 + i, walking: true }));
  let world: SceneWorld | null = null, first = true;
  let gnatShots = 0; // shots at gnats still in the air

  const inEllipses = (list: Ellipse[] | undefined, lx: number, ly: number) => (list ?? []).some(([cx, cy, rx, ry]) => ((lx - cx) / rx) ** 2 + ((ly - cy) / ry) ** 2 <= 1);

  function layout() {
    if (view === "town") layoutTown(); else layoutRaid();
  }
  function layoutTown() {
    const r = slot;
    ts = r.width >= 900 ? Math.min(r.height / 600, r.width / 1400) : Math.min(r.height / 600, r.width / 620);
    camMax = Math.max(0, (1400 * ts - r.width) / 2 + 12);
    camX = clamp(camX, -camMax, camMax);
    setModel(island, ts, false);
    for (const b of TOWN) setModel(bld[b.id], ts, false);
    setModel(spider, ts * 0.62, false);
    for (const k of FOLK) setModel(folk[k], ts * 0.28, false);
    placeTown();
    horizon = -1;
    buildBackground();
  }
  function placeTown() {
    const r = slot;
    townX0 = r.left + r.width / 2 - 700 * ts + camX;
    townY0 = r.top + (r.height - 600 * ts) / 2 - 110 * ts;
    const at = (inst: Inst, x: number, y: number) => { const a = SPECIES[inst.kind].anchor; inst.ox = townX0 + x * ts - a[0] * inst.s; inst.oy = townY0 + y * ts - a[1] * inst.s; };
    at(island, 700, 470);
    for (const b of TOWN) at(bld[b.id], b.x, b.y);
    const web = world?.web;
    if (web) { const b = TOWN.find((x) => x.id === web)!, box = SPECIES[web].box; at(spider, b.x, b.y - Math.min(300 - box[1], 260) * 0.45); }
    for (const w of walkers) at(folk[w.k], w.x, 520);
  }
  function layoutRaid() {
    const r = slot, bottom = r.top + r.height;
    const rowH = clamp(r.height * 0.3, 80, 200), gap = r.width / 4;
    const fs = Math.min(rowH / 400, gap / 300);
    FOLK.forEach((k, i) => { const f = folk[k]; setModel(f, fs, first); place(f, r.left + gap * (i + 0.5), bottom - 2); });
    const areaTop = r.top + 4, areaBottom = bottom - rowH * 0.8, areaH = Math.max(60, areaBottom - areaTop);
    const sp = SPECIES[boss.kind], [bx0, by0, bx1, by1] = sp.box, bw = bx1 - bx0, bh = by1 - by0;
    const bs = Math.min(r.width * 0.92 / bw, areaH / bh, 2.4);
    setModel(boss, bs, first);
    boss.ox = r.left + r.width / 2 - (bx0 + bw / 2) * bs; boss.oy = areaTop + areaH / 2 - (by0 + bh / 2) * bs;
    bossCenter = [boss.ox + sp.center![0] * bs, boss.oy + sp.center![1] * bs];
    gnatS = clamp(bs * 0.42, 0.28, 0.9);
    orbitR = Math.min(bw * 0.62 * bs, r.width / 2 - 50 * gnatS - 8);
    for (const g of gnats) setModel(g, gnatS, false);
    setModel(wasp, bs * 0.46, first);
    horizon = boss.oy + sp.anchor[1] * bs - 26 * bs;
    buildBackground();
  }
  function placeWasp() {
    // hover over the boss's top-left shoulder, but keep the whole wasp (sign included) in the slot
    const [wx0, wy0, wx1] = SPECIES.wasp.box, c = SPECIES.wasp.center!, sp = SPECIES[boss.kind];
    let x = boss.ox + sp.box[0] * boss.s + 40 * boss.s, y = boss.oy + sp.box[1] * boss.s + 10 * boss.s;
    x = clamp(x, slot.left + 8 + (c[0] - wx0) * wasp.s, slot.left + slot.width - 8 - (wx1 - c[0]) * wasp.s);
    y = Math.max(y, slot.top + 4 + (c[1] - wy0) * wasp.s);
    wasp.ox = x - c[0] * wasp.s; wasp.oy = y - c[1] * wasp.s;
  }
  function orbit(g: Inst) { const a = g.ang! + t * 0.55; place(g, bossCenter[0] + Math.cos(a) * orbitR, bossCenter[1] - 10 * boss.s + Math.sin(a) * orbitR * 0.42); }
  const aliveGnats = () => gnats.filter(shown);
  function syncGnats(n: number) {
    const live = aliveGnats();
    if (live.length > n) {
      // the server counted a hit whose shot is still flying: that gnat goes when it lands
      const extra = Math.max(0, live.length - n - gnatShots);
      live.slice(live.length - extra).forEach((g) => dissolve(g, 0));
      return;
    }
    if (live.length === n) return;
    if (live.length === 0) {
      // a new shield: spread evenly around the boss
      for (let i = 0; i < n; i++) { const g = makeInst("gnat", { ang: i / n * 6.283 }); setModel(g, gnatS, true); orbit(g); assemble(g, i * 0.12); gnats.push(g); }
      return;
    }
    for (let i = live.length; i < n; i++) { const g = makeInst("gnat", { ang: rnd() * 6.283 }); setModel(g, gnatS, true); orbit(g); assemble(g, 0); gnats.push(g); }
  }
  function aimPoint(side: 0 | 1): Pt {
    const aims = SPECIES[boss.kind].aim ?? [], [cx, cy, rx, ry] = aims[Math.min(side, aims.length - 1)] ?? [200, 170, 40, 40];
    const a = rnd() * 6.283, k = Math.sqrt(rnd()) * 0.8;
    return toScreen(boss, cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k);
  }
  function burst(x: number, y: number, ink: number, big: boolean) {
    const n = big ? 34 : 20;
    for (let i = 0; i < n; i++) { const a = rnd() * 6.283, s = 1.5 + rnd() * (big ? 5.5 : 4); sparks.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, r: 1.4 + rnd() * 1.6, ink, life: 0.5 + rnd() * 0.35, age: 0 }); }
    for (let i = 0; i < 18; i++) { const a = i / 18 * 6.283; sparks.push({ x, y, vx: Math.cos(a) * 3.4, vy: Math.sin(a) * 3.4, r: 1.3, ink: NIGHT, life: 0.32, age: 0 }); }
  }
  function upgradeFx(inst: Inst, from: number, to: number) {
    const [bx, by] = [inst.ox + SPECIES[inst.kind].anchor[0] * inst.s, inst.oy + SPECIES[inst.kind].anchor[1] * inst.s];
    for (const d of inst.dots) if (d.h! > from / 3 && d.h! <= to / 3 + 0.001) { d.x = bx + (rnd() - 0.5) * 140 * ts; d.y = by + 10 + rnd() * 30; d.vx = (rnd() - 0.5) * 2; d.vy = -rnd() * 3; }
    for (let i = 0; i < 26; i++) { const a = -rnd() * Math.PI; sparks.push({ x: bx + (rnd() - 0.5) * 80 * ts, y: by, vx: Math.cos(a) * 2.5, vy: Math.sin(a) * 2.5, r: 1.4 + rnd() * 1.4, ink: CORAL, life: 0.7, age: 0 }); }
    cheer();
  }
  function cheer(who?: FolkClass) {
    for (const k of who ? [who] : FOLK) folk[k].act = { type: "cheer", t0: t + (who ? 0 : FOLK.indexOf(k) * 0.12 + rnd() * 0.2), dur: who ? 1.2 : 2.2 };
  }

  // ---------- applying the server's world ----------
  function sync(next: SceneWorld) {
    const prev = world;
    world = next;
    if (next.view !== view) {
      view = next.view;
      if (view === "raid") for (const k of FOLK) Object.assign(folk[k], { act: null, walking: false, wave: false, flip: 1 });
      layout();
    }
    if (boss.kind !== next.boss.kind) {
      boss.kind = next.boss.kind; boss.model = null; boss.dots = []; boss.mats = [];
      if (view === "raid") layoutRaid();
      if (next.boss.alive) assemble(boss, 0.2); else hide(boss);
    } else if (next.boss.alive && !shown(boss)) assemble(boss, 0.2);
    else if (!next.boss.alive && shown(boss)) { dissolve(boss, prev ? 0.6 : 0); if (prev) cheer(); }
    syncGnats(next.boss.alive ? next.gnats : 0);
    if (next.wasp && next.boss.alive && !shown(wasp)) { placeWasp(); assemble(wasp, prev ? 0 : 0.6); }
    else if ((!next.wasp || !next.boss.alive) && shown(wasp)) dissolve(wasp, 0);
    for (const id of BUILDING_IDS) {
      const inst = bld[id], stage = next.town[id] ?? 0;
      if (prev && !first && stage > (inst.stage ?? 0) && view === "town") upgradeFx(inst, inst.stage ?? 0, stage);
      inst.stage = stage;
      if (!prev) inst.stageShown = stage;
    }
    if (next.web && !shown(spider)) { placeTown(); assemble(spider, 0.2); }
    else if (!next.web && shown(spider)) dissolve(spider, 0);
    if (first) {
      first = false;
      FOLK.forEach((k, i) => assemble(folk[k], 0.9 + i * 0.15));
    }
  }

  // ---------- attacks ----------
  function attack(type: AttackType, aimAt: "boss" | "gnat" | "wasp", side: 0 | 1 = 0): Shot {
    const hero = folk[ATTACK[type].hero];
    const flight: Flight = { from: [0, 0], to: [0, 0], t0: 0, dur: 0.42, ink: ATTACK[type].ink, target: aimAt, side, impact: null, landed: false };
    if (aimAt === "gnat") gnatShots++;
    hero.act = {
      type: "attack", t0: t, onFire: () => {
        const armR = parts(hero).findIndex((p) => p.group === "armR");
        const tip = apply(hero.mats[armR] ?? I, ...TIP[hero.kind as FolkClass]);
        flight.from = toScreen(hero, tip[0], tip[1]);
        const live = aliveGnats();
        if (aimAt === "gnat" && live.length) {
          const g = live.reduce((a, b) => (Math.hypot(a.ox - flight.from[0], a.oy - flight.from[1]) < Math.hypot(b.ox - flight.from[0], b.oy - flight.from[1]) ? a : b));
          flight.to = toScreen(g, 50, 55);
        } else if (aimAt === "wasp" && shown(wasp)) flight.to = toScreen(wasp, 306, 170);
        else flight.to = aimPoint(side);
        flight.t0 = t;
        flights.push(flight);
      },
    };
    return { resolve(impact) { flight.impact = impact; if (flight.landed) land(flight); } };
  }
  function land(f: Flight) {
    const impact = f.impact;
    if (!impact) return; // still waiting for the server; lands when it answers
    if (f.target === "gnat") gnatShots = Math.max(0, gnatShots - 1);
    const [px, py] = f.to;
    switch (impact.kind) {
      case "gnat": {
        burst(px, py, f.ink, false);
        const g = aliveGnats().sort((a, b) => Math.hypot(a.ox - px, a.oy - py) - Math.hypot(b.ox - px, b.oy - py))[0];
        // the hit gnat goes now; the next sync removes a second one a Shieldbreaker cleared
        if (g) { impulse(g, px, py, 60 * g.s, 5); dissolve(g, 0.05); }
        break;
      }
      case "wasp":
        if (impact.dodged) { wasp.flinchV += (rnd() < 0.5 ? -1 : 1) * 16; wasp.hopV -= 6; burst(px + 30, py - 10, NIGHT, false); }
        else { burst(px, py, f.ink, true); impulse(wasp, px, py, 70 * wasp.s * 2, 6); }
        break;
      case "echo":
        burst(px, py, f.ink, false); impulse(boss, px, py, 40 * boss.s, 3);
        break;
      case "boss": {
        burst(px, py, f.ink, impact.weak);
        impulse(boss, px, py, (impact.weak ? 72 : 56) * boss.s, (impact.weak ? 10 : 6.5) * Math.sqrt(boss.s) * (reduced ? 0.3 : 1));
        boss.flinchV += (px < bossCenter[0] ? 1 : -1) * (impact.weak ? 7 : 4) * boss.s; boss.hopV -= (impact.weak ? 3 : 1.6) * boss.s; boss.walk = 2.2;
        if (impact.weak) cheer("herald");
        break;
      }
      case "miss":
        for (let i = 0; i < 10; i++) sparks.push({ x: px, y: py, vx: (rnd() - 0.5) * 2, vy: -rnd() * 2, r: 1.2, ink: NIGHT, life: 0.4, age: 0 });
        break;
    }
  }

  // ---------- background: paper, a halftone meadow in stepped bands, crop marks, a halftone sun ----------
  let bgDots: [number, number, number, number, number][] = [];
  function buildBackground() {
    const out: typeof bgDots = [], rng = mulberry(7), add = (x: number, y: number, r: number, ink: number, a: number) => out.push([x, y, r, ink, a]);
    const screen = (ink: number, sp: number, test: (x: number, y: number) => number) => {
      const a = INKS[ink].a * Math.PI / 180, c = Math.cos(a), s = Math.sin(a), R = Math.hypot(W, H);
      for (let v = -R; v <= R; v += sp) for (let u = -R; u <= R; u += sp) {
        const x = W / 2 + u * c - v * s, y = H / 2 + u * s + v * c;
        if (x < -4 || x > W + 4 || y < -4 || y > H + 4) continue;
        const tone = test(x, y);
        if (tone > 0.05 && rng() > 0.04) add(x + (rng() - 0.5) * 0.6, y + (rng() - 0.5) * 0.6, sp * (0.12 + 0.46 * tone), ink, 1);
      }
    };
    const hill = (x: number) => horizon + Math.sin(x / W * Math.PI * 2 + 0.6) * 10 + Math.sin(x / W * Math.PI * 5) * 5;
    const band = (x: number, y: number) => { const h = hill(x); if (y < h) return -1; return Math.min(4, Math.floor((y - h) / Math.max(24, (H - h) / 5))); };
    if (horizon >= 0) {
      screen(LIME, 7, (x, y) => { const b = band(x, y); return b < 0 ? 0 : 0.16 + b * 0.07; });
      screen(NIGHT, 7, (x, y) => { const b = band(x, y); return b >= 3 ? 0.06 + (b - 3) * 0.05 : 0; });
    } else {
      const clouds = [[0.18, 0.2, 0.09], [0.55, 0.12, 0.07], [0.8, 0.32, 0.06], [0.35, 0.36, 0.05]].map(([u, v, k]) => [u * W, v * H, k * Math.max(W, H)]);
      screen(VIOLET, 7, (x, y) => { for (const [cx, cy, r] of clouds) { const d = Math.hypot((x - cx) / 1.8, y - cy) / r; if (d < 1) return d < 0.6 ? 0.1 : 0.06; } return 0; });
    }
    // light is ink: a sun made of stepped halftone rings
    const sx = W * 0.86, sy = Math.max(horizon - 150, H * 0.2), sr = clamp(Math.min(W, H) * 0.08, 34, 80);
    screen(CORAL, 6, (x, y) => { const d = Math.hypot(x - sx, y - sy) / sr; return d < 1 ? 0.5 : d < 1.35 ? 0.3 : d < 1.75 ? 0.16 : d < 2.2 ? 0.08 : 0; });
    // paper tooth: a faint, sparse dot field
    for (let i = 0; i < W * H / 900; i++) add(rng() * W, rng() * H, 0.5 + rng() * 0.5, NIGHT, 0.12);
    // crop marks and registration targets, printed in night ink
    const m = 10, L = 16;
    for (const [cx, cy, dx, dy] of [[m, m, 1, 1], [W - m, m, -1, 1], [m, H - m, 1, -1], [W - m, H - m, -1, -1]])
      for (let k = 0; k <= L; k += 1.6) { add(cx + dx * k, cy, 0.55, NIGHT, 0.5); add(cx, cy + dy * k, 0.55, NIGHT, 0.5); }
    for (const [cx, cy] of [[8, H / 2], [W - 8, H / 2]]) {
      for (let a = 0; a < 6.283; a += 0.35) add(cx + Math.cos(a) * 5, cy + Math.sin(a) * 5, 0.5, NIGHT, 0.5);
      for (let k = -8; k <= 8; k += 1.6) { add(cx + k, cy, 0.5, NIGHT, 0.5); add(cx, cy + k, 0.5, NIGHT, 0.5); }
    }
    bgDots = out;
    R.background();
  }

  // ---------- simulation ----------
  function step(dt: number) {
    t += dt;
    const s = dt * 60;
    if (boss.model) {
      if (pointer) { const lk = toScreen(boss, ...SPECIES[boss.kind].look!), dx = pointer[0] - lk[0], dy = pointer[1] - lk[1], d = Math.hypot(dx, dy) || 1, k = Math.min(1.7, d / (30 * boss.s)) / d; boss.look[0] += (dx * k - boss.look[0]) * Math.min(1, dt * 8); boss.look[1] += (dy * k - boss.look[1]) * Math.min(1, dt * 8); }
      else { boss.look[0] += (Math.cos(t * 0.6) * 1.5 - boss.look[0]) * dt * 3; boss.look[1] += (Math.sin(t * 0.9) * 0.8 - boss.look[1]) * dt * 3; }
    }
    boss.walk += ((boss.state === "dying" ? 3 : 0.5) - boss.walk) * Math.min(1, dt * 2);
    boss.morph += ((boss.state === "dying" || boss.state === "gone" ? 1 : 0) - boss.morph) * Math.min(1, dt * 5);
    if (view === "town") {
      if (!drag) { camX += camV * s; camV *= Math.pow(0.9, s); if (camX < -camMax || camX > camMax) { camX = clamp(camX, -camMax, camMax); camV = 0; } }
      for (const w of walkers) {
        const f = folk[w.k];
        if (t > w.until) {
          w.walking = !w.walking;
          w.until = t + (w.walking ? 3 + rnd() * 5 : 1.2 + rnd() * 2.2);
          if (w.walking && rnd() < 0.4) w.dir *= -1;
          f.wave = !w.walking && rnd() < 0.35;
        }
        f.walking = w.walking && !f.act;
        if (f.walking) {
          w.x += w.dir * w.speed * dt;
          if (w.x < 300 || w.x > 1120) { w.dir *= -1; w.x = clamp(w.x, 300, 1120); }
          f.stepT = (f.stepT || 0) + w.speed * dt / 58 * Math.PI * 2;
        }
        f.flip = w.dir;
      }
      for (const b of TOWN) { const inst = bld[b.id]; inst.stageShown! += (inst.stage! - inst.stageShown!) * Math.min(1, dt * 1.6); }
      placeTown();
    } else {
      for (const g of gnats) if (g.state !== "dying" && g.state !== "gone") orbit(g);
      if (shown(wasp)) placeWasp();
    }
    const all = view === "town" ? [island, ...TOWN.map((b) => bld[b.id]), spider, ...FOLK.map((k) => folk[k])] : [boss, wasp, ...FOLK.map((k) => folk[k]), ...gnats];
    for (const inst of all) {
      if (!inst.model) continue;
      inst.stateT += dt;
      inst.flinchV += -inst.flinch * 0.18 * s; inst.flinchV *= Math.pow(0.72, s); inst.flinch += inst.flinchV * s;
      inst.hopV += -inst.hop * 0.2 * s; inst.hopV *= Math.pow(0.7, s); inst.hop += inst.hopV * s;
      if (inst.state === "idle" && t > inst.blinkAt) { inst.blink = 0.12; if (t > inst.blinkAt + 0.13) { inst.blink = 1; inst.blinkAt = t + 2 + rnd() * 3; } }
      else if (inst.state !== "idle") inst.blink = 1;
      poseInst(inst);
      const kS = inst.state === "assemble" ? 0.07 : 0.16, damp = Math.pow(inst.state === "assemble" ? 0.84 : 0.74, s);
      let pending = 0, visible = 0;
      for (const d of inst.dots) {
        if (inst.state === "assemble" && inst.stateT < d.delay) { pending++; continue; }
        if (inst.state === "dying" && !d.free && inst.stateT > d.delay) { d.free = true; if (!reduced) { d.vx = 0.4 + rnd() * 2; d.vy = -(0.3 + rnd() * 1.6); } }
        if (d.free) {
          d.vx += Math.sin(t * 3 + d.ph) * 0.03 * s; d.vy -= 0.012 * s; d.x += d.vx * s; d.y += d.vy * s;
          d.a = Math.max(0, d.a - dt * (reduced ? 1.4 : 0.8)); if (d.a > 0) visible++;
          continue;
        }
        if (inst.state === "assemble") d.a = Math.min(1, d.a + dt * 4);
        const [tx, ty] = target(inst, d);
        d.vx += (tx - d.x) * kS * s; d.vy += (ty - d.y) * kS * s; d.vx *= damp; d.vy *= damp;
        d.x += d.vx * s; d.y += d.vy * s;
        d.flash = Math.max(0, d.flash - dt * 2.5);
        visible++;
      }
      if (inst.state === "assemble" && !pending && inst.stateT > 1) inst.state = "idle";
      if (inst.state === "dying" && inst.stateT > 1.2 && !visible) inst.state = "gone";
    }
    gnats = gnats.filter((g) => g.state !== "gone");
    for (let i = flights.length - 1; i >= 0; i--) {
      const f = flights[i];
      if (t - f.t0 >= f.dur) { flights.splice(i, 1); f.landed = true; land(f); }
    }
    for (let i = sparks.length - 1; i >= 0; i--) {
      const q = sparks[i]; q.age += dt;
      if (q.age > q.life) { sparks.splice(i, 1); continue; }
      q.vx *= Math.pow(0.9, s); q.vy *= Math.pow(0.9, s); q.x += q.vx * s; q.y += q.vy * s;
    }
  }

  // Everything drawn this frame, as [x, y, radius, ink, alpha, flash]. Linework boils: 3 seeded poses at 3 Hz.
  let frameDots = new Float32Array(0), frameN = 0;
  let segs: { start: number; mode: "paper" | "ink"; count: number }[] = [];
  function collect() {
    let n = 0;
    const drawList = view === "town" ? [island, ...TOWN.map((b) => bld[b.id]), ...FOLK.map((k) => folk[k]), spider] : [boss, wasp, ...gnats, ...FOLK.map((k) => folk[k])];
    for (const inst of drawList) n += inst.dots.length * 2; // ink dots plus knockout dots
    n += sparks.length + flights.length * 16;
    if (frameDots.length < n * 6) frameDots = new Float32Array(n * 6 + 6000);
    const f = reduced ? 0 : Math.floor(t * 3) % 3;
    let o = 0;
    const put = (x: number, y: number, r: number, ink: number, a: number, fl: number) => { frameDots[o++] = x; frameDots[o++] = y; frameDots[o++] = r; frameDots[o++] = ink; frameDots[o++] = a; frameDots[o++] = fl; };
    // back to front. Characters get a knockout first: paper cleared under their silhouette, so their inks
    // print clean over buildings and grass instead of mixing with them.
    segs = [];
    const mark = (mode: "paper" | "ink") => { const at = o / 6; if (!segs.length || segs[segs.length - 1].mode !== mode) segs.push({ start: at, mode, count: 0 }); };
    for (const inst of drawList) {
      if (!inst.model || inst.state === "gone") continue;
      const s = inst.s, building = inst.stage !== undefined, lvl = building ? inst.stageShown! / 3 : 0, ps = inst.model.parts;
      if (!building && inst !== island) {
        mark("paper");
        const kr = inst.model.sp * 0.62;
        for (const d of inst.dots) { const a = d.a * d.ba; if (a > 0.02 && !d.line && ps[d.p].kind === "fill") put(d.x, d.y, Math.max(d.r, kr) * 1.25 * s, KNOCK, Math.min(1, a * 1.2), 0); }
      }
      mark("ink");
      for (const d of inst.dots) {
        let a = d.a * d.ba;
        if (building) {
          // unbuilt parts show as a faint dotted blueprint; built stages fill in from the ground up
          const p = ps[d.p];
          if (p.stageMin && inst.stage! < p.stageMin) continue;
          const v = clamp((lvl - d.h!) * 14 + 0.6, 0, 1);
          a *= d.line ? Math.max(v, 0.13) : v;
        }
        if (a <= 0.01) continue;
        const reg = INKS[d.ink].reg, bj = d.line ? 1 : 0.4;
        put(d.x + d.boil[f * 2] * bj + reg[0], d.y + d.boil[f * 2 + 1] * bj + reg[1], d.r * s, d.ink, a, d.flash > 0.3 ? 1 : 0);
      }
    }
    for (const sh of flights) {
      const k = clamp((t - sh.t0) / sh.dur, 0, 1), cx = (sh.from[0] + sh.to[0]) / 2, cy = Math.min(sh.from[1], sh.to[1]) - 60;
      for (let i = 0; i < 16; i++) {
        const u = clamp(k - i * 0.025, 0, 1), v = 1 - u;
        const x = v * v * sh.from[0] + 2 * v * u * cx + u * u * sh.to[0], y = v * v * sh.from[1] + 2 * v * u * cy + u * u * sh.to[1];
        put(x, y, 4.2 - i * 0.22, i % 4 === 3 ? NIGHT : sh.ink, 1 - i / 18, 0);
      }
    }
    mark("ink");
    for (const q of sparks) put(q.x, q.y, q.r, q.ink, Math.max(0, 1 - q.age / q.life), 0);
    frameN = o / 6;
    segs.forEach((g, i) => { g.count = (i + 1 < segs.length ? segs[i + 1].start : frameN) - g.start; });
  }

  // ---------- renderers: WebGL first, Canvas 2D fallback; both multiply ink onto paper ----------
  const cvGL = document.createElement("canvas"), cv2 = document.createElement("canvas");
  for (const cv of [cvGL, cv2]) {
    cv.style.cssText = "position:absolute;inset:0;width:100%;height:100%;touch-action:none;display:block";
    cv.setAttribute("aria-hidden", "true");
    host.appendChild(cv);
  }
  let dpr = 1;
  interface Renderer { init(): boolean; resize(w: number, h: number): void; background(): void; draw(): void }
  const gl = (() => {
    const o = { alpha: false, antialias: false, premultipliedAlpha: false };
    return (cvGL.getContext("webgl", o) || cvGL.getContext("experimental-webgl", o)) as WebGLRenderingContext | null;
  })();
  let glState: { prog: WebGLProgram; loc: Record<string, any>; bgBuf: WebGLBuffer; buf: WebGLBuffer; bgN: number; data: Float32Array } | null = null;
  const RGL: Renderer = {
    init() {
      if (!gl || gl.isContextLost()) return false;
      const sh = (type: number, src: string) => { const o = gl.createShader(type)!; gl.shaderSource(o, src); gl.compileShader(o); return o; };
      const prog = gl.createProgram()!;
      gl.attachShader(prog, sh(gl.VERTEX_SHADER, `
        attribute vec2 aPos; attribute float aSize; attribute vec4 aCol;
        uniform vec2 uRes; uniform float uDpr; uniform float uMaxPt;
        varying vec4 vCol; varying float vPx;
        void main() {
          vec2 p = aPos * uDpr;
          gl_Position = vec4(p.x / uRes.x * 2.0 - 1.0, 1.0 - p.y / uRes.y * 2.0, 0.0, 1.0);
          vPx = min(max(aSize * uDpr, 1.0), uMaxPt - 1.0);
          gl_PointSize = vPx + 1.0;
          vCol = aCol;
        }`));
      gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, `
        precision mediump float;
        varying vec4 vCol; varying float vPx;
        void main() {
          float l = length(gl_PointCoord * 2.0 - 1.0) * (vPx + 1.0) / vPx;
          float a = vCol.a * (1.0 - smoothstep(1.0 - 1.5 / vPx, 1.0, l));
          if (a <= 0.003) discard;
          gl_FragColor = vec4(vCol.rgb * a, a);
        }`));
      gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return false;
      gl.useProgram(prog);
      const loc = { aPos: gl.getAttribLocation(prog, "aPos"), aSize: gl.getAttribLocation(prog, "aSize"), aCol: gl.getAttribLocation(prog, "aCol"), uRes: gl.getUniformLocation(prog, "uRes"), uDpr: gl.getUniformLocation(prog, "uDpr") };
      gl.uniform1f(gl.getUniformLocation(prog, "uMaxPt"), gl.getParameter(gl.ALIASED_POINT_SIZE_RANGE)[1]);
      glState = { prog, loc, bgBuf: gl.createBuffer()!, buf: gl.createBuffer()!, bgN: 0, data: new Float32Array(0) };
      gl.enable(gl.BLEND);
      return true;
    },
    resize(w, h) { cvGL.width = w; cvGL.height = h; gl!.viewport(0, 0, w, h); },
    background() {
      if (!gl || !glState) return;
      gl.bindBuffer(gl.ARRAY_BUFFER, glState.bgBuf);
      gl.bufferData(gl.ARRAY_BUFFER, pack(bgDots.length, (i) => [...bgDots[i], 0]), gl.STATIC_DRAW);
      glState.bgN = bgDots.length;
    },
    draw() {
      if (!gl || !glState) return;
      const p = hex(PAPER), st = glState, L = st.loc;
      gl.clearColor(p[0], p[1], p[2], 1); gl.clear(gl.COLOR_BUFFER_BIT);
      gl.uniform2f(L.uRes, cvGL.width, cvGL.height); gl.uniform1f(L.uDpr, dpr);
      const bind = (b: WebGLBuffer) => {
        const F = 28;
        gl.bindBuffer(gl.ARRAY_BUFFER, b);
        gl.enableVertexAttribArray(L.aPos); gl.vertexAttribPointer(L.aPos, 2, gl.FLOAT, false, F, 0);
        gl.enableVertexAttribArray(L.aSize); gl.vertexAttribPointer(L.aSize, 1, gl.FLOAT, false, F, 8);
        gl.enableVertexAttribArray(L.aCol); gl.vertexAttribPointer(L.aCol, 4, gl.FLOAT, false, F, 12);
      };
      gl.blendFunc(gl.DST_COLOR, gl.ONE_MINUS_SRC_ALPHA); // multiply: overlapping inks darken
      bind(st.bgBuf); gl.drawArrays(gl.POINTS, 0, st.bgN);
      const Fd = frameDots;
      const data = pack(frameN, (i) => { const k = i * 6; return [Fd[k], Fd[k + 1], Fd[k + 2], Fd[k + 3], Fd[k + 4], Fd[k + 5]]; });
      bind(st.buf); gl.bufferData(gl.ARRAY_BUFFER, data, gl.STREAM_DRAW);
      for (const g of segs) {
        if (!g.count) continue;
        if (g.mode === "paper") gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA); else gl.blendFunc(gl.DST_COLOR, gl.ONE_MINUS_SRC_ALPHA);
        gl.drawArrays(gl.POINTS, g.start, g.count);
      }
    },
  };
  function pack(n: number, get: (i: number) => number[]) {
    const st = glState!;
    if (st.data.length < n * 7) st.data = new Float32Array(n * 7 + 7000);
    const D = st.data;
    let o = 0;
    for (let i = 0; i < n; i++) {
      const [x, y, r, ink, a, fl] = get(i), c = fl ? INKS[ink].flash : INKS[ink].rgb;
      D[o++] = x; D[o++] = y; D[o++] = r * 2; D[o++] = c[0]; D[o++] = c[1]; D[o++] = c[2]; D[o++] = a;
    }
    return D.subarray(0, o);
  }
  let ctx: CanvasRenderingContext2D | null = null, bgCanvas: HTMLCanvasElement | null = null;
  const sprites = new Map<number, HTMLCanvasElement>();
  const sprite = (ink: number, fl: number) => {
    const key = ink * 2 + fl;
    let c = sprites.get(key);
    if (!c) {
      c = document.createElement("canvas"); c.width = c.height = 32;
      const g = c.getContext("2d")!, rgb = fl ? INKS[ink].flash : INKS[ink].rgb;
      g.fillStyle = `rgb(${rgb.map((v) => Math.round(v * 255))})`; g.beginPath(); g.arc(16, 16, 15.5, 0, 6.283); g.fill();
      sprites.set(key, c);
    }
    return c;
  };
  const R2D: Renderer = {
    init() { ctx = cv2.getContext("2d"); return !!ctx; },
    resize(w, h) { cv2.width = w; cv2.height = h; this.background(); },
    background() {
      if (!ctx || !cv2.width) return;
      const bg = bgCanvas || (bgCanvas = document.createElement("canvas"));
      bg.width = cv2.width; bg.height = cv2.height;
      const g = bg.getContext("2d")!;
      g.fillStyle = PAPER; g.fillRect(0, 0, bg.width, bg.height); g.globalCompositeOperation = "multiply";
      for (const [x, y, r, ink, a] of bgDots) { g.globalAlpha = a; g.drawImage(sprite(ink, 0), (x - r) * dpr, (y - r) * dpr, r * 2 * dpr, r * 2 * dpr); }
    },
    draw() {
      if (!ctx) return;
      const c = ctx, F = frameDots;
      c.setTransform(1, 0, 0, 1, 0, 0); c.globalAlpha = 1; c.globalCompositeOperation = "source-over";
      if (bgCanvas) c.drawImage(bgCanvas, 0, 0);
      c.globalCompositeOperation = "multiply"; c.setTransform(dpr, 0, 0, dpr, 0, 0);
      let lastA = -1, knock = false;
      for (let i = 0; i < frameN; i++) {
        const k = i * 6, r = F[k + 2], a = F[k + 4], isK = F[k + 3] === KNOCK;
        if (isK !== knock) { knock = isK; c.globalCompositeOperation = isK ? "source-over" : "multiply"; }
        if (a !== lastA) { c.globalAlpha = a; lastA = a; }
        c.drawImage(sprite(F[k + 3], F[k + 5]), F[k] - r, F[k + 1] - r, r * 2, r * 2);
      }
    },
  };
  let R: Renderer = RGL, which: "webgl" | "2d" = "webgl";
  function useRenderer(want: "webgl" | "2d") {
    if (want === "webgl" && (glState || RGL.init())) { R = RGL; which = "webgl"; }
    else { if (!ctx) R2D.init(); R = R2D; which = "2d"; }
    cvGL.style.visibility = R === RGL ? "visible" : "hidden"; cv2.style.visibility = R === R2D ? "visible" : "hidden";
    resize();
  }
  const onLost = (e: Event) => { e.preventDefault(); glState = null; useRenderer("2d"); };
  const onRestored = () => useRenderer("webgl");
  cvGL.addEventListener("webglcontextlost", onLost);
  cvGL.addEventListener("webglcontextrestored", onRestored);
  function resize() {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    W = Math.max(1, host.clientWidth); H = Math.max(1, host.clientHeight);
    R.resize(Math.round(W * dpr), Math.round(H * dpr));
    layout();
  }

  // ---------- input ----------
  const local = (e: PointerEvent): Pt => { const b = host.getBoundingClientRect(); return [e.clientX - b.left, e.clientY - b.top]; };
  let drag: { x: number; cam: number; moved: number; lastX: number; lastT: number } | null = null;
  const onMove = (e: PointerEvent) => {
    pointer = local(e);
    if (drag && view === "town") {
      const now = performance.now(), dx = pointer[0] - drag.x;
      drag.moved = Math.max(drag.moved, Math.abs(dx));
      camX = clamp(drag.cam + dx, -camMax, camMax);
      camV = (pointer[0] - drag.lastX) / Math.max(1, now - drag.lastT) * 16; drag.lastX = pointer[0]; drag.lastT = now;
    }
  };
  const onUp = (e: PointerEvent) => {
    if (!drag || view !== "town") return;
    const moved = drag.moved; drag = null;
    if (moved > 8) return;
    camV = 0;
    const [x, y] = local(e);
    // front buildings win ties: test back to front and keep the last hit
    let hit: (typeof TOWN)[number] | null = null;
    for (const b of TOWN) { const inst = bld[b.id], [x0, y0, x1, y1] = SPECIES[b.id].box, lx = (x - inst.ox) / inst.s, ly = (y - inst.oy) / inst.s; if (lx >= x0 && lx <= x1 && ly >= y0 && ly <= y1) hit = b; }
    if (hit) opts.onTap?.({ kind: "building", id: hit.id });
  };
  const onDown = (e: PointerEvent) => {
    const [x, y] = pointer = local(e);
    if (view === "town") { drag = { x, cam: camX, moved: 0, lastX: x, lastT: performance.now() }; camV = 0; try { (e.target as Element).setPointerCapture(e.pointerId); } catch { /* not capturable */ } return; }
    if (aliveGnats().some((g) => Math.hypot(x - (g.ox + 50 * g.s), y - (g.oy + 55 * g.s)) < 40 * g.s + 12)) return opts.onTap?.({ kind: "gnat" });
    if (shown(wasp) && inEllipses(SPECIES.wasp.hit, (x - wasp.ox) / wasp.s, (y - wasp.oy) / wasp.s)) return opts.onTap?.({ kind: "wasp" });
    if (shown(boss) && inEllipses(SPECIES[boss.kind].hit, (x - boss.ox) / boss.s, (y - boss.oy) / boss.s)) opts.onTap?.({ kind: "boss", side: x < bossCenter[0] ? 0 : 1 });
  };
  const onCancel = () => { drag = null; };
  const onLeave = () => { pointer = null; };
  for (const cv of [cvGL, cv2]) {
    cv.addEventListener("pointermove", onMove);
    cv.addEventListener("pointerup", onUp);
    cv.addEventListener("pointercancel", onCancel);
    cv.addEventListener("pointerleave", onLeave);
    cv.addEventListener("pointerdown", onDown);
  }
  const ro = typeof ResizeObserver === "function" ? new ResizeObserver(() => resize()) : null;
  ro?.observe(host);

  // ---------- loop ----------
  let last = performance.now(), raf = 0, alive = true;
  function frame(now: number) {
    if (!alive) return;
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (world) { step(dt); collect(); R.draw(); }
    raf = requestAnimationFrame(frame);
  }
  const onVisible = () => { last = performance.now(); };
  document.addEventListener("visibilitychange", onVisible);
  useRenderer("webgl");
  raf = requestAnimationFrame(frame);

  return {
    setSlot(rect) {
      if (rect.left === slot.left && rect.top === slot.top && rect.width === slot.width && rect.height === slot.height) return;
      slot = rect;
      layout();
    },
    sync,
    attack,
    cheer,
    get renderer() { return which; },
    destroy() {
      alive = false;
      cancelAnimationFrame(raf);
      ro?.disconnect();
      document.removeEventListener("visibilitychange", onVisible);
      cvGL.removeEventListener("webglcontextlost", onLost);
      cvGL.removeEventListener("webglcontextrestored", onRestored);
      // give the GPU context back now rather than at garbage collection
      gl?.getExtension("WEBGL_lose_context")?.loseContext();
      cvGL.remove(); cv2.remove();
    },
  };
}
