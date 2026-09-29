// The print look: four spot inks (night, violet, lime, coral) plus paper for
// knockouts. Every shape becomes halftone dots per ink, dot size is tone,
// later fills knock out earlier dots, and linework is tapered dots.

export type Pt = [number, number];
export type Mat = [number, number, number, number, number, number];
export interface Ink { c: string; a: number; reg: Pt; rgb: number[]; flash: number[] }

export function mulberry(a: number) {
  return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
export const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
export const ease = (k: number) => k * k * (3 - 2 * k);

export const PAPER = "#F5F0E6";
export const hex = (h: string) => { const n = parseInt(h.slice(1), 16); return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255]; };
export const INKS: Ink[] = [
  { c: "#2B2336", a: 45, reg: [0, 0] },      // night
  { c: "#7A4BB4", a: 15, reg: [0.9, -0.6] }, // violet
  { c: "#A6D23A", a: 75, reg: [-0.7, 0.6] }, // lime
  { c: "#EF7B5C", a: 105, reg: [0.6, 0.8] }, // coral
  { c: PAPER, a: 0, reg: [0, 0] },            // paper, for knockouts
].map((k) => { const rgb = hex(k.c); return { ...k, reg: k.reg as Pt, rgb, flash: rgb.map((v) => v + (1 - v) * 0.65) }; });
export const NIGHT = 0, VIOLET = 1, LIME = 2, CORAL = 3, KNOCK = 4;

// Design colours and how each prints: a list of [ink, tone] layers. Darker mixes come from overprint.
export const COL = { ink: "#2B2336", dark: "#15101C", pur: "#7A4BB4", head: "#583089", lime: "#A6D23A", white: "#FFFFFF", ghost: "#8E83A3", wing: "#E6DFF0",
  skin: "#FFE9C9", leaf: "#7FB069", plum: "#3B3046", blue: "#4D64B3", teal: "#1F8E7C", orange: "#D2702A", rose: "#BD4F7A", cream: "#FFF8EA",
  steel: "#9A95A3", steelD: "#7E7988", steelL: "#B4AFBD", gold: "#E7B84A", goldD: "#C99A2E", tan: "#C9A36B", brown: "#8C5E3E", cheek: "#F2A7A0", lens: "#BFE6DE" };
export const PRINT: Record<string, [number, number][]> = {
  [COL.ink]: [[NIGHT, 1]], [COL.dark]: [[NIGHT, 1]], [COL.white]: [],
  [COL.pur]: [[VIOLET, 0.6]], [COL.head]: [[VIOLET, 0.72], [NIGHT, 0.22]], [COL.lime]: [[LIME, 0.62]],
  [COL.ghost]: [[VIOLET, 0.3]], [COL.wing]: [[VIOLET, 0.16]],
  [COL.skin]: [[CORAL, 0.2]], [COL.leaf]: [[LIME, 0.75], [NIGHT, 0.1]], [COL.plum]: [[NIGHT, 0.7], [VIOLET, 0.3]],
  [COL.blue]: [[VIOLET, 0.62], [NIGHT, 0.28]], [COL.teal]: [[LIME, 0.62], [NIGHT, 0.36]], [COL.orange]: [[CORAL, 0.82], [LIME, 0.2]], [COL.rose]: [[CORAL, 0.62], [VIOLET, 0.4]],
  [COL.cream]: [[CORAL, 0.07]], [COL.steel]: [[NIGHT, 0.3], [VIOLET, 0.12]], [COL.steelD]: [[NIGHT, 0.45], [VIOLET, 0.15]], [COL.steelL]: [[NIGHT, 0.18], [VIOLET, 0.08]],
  [COL.gold]: [[CORAL, 0.3], [LIME, 0.55]], [COL.goldD]: [[CORAL, 0.4], [LIME, 0.6], [NIGHT, 0.08]], [COL.tan]: [[CORAL, 0.32], [LIME, 0.3], [NIGHT, 0.08]],
  [COL.brown]: [[CORAL, 0.5], [NIGHT, 0.4]], [COL.cheek]: [[CORAL, 0.45]], [COL.lens]: [[LIME, 0.28]],
  "#E9D8BC": [[CORAL, 0.24], [LIME, 0.16], [NIGHT, 0.05]],
  "#F7E3B5": [[CORAL, 0.14], [LIME, 0.18]], "#BFD0F0": [[VIOLET, 0.18]], "#B07B53": [[CORAL, 0.45], [NIGHT, 0.25], [LIME, 0.15]],
  "#86B86E": [[LIME, 0.7], [NIGHT, 0.12]], "#6FA35C": [[LIME, 0.8], [NIGHT, 0.22]], "#FBE3D2": [[CORAL, 0.1]], "#F6C7B0": [[CORAL, 0.2]], "#F2A98A": [[CORAL, 0.32]],
  "#C4E57A": [[LIME, 0.4]], "#EAF5C8": [[LIME, 0.12]], "#DDF0A8": [[LIME, 0.2]], "#D0EA92": [[LIME, 0.3]], "#8B5CC6": [[VIOLET, 0.45]],
};

