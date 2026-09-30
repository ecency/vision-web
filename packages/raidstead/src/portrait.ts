/* Still pictures of one model in the print look, for cards and share images:
   no scene, no animation, every dot at its resting place. A silhouette is one
   even screen of night ink over the model's outline (only the eyes glow lime),
   so a pest that has not arrived yet shows its shape and no detail. */
import { SPECIES } from "./art";
import { buildModel, INKS, LIME, NIGHT, PAPER, pip, type Part, type Pt } from "./print";

export interface PortraitDot { x: number; y: number; r: number; color: string; knock: boolean }
export interface Portrait { width: number; height: number; dots: PortraitDot[] }
export interface PortraitOptions { width: number; height: number; pad?: number; spacing?: number; silhouette?: boolean }

/// Where a model's dots rest, in model units, before fitting.
interface Raw { x: number; y: number; r: number; ink: number; knock: boolean }

const distToSegment = (x: number, y: number, [ax, ay]: Pt, [bx, by]: Pt) => {
  const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
  const k = l2 ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / l2)) : 0;
  return Math.hypot(x - ax - k * dx, y - ay - k * dy);
};

/// The printed model: the same dots the scene shows at rest.
function printed(parts: Part[], sp: number, seed: number, cover: boolean): Raw[] {
  return buildModel(parts, sp, seed, cover).map((d) => {
    const p = parts[d.p];
    // ring dots (the beetle's copies) sit on their ring
    const [x, y] = p.kind === "ring" ? [p.cx + Math.cos(d.u!) * p.rx, p.cy + Math.sin(d.u!) * p.ry] : [d.hx, d.hy];
    const reg = INKS[d.ink].reg;
    return { x: x + reg[0], y: y + reg[1], r: d.r, ink: d.ink, knock: !!d.knock };
  });
}

/// The outline only: an even night screen wherever any fill or line of the model
/// is, lime inside the eyes, nothing else (no shadow, no copies, no inner detail).
function silhouette(parts: Part[], sp: number): Raw[] {
  const fills = parts.filter((p) => p.kind === "fill" && p.poly);
  const lines = parts.filter((p) => p.kind === "line" && p.pts && p.pts.length > 1);
  const eyes = fills.filter((p) => p.eye === "white");
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of [...fills.flatMap((f) => f.poly!), ...lines.flatMap((l) => l.pts!)]) {
    x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]);
  }
  const inFill = (x: number, y: number, list: Part[]) => list.some((f) => pip(x, y, f.poly!));
  const onLine = (x: number, y: number) =>
    lines.some((l) => {
      const half = Math.max(l.w * 0.6, sp * 0.6);
      for (let i = 1; i < l.pts!.length; i++) if (distToSegment(x, y, l.pts![i - 1], l.pts![i]) <= half) return true;
      return false;
    });
  const a = (INKS[NIGHT].a * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, R = Math.hypot(x1 - x0, y1 - y0) / 2 + sp;
  const out: Raw[] = [];
  for (let v = -R; v <= R; v += sp) for (let u = -R; u <= R; u += sp) {
    const x = cx + u * c - v * s, y = cy + u * s + v * c;
    if (x < x0 - sp || x > x1 + sp || y < y0 - sp || y > y1 + sp) continue;
    if (inFill(x, y, eyes)) out.push({ x, y, r: sp * 0.42, ink: LIME, knock: false });
    else if (inFill(x, y, fills) || onLine(x, y)) out.push({ x, y, r: sp * 0.42, ink: NIGHT, knock: false });
  }
  return out;
}

/// The dots of `kind` fitted into `width` x `height` (CSS px), centred, with
/// `pad` px kept free on every side. `spacing` is the dot pitch on screen.
export function portrait(kind: string, { width, height, pad = 6, spacing = 2.4, silhouette: hidden = false }: PortraitOptions): Portrait {
  const spec = SPECIES[kind];
  if (!spec) throw new Error(`unknown model ${kind}`);
  // no room left inside the padding: nothing to draw (a negative scale would give negative radii)
  if (width <= pad * 2 || height <= pad * 2) return { width, height, dots: [] };
  // a first guess at the scale from the model's box sets the dot pitch in model units
  const [bx0, by0, bx1, by1] = spec.box;
  const guess = Math.min((width - pad * 2) / (bx1 - bx0), (height - pad * 2) / (by1 - by0));
  const sp = Math.max(1, Math.round((spacing / guess) * 4) / 4);
  const parts = spec.parts();
  const full = printed(parts, sp, spec.seed, !spec.building);
  const raw = hidden ? silhouette(parts, sp) : full;
  // then fit what the full picture draws (the box leaves out parts like the beetle's
  // copies), so a silhouette sits at the size its reveal will have
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const d of full) {
    x0 = Math.min(x0, d.x - d.r); y0 = Math.min(y0, d.y - d.r); x1 = Math.max(x1, d.x + d.r); y1 = Math.max(y1, d.y + d.r);
  }
  const s = Math.min((width - pad * 2) / (x1 - x0 || 1), (height - pad * 2) / (y1 - y0 || 1));
  const ox = (width - (x1 - x0) * s) / 2 - x0 * s, oy = (height - (y1 - y0) * s) / 2 - y0 * s;
  return {
    width,
    height,
    dots: raw.map((d) => ({ x: ox + d.x * s, y: oy + d.y * s, r: d.r * s, color: d.knock ? PAPER : INKS[d.ink].c, knock: d.knock }))
  };
}

/// Paints a portrait on a canvas: paper first, then inks multiplied onto it
/// (overlapping inks darken, as on a press); knockout dots print paper.
export function drawPortrait(canvas: HTMLCanvasElement, kind: string, opts: { silhouette?: boolean; spacing?: number; pad?: number } = {}): void {
  // CSS size: a canvas not laid out yet (inside a closed dialog) has none, and is left alone
  const w = canvas.clientWidth, h = canvas.clientHeight;
  const g = canvas.getContext("2d");
  if (!g || !w || !h) return;
  const dpr = Math.min(2, (typeof window !== "undefined" && window.devicePixelRatio) || 1);
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.fillStyle = PAPER;
  g.fillRect(0, 0, w, h);
  let knock = false;
  g.globalCompositeOperation = "multiply";
  for (const d of portrait(kind, { width: w, height: h, ...opts }).dots) {
    if (d.knock !== knock) {
      knock = d.knock;
      g.globalCompositeOperation = knock ? "source-over" : "multiply";
    }
    g.fillStyle = d.color;
    g.beginPath();
    g.arc(d.x, d.y, d.r, 0, 6.283);
    g.fill();
  }
  g.globalCompositeOperation = "source-over";
}

/// The same picture as an SVG document, for places without a canvas (a
/// server-rendered share image). Knockouts print paper; inks do not multiply.
export function portraitSvg(kind: string, opts: PortraitOptions): string {
  const { width, height, dots } = portrait(kind, opts);
  const f = (n: number) => Math.round(n * 10) / 10;
  const body = dots.map((d) => `<circle cx="${f(d.x)}" cy="${f(d.y)}" r="${f(d.r)}" fill="${d.color}"/>`).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${body}</svg>`;
}
