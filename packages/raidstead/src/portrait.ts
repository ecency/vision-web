/* Still pictures of one model in the print look, for cards and share images:
   no scene, no animation, every dot at its resting place. */
import { SPECIES } from "./art";
import { buildModel, CORAL, INKS, NIGHT, PAPER, VIOLET, type Part } from "./print";

export interface PortraitDot { x: number; y: number; r: number; color: string; knock: boolean }
export interface Portrait { width: number; height: number; dots: PortraitDot[] }
export interface PortraitOptions { width: number; height: number; pad?: number; spacing?: number }

/// Where a model's dots rest, in model units, before fitting.
interface Raw { x: number; y: number; r: number; ink: number; knock: boolean }

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

/// The dots of `kind` fitted into `width` x `height` (CSS px), centred, with
/// `pad` px kept free on every side. `spacing` is the dot pitch on screen.
export function portrait(kind: string, { width, height, pad = 6, spacing = 2.4 }: PortraitOptions): Portrait {
  const spec = SPECIES[kind];
  if (!spec) throw new Error(`unknown model ${kind}`);
  // no room left inside the padding: nothing to draw (a negative scale would give negative radii)
  if (width <= pad * 2 || height <= pad * 2) return { width, height, dots: [] };
  // a first guess at the scale from the model's box sets the dot pitch in model units
  const [bx0, by0, bx1, by1] = spec.box;
  const guess = Math.min((width - pad * 2) / (bx1 - bx0), (height - pad * 2) / (by1 - by0));
  const sp = Math.max(1, Math.round((spacing / guess) * 4) / 4);
  const parts = spec.parts();
  const raw = printed(parts, sp, spec.seed, !spec.building);
  // then fit what the picture draws (the box leaves out parts like the beetle's copies)
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const d of raw) {
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
export function drawPortrait(canvas: HTMLCanvasElement, kind: string, opts: { spacing?: number; pad?: number } = {}): void {
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
  paint(g, portrait(kind, { width: w, height: h, ...opts }).dots);
}

/// Inks multiplied onto the paper already there; knockout dots print paper.
function paint(g: CanvasRenderingContext2D, dots: PortraitDot[], ox = 0, oy = 0): void {
  let knock = false;
  g.globalCompositeOperation = "multiply";
  for (const d of dots) {
    if (d.knock !== knock) {
      knock = d.knock;
      g.globalCompositeOperation = knock ? "source-over" : "multiply";
    }
    g.fillStyle = d.color;
    g.beginPath();
    g.arc(ox + d.x, oy + d.y, d.r, 0, 6.283);
    g.fill();
  }
  g.globalCompositeOperation = "source-over";
}

/// What a raid report's share card shows; the words come translated.
export interface ShareCard {
  kind: string;
  /// the alliance's title
  title: string;
  /// chased off, got away, still fighting
  outcome: string;
  /// "Season 2, week 1"
  week: string;
  topLabel: string;
  top: { account: string; damage: number }[];
}

export const SHARE_CARD = { width: 1200, height: 630 };
const FONT = "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";

/// The raid report's share image (1200 x 630, the size link previews use): the
/// week's pest on the left, the alliance, the outcome and the top 3 on the right.
/// Draws nothing on a canvas without a 2D context.
export function drawShareCard(canvas: HTMLCanvasElement, card: ShareCard): void {
  const { width: W, height: H } = SHARE_CARD;
  canvas.width = W;
  canvas.height = H;
  const g = canvas.getContext("2d");
  if (!g) return;
  g.fillStyle = PAPER;
  g.fillRect(0, 0, W, H);
  paint(g, portrait(card.kind, { width: 560, height: 560, pad: 16, spacing: 5 }).dots, 20, 35);

  // text measured where the context can, guessed where it cannot
  const fits = (text: string, max: number) => (g.measureText?.(text)?.width ?? text.length * 30) <= max;
  const x = 620, max = W - x - 50;
  const line = (text: string, y: number, size: number, color: string, weight = 400) => {
    g.font = `${weight} ${size}px ${FONT}`;
    g.fillStyle = color;
    let shown = text;
    while (shown.length > 1 && !fits(shown, max)) shown = shown.slice(0, -2) + "\u2026";
    g.fillText(shown, x, y);
  };
  g.textBaseline = "alphabetic";
  line("RAIDSTEAD", 110, 26, INKS[VIOLET].c, 700);
  line(card.week, 150, 28, INKS[NIGHT].c);
  // the title as large as fits, down to a size that still reads
  let size = 68;
  g.font = `800 ${size}px ${FONT}`;
  while (size > 40 && !fits(card.title, max)) g.font = `800 ${(size -= 4)}px ${FONT}`;
  line(card.title, 240, size, INKS[NIGHT].c, 800);
  line(card.outcome, 310, 48, INKS[CORAL].c, 800);
  line(card.topLabel, 390, 26, INKS[VIOLET].c, 700);
  card.top.slice(0, 3).forEach((r, i) => line(`${i + 1}. @${r.account}  ${r.damage}`, 435 + i * 44, 32, INKS[NIGHT].c));
  line("ecency.com/raidstead", H - 40, 24, INKS[VIOLET].c, 700);
}

/// The same picture as an SVG document, for places without a canvas (a
/// server-rendered share image). Knockouts print paper; inks do not multiply.
export function portraitSvg(kind: string, opts: PortraitOptions): string {
  const { width, height, dots } = portrait(kind, opts);
  const f = (n: number) => Math.round(n * 10) / 10;
  const body = dots.map((d) => `<circle cx="${f(d.x)}" cy="${f(d.y)}" r="${f(d.r)}" fill="${d.color}"/>`).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${body}</svg>`;
}