// ---------- geometry ----------
export function ellipse(cx: number, cy: number, rx: number, ry: number, rot = 0, n = 72): Pt[] {
  const c = Math.cos(rot * Math.PI / 180), s = Math.sin(rot * Math.PI / 180), pts: Pt[] = [];
  for (let i = 0; i < n; i++) { const t = 2 * Math.PI * i / n, x = rx * Math.cos(t), y = ry * Math.sin(t); pts.push([cx + x * c - y * s, cy + x * s + y * c]); }
  return pts;
}
export const circle = (cx: number, cy: number, r: number) => ellipse(cx, cy, r, r);
export function rotate(pts: Pt[], cx: number, cy: number, deg: number): Pt[] {
  const c = Math.cos(deg * Math.PI / 180), s = Math.sin(deg * Math.PI / 180);
  return pts.map(([x, y]) => [cx + (x - cx) * c - (y - cy) * s, cy + (x - cx) * s + (y - cy) * c]);
}
export function rrect(x: number, y: number, w: number, h: number, r: number, rot = 0): Pt[] {
  const pts: Pt[] = [];
  for (const [cx, cy, a0] of [[x + w - r, y + r, -90], [x + w - r, y + h - r, 0], [x + r, y + h - r, 90], [x + r, y + r, 180]])
    for (let i = 0; i <= 6; i++) { const a = (a0 + 90 * i / 6) * Math.PI / 180; pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]); }
  return rot ? rotate(pts, x + w / 2, y + h / 2, rot) : pts;
}
/// A small SVG path subset (M, L, Q, Z; absolute) as points.
export function path(d: string, steps = 14): Pt[] {
  const tk = d.match(/[MLQZ]|-?\d*\.?\d+/g) ?? [], pts: Pt[] = [];
  let i = 0, cur: Pt = [0, 0], cmd: string | null = null;
  const num = () => parseFloat(tk[i++]);
  while (i < tk.length) {
    if (/[MLQZ]/.test(tk[i])) { cmd = tk[i++]; if (cmd === "Z") continue; }
    if (cmd === "M" || cmd === "L") { cur = [num(), num()]; pts.push(cur); }
    else if (cmd === "Q") {
      const c: Pt = [num(), num()], e: Pt = [num(), num()];
      for (let k = 1; k <= steps; k++) { const s = k / steps, u = 1 - s; pts.push([u * u * cur[0] + 2 * u * s * c[0] + s * s * e[0], u * u * cur[1] + 2 * u * s * c[1] + s * s * e[1]]); }
      cur = e;
    } else i++;
  }
  return pts;
}
export function pip(x: number, y: number, poly: Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0], yi = poly[i][1], xj = poly[j][0], yj = poly[j][1];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi + 1e-12) + xi) inside = !inside;
  }
  return inside;
}
function resample(pts: Pt[], step: number, closed: boolean): Pt[] {
  const src = closed ? [...pts, pts[0]] : pts, out: Pt[] = [[src[0][0], src[0][1]]];
  let carry = 0;
  for (let i = 1; i < src.length; i++) {
    const [x0, y0] = src[i - 1], [x1, y1] = src[i], len = Math.hypot(x1 - x0, y1 - y0);
    let d = step - carry;
    while (d <= len) { const t = d / len; out.push([x0 + (x1 - x0) * t, y0 + (y1 - y0) * t]); d += step; }
    carry = len - (d - step);
  }
  return out;
}
const bbox = (poly: Pt[]): [number, number, number, number] => { let a = 1e9, b = 1e9, c = -1e9, d = -1e9; for (const [x, y] of poly) { a = Math.min(a, x); b = Math.min(b, y); c = Math.max(c, x); d = Math.max(d, y); } return [a, b, c, d]; };
/// Keep the part of a polygon on the positive side of a*x + b*y + c = 0.
export function clipHalf(poly: Pt[], a: number, b: number, c: number): Pt[] {
  const out: Pt[] = [], f = ([x, y]: Pt) => a * x + b * y + c;
  poly.forEach((p, i) => {
    const q = poly[(i + 1) % poly.length], fp = f(p), fq = f(q);
    if (fp >= 0) out.push(p);
    if ((fp >= 0) !== (fq >= 0)) { const k = fp / (fp - fq); out.push([p[0] + (q[0] - p[0]) * k, p[1] + (q[1] - p[1]) * k]); }
  });
  return out;
}

// ---------- shape data -> print dots ----------

/// One named part of a model, in paint order. `kind` decides how it prints.
export interface Part {
  id: number;
  name: string;
  kind: "fill" | "line" | "ring" | "shadow";
  group?: string;
  poly?: Pt[];
  pts?: Pt[];
  color?: string;
  bb?: [number, number, number, number];
  // everything else is per-kind or per-pose data (pivot, eye, stageMin, ...)
  [key: string]: any;
}

export interface Dot {
  p: number; hx: number; hy: number; r: number; ink: number; ph: number; boil: number[];
  u?: number; ba?: number; line?: boolean; outline?: boolean; h?: number; knock?: boolean;
  ax?: number; ay?: number; spiral?: boolean;
}

function shadeLevel(p: Part, x: number, y: number) {
  const [x0, y0, x1, y1] = p.bb!, rx = (x1 - x0) / 2, ry = (y1 - y0) / 2;
  const nx = (x - (x0 + x1) / 2) / rx, ny = (y - (y0 + y1) / 2) / ry, d2 = Math.min(nx * nx + ny * ny, 0.999), nz = Math.sqrt(1 - d2);
  return (1 - (nx * -0.52 + ny * -0.62 + nz * 0.59)) / 2; // 0 lit (top left) .. 1 shadow
}

/// Turns parts into dots: halftone screens per ink (dot size = tone), later
/// fills knock out earlier dots, tapered linework, about 5% ink dropout.
/// With `cover`, a fill's first screen leaves an ink-less paper dot wherever it
/// prints no ink, so pale fills (skin, cream, white) still knock out what is
/// behind them; the paper dots move with the fill like any other dot.
export function buildModel(parts: Part[], sp: number, seed: number, cover = false): Dot[] {
  const rng = mulberry(seed), dots: Dot[] = [];
  const g = clamp(Math.pow(sp / 4, 0.6), 0.7, 2.6); // lines stay readable on small sprites
  for (const p of parts) if (p.poly) p.bb = bbox(p.poly);
  const fills = parts.filter((p) => p.kind === "fill");
  // `sameGroup`: only count later fills that move with this part (an eye or arm does not)
  const hiddenBy = (p: Part, x: number, y: number, sameGroup = false) => {
    for (const f of fills) {
      if (f.id <= p.id || (sameGroup && f.group !== p.group)) continue;
      const b = f.bb!;
      if (x < b[0] || x > b[2] || y < b[1] || y > b[3]) continue;
      if (pip(x, y, f.poly!)) return true;
    }
    return false;
  };
  const push = (p: Part, x: number, y: number, r: number, ink: number, extra?: Partial<Dot>) =>
    dots.push({ p: p.id, hx: x, hy: y, r, ink, ph: rng() * 6.283, boil: [rng(), rng(), rng(), rng(), rng(), rng()].map((v) => (v - 0.5) * 1.1), ...extra });
  const screen = (p: Part, spp: number, ink: number, toneAt: (x: number, y: number) => number, paper = false) => {
    const a = INKS[ink].a * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
    const [x0, y0, x1, y1] = p.bb!, cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, R = Math.hypot(x1 - x0, y1 - y0) / 2 + spp;
    for (let v = -R; v <= R; v += spp) for (let u = -R; u <= R; u += spp) {
      const x = cx + u * c - v * s, y = cy + u * s + v * c;
      if (x < x0 || x > x1 || y < y0 || y > y1 || !pip(x, y, p.poly!)) continue;
      // under a part that moves on its own (a blinking eye, a swinging arm) keep the paper
      if (hiddenBy(p, x, y)) { if (paper && !hiddenBy(p, x, y, true)) push(p, x, y, spp * 0.12, ink, { knock: true }); continue; }
      const tone = toneAt(x, y);
      if (tone < 0.06 || (tone < 0.95 && rng() < 0.05)) { if (paper) push(p, x, y, spp * 0.12, ink, { knock: true }); continue; } // ink dropout
      const j = spp * 0.08;
      push(p, x + (rng() - 0.5) * j, y + (rng() - 0.5) * j, spp * (0.12 + 0.46 * Math.min(1, tone)), ink);
    }
  };
  for (const p of parts) {
    if (p.kind === "ring") {
      const n = Math.round(2 * Math.PI * Math.sqrt((p.rx * p.rx + p.ry * p.ry) / 2) / 7);
      for (let i = 0; i < n; i++) push(p, p.cx, p.cy, 1.5 * g, VIOLET, { u: i / n * 6.283, ba: 0.55 });
    } else if (p.kind === "shadow") {
      const spp = sp * 1.1, a = Math.PI / 4, c = Math.cos(a), s = Math.sin(a);
      for (let v = -p.rx; v <= p.rx; v += spp) for (let u = -p.rx; u <= p.rx; u += spp) {
        const x = p.cx + u * c - v * s, y = p.cy + u * s + v * c, q = ((x - p.cx) / p.rx) ** 2 + ((y - p.cy) / p.ry) ** 2;
        const tone = (1 - q) * 0.45;
        if (q < 1 && tone > 0.06) push(p, x, y, spp * (0.12 + 0.46 * tone), NIGHT, { ba: 0.6 });
      }
    } else if (p.kind === "line") {
      const ink = (PRINT[p.color!] || [[NIGHT, 1]])[0][0], w = p.w * g;
      const rows = Math.max(1, Math.round(w / (sp * 0.9))), r0 = w * 0.42 / Math.sqrt(rows) * (rows > 1 ? 0.9 : 1);
      const pts = resample(p.pts!, Math.max(0.8, r0 * 1.25), !!p.closed);
      pts.forEach(([x, y], i) => {
        const [ax, ay] = pts[Math.min(i + 1, pts.length - 1)], [bx, by] = pts[Math.max(i - 1, 0)];
        const len = Math.hypot(ax - bx, ay - by) || 1, nx = -(ay - by) / len, ny = (ax - bx) / len;
        const u = pts.length > 1 ? i / (pts.length - 1) : 0, r = r0 * (1 - (p.taper || 0) * u) * (0.9 + 0.2 * Math.sin(i * 0.4 + p.id));
        for (let k = 0; k < rows; k++) {
          const o = rows > 1 ? (k / (rows - 1) - 0.5) * w * 0.6 : 0, qx = x + nx * o, qy = y + ny * o;
          if (!hiddenBy(p, qx, qy)) push(p, qx, qy, r, ink, { line: true });
        }
      });
    } else if (p.kind === "fill") {
      const spp = sp * Math.max(0.45, p.fine || 1), layers = PRINT[p.color!] || [[NIGHT, 0.5]];
      const n0 = dots.length;
      layers.forEach(([ink, tone], li) => screen(p, spp, ink, (x, y) => tone + (li === 0 && p.shade ? (shadeLevel(p, x, y) - 0.5) * 0.5 * p.shade : 0), cover && li === 0));
      if (cover && !layers.length) screen(p, spp, NIGHT, () => 0, true);
      if (cover && dots.length === n0) {
        // too small to catch a screen point: one paper dot over its whole box
        const [x0, y0, x1, y1] = p.bb!;
        push(p, (x0 + x1) / 2, (y0 + y1) / 2, Math.hypot(x1 - x0, y1 - y0) / 2 / 1.25, NIGHT, { knock: true });
      }
      if (p.shade && layers.length) screen(p, spp, NIGHT, (x, y) => Math.max(0, shadeLevel(p, x, y) - 0.55) * 0.9 * p.shade);
      const sw = (p.sw ?? 3.2) * g;
      if (sw > 0) {
        const r0 = Math.max(0.5, sw * 0.42), pts = resample(p.poly!, Math.max(0.8, r0 * 1.2), true);
        pts.forEach(([x, y], i) => { if (!hiddenBy(p, x, y)) push(p, x, y, r0 * (0.85 + 0.3 * Math.sin(i * 0.35 + p.id)), NIGHT, { line: true, outline: true }); });
      }
    }
  }
  return dots;
}

/// Boss defeat face: each eye's outline and pupil dots rearrange into a spiral.
export function addSpirals(parts: Part[], dots: Dot[]) {
  for (const white of parts.filter((p) => p.eye === "white")) {
    const [ex, ey] = white.ec as Pt, key = white.eyeKey, side = white.side;
    const set = dots.filter((d) => { const p = parts[d.p]; return !d.knock && p.eyeKey === key && (p.eye === "pupil" || (p === white && d.outline)); });
    const n = set.length;
    set.sort((a, b) => Math.atan2(a.hy - ey, a.hx - ex) - Math.atan2(b.hy - ey, b.hx - ex));
    set.forEach((d, k) => { const u = n > 1 ? k / (n - 1) : 0, ang = side * u * 4.2 * Math.PI, r = 0.5 + u * (white.r - 1); d.ax = ex + Math.cos(ang) * r; d.ay = ey + Math.sin(ang) * r; d.spiral = true; d.ink = NIGHT; d.r = Math.min(d.r, 1.2); });
  }
}

// ---------- 2D affine: [a, b, c, d, e, f] ----------
export const I: Mat = [1, 0, 0, 1, 0, 0];
export const mul = (m: Mat, n: Mat): Mat => [m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1], m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3], m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5]];
export const tr = (x: number, y: number): Mat => [1, 0, 0, 1, x, y];
export const rotAbout = (cx: number, cy: number, a: number): Mat => { const c = Math.cos(a), s = Math.sin(a); return [c, s, -s, c, cx - c * cx + s * cy, cy - s * cx - c * cy]; };
export const scaleAbout = (cx: number, cy: number, sx: number, sy: number): Mat => [sx, 0, 0, sy, cx - sx * cx, cy - sy * cy];
export const apply = (m: Mat, x: number, y: number): Pt => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
