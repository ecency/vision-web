/* Shape data for every model: named parts in paint order, drawn in each
   model's own units. Pure data; print.ts turns it into dots and scene.ts
   poses it. */
import { COL, circle, clipHalf, ellipse, path, rotate, rrect, type Part, type Pt } from "./print";

type Add = (o: any) => Part;
export type FolkClass = "scribe" | "scout" | "smith" | "herald";

// A highlight stroke as a thin filled band: lines print one solid ink, so a pale
// tone only reads as a fill. Narrows toward both ends.
function band(pts: Pt[], w: number): Pt[] {
  const side = (k: number): Pt[] => pts.map((p, i) => {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1;
    const h = (w / 2) * Math.sin((Math.PI * (i + 0.5)) / pts.length) * k;
    return [p[0] - (dy / l) * h, p[1] + (dx / l) * h];
  });
  return [...side(1), ...side(-1).reverse()];
}

// Two rigid segments share a knee; the scene poses their endpoints together.
// A step reaches toward `dir` (+1 right, -1 left): outward unless the pest faces one way.
function legAdd(add: Add, hip: Pt, knee: Pt, foot: Pt, i: number, group: string = "leg", w: number = 6, dir: number = Math.sign(foot[0] - hip[0]) || 1): void {
  const limb = { hip, knee, foot, phase: i % 2 ? Math.PI : 0, dir };
  add({ name: "leg-upper", kind: "line", pts: [hip, knee], w, taper: 0.12, color: COL.head, group, limb, segment: "upper" });
  add({ name: "leg-lower", kind: "line", pts: [knee, foot], w: w * 0.7, taper: 0.6, color: COL.ink, group, limb, segment: "lower" });
  add({ name: "joint", kind: "fill", poly: circle(knee[0], knee[1], w * 0.5), color: COL.head, sw: 1.5, group, limb, segment: "joint" });
}

function beetleParts() {
  const P: Part[] = [], add: Add = (o) => { o.id = P.length; P.push(o); return o; };
  add({ name: "shadow", kind: "shadow", cx: 200, cy: 262, rx: 116, ry: 12, group: "shadow" });
  for (const side of [-1, 1]) {
    const pt = (x: number, y: number): Pt => [200 + side * x, y];
    [[30, 139, 88, 128, 120, 170], [34, 149, 106, 191, 124, 236], [32, 156, 84, 230, 96, 260]].forEach(([hx, hy, kx, ky, fx, fy], i) =>
      legAdd(add, pt(hx, hy), pt(kx, ky), pt(fx, fy), i + (side > 0 ? 1 : 0)));
  }
  add({ name: "body", kind: "fill", poly: path("M200 134 Q279 130 278 205 Q272 247 200 254 Q128 247 122 205 Q121 130 200 134 Z"), color: COL.pur, shade: 1, group: "body" });
  add({ name: "shell-rim", kind: "line", pts: path("M130 208 Q143 244 198 246 Q254 242 269 211"), w: 5, color: COL.head, group: "body" });
  add({ name: "shell-light", kind: "fill", poly: path("M140 180 Q148 148 188 145 L187 157 Q158 159 151 182 Z"), color: COL.wing, sw: 0, group: "body" });
  add({ name: "seam", kind: "line", pts: path("M200 142 Q194 198 200 248"), w: 3, color: COL.ink, group: "body" });
  for (const side of [-1, 1]) add({ name: "shell-groove", kind: "line", pts: path(`M${200 + side * 47} 178 Q${200 + side * 62} 206 ${200 + side * 30} 236`), w: 2, color: COL.head, group: "body" });
  add({ name: "thorax", kind: "fill", poly: path("M169 115 Q200 101 231 115 L241 143 Q200 161 159 143 Z"), color: COL.head, shade: 1, group: "body" });
  add({ name: "head", kind: "fill", poly: path("M175 89 Q200 73 225 89 L230 108 Q219 125 200 129 Q181 125 170 108 Z"), color: COL.pur, shade: 1, group: "head" });
  eyesAdd(add, [[181, 101], [219, 101]], 6.5, "head", "b");
  for (const side of [-1, 1]) {
    antenna(add, [200 + side * 18, 85], [200 + side * 48, 48], "ant", side, 2.8);
    add({ name: "mandible", kind: "line", pts: [[200 + side * 9, 121], [200 + side * 13, 134], [200 + side * 4, 131]], w: 3, color: COL.ink, group: "head" });
  }
  for (const [x, y, rot] of [[166, 194, -14], [235, 204, 12]]) {
    add({ name: "letter", kind: "fill", poly: rrect(x - 16, y - 11, 32, 22, 3, rot), color: COL.lime, shade: 0.3, sw: 2, group: "body" });
    add({ name: "flap", kind: "line", pts: rotate([[x - 14, y - 8], [x, y + 2], [x + 14, y - 8]], x, y, rot), w: 2, color: COL.ink, group: "body" });
  }
  return P;
}

// Eyes shared by every pest: lime white, dark pupil, knocked-out shine. Pupils follow the pointer; on defeat they spiral.
function eyesAdd(add: any, list: any, r: any, group: any, key: any) {
  list.forEach(([x, y]: Pt, k: number) => {
    const eyeKey = key + k, side = list.length > 1 ? (k ? 1 : -1) : (/R$/.test(key) ? 1 : -1);
    add({ name: "eye", kind: "fill", poly: circle(x, y, r), color: COL.lime, fine: 0.5, sw: 2.2, group, eye: "white", ec: [x, y], eyeKey, side, r });
    add({ name: "pupil", kind: "fill", poly: circle(x + r * 0.12, y + r * 0.1, r * 0.54), color: COL.dark, fine: 0.45, sw: 0, group, eye: "pupil", ec: [x, y], eyeKey, side, lookScale: Math.min(1, r / 10) });
    add({ name: "shine", kind: "fill", poly: circle(x + r * 0.33, y - r * 0.14, Math.max(1.6, r * 0.2)), color: COL.white, sw: 0, group, eye: "pupil", ec: [x, y], eyeKey, side, lookScale: Math.min(1, r / 10) });
  });
}
function antenna(add: any, b: any, tp: any, group: any, side: any, w: any = 3.4) {
  const c = [(b[0] + tp[0]) / 2 + (tp[0] - b[0]) * 0.3, Math.min(b[1], tp[1]) - 6];
  add({ name: "antenna", kind: "line", pts: path(`M${b[0]} ${b[1]} Q${c[0]} ${c[1]} ${tp[0]} ${tp[1]}`), w, taper: 0.4, color: COL.ink, group, side, pivot: b });
  add({ name: "tip", kind: "fill", poly: circle(tp[0], tp[1], 4.5), color: COL.lime, fine: 0.55, sw: 2, group, side, pivot: b });
}

function slugParts() {
  const P: Part[] = [], add: Add = (o) => { o.id = P.length; P.push(o); return o; };
  add({ name: "trail", kind: "fill", poly: path("M25 261 Q58 251 113 257 L167 269 Q90 277 25 267 Z"), color: "#C4E57A", sw: 0, group: "ground" });
  add({ name: "shadow", kind: "shadow", cx: 185, cy: 263, rx: 150, ry: 10, group: "shadow" });
  add({ name: "glow", kind: "fill", poly: ellipse(344, 225, 48, 44), color: "#EAF5C8", sw: 0, group: "ground" });
  add({ name: "foot", kind: "fill", poly: path("M40 250 Q148 244 270 229 Q295 231 298 250 Q198 276 40 260 Z"), color: "#C4E57A", shade: 0.5, sw: 2, group: "foot" });
  add({ name: "body", kind: "fill", poly: path("M40 251 Q70 235 109 207 Q147 184 203 187 Q246 188 263 165 Q282 145 297 173 Q313 208 290 237 Q167 262 40 251 Z"), color: COL.pur, shade: 1, group: "body" });
  add({ name: "mantle", kind: "fill", poly: path("M166 205 Q192 178 242 183 Q261 183 273 172 Q290 180 287 208 Q276 235 242 237 Q185 243 166 224 Z"), color: "#8B5CC6", shade: 0.7, sw: 2.2, group: "body" });
  for (const d of ["M110 220 Q155 191 185 198", "M202 196 Q230 190 246 196"])
    add({ name: "moist-highlight", kind: "fill", poly: band(path(d), 6), color: COL.wing, fine: 0.5, sw: 0, group: "body" });
  for (const x of [100, 127, 154]) add({ name: "fold", kind: "line", pts: path(`M${x} 231 Q${x + 8} 240 ${x + 5} 248`), w: 2, color: COL.head, group: "body" });
  add({ name: "breathing-pore", kind: "fill", poly: ellipse(269, 215, 5, 3, -20), color: COL.head, sw: 0, group: "body" });
  add({ name: "stalk", kind: "line", pts: path("M276 172 Q279 147 299 119"), w: 5.5, taper: 0.4, color: COL.head, group: "stalkL" });
  add({ name: "stalk", kind: "line", pts: path("M290 174 Q313 158 323 140"), w: 5, taper: 0.4, color: COL.head, group: "stalkR" });
  eyesAdd(add, [[300, 117]], 6, "stalkL", "sL");
  eyesAdd(add, [[324, 138]], 6, "stalkR", "sR");
  for (const d of ["M296 196 Q313 191 322 199", "M295 209 Q308 214 313 224"])
    add({ name: "feeler", kind: "line", pts: path(d), w: 3.4, taper: 0.6, color: COL.head, group: "body" });
  add({ name: "phone-shadow", kind: "shadow", cx: 352, cy: 263, rx: 26, ry: 5, group: "ground" });
  add({ name: "phone", kind: "fill", poly: rrect(332, 192, 38, 69, 6), color: "#C4E57A", shade: 0.2, sw: 3, group: "phone" });
  add({ name: "screen", kind: "fill", poly: rrect(338, 201, 26, 46, 2), color: COL.cream, sw: 1.5, group: "phone" });
  for (let k = 0; k < 3; k++) add({ name: "feed", kind: "line", pts: [[342, 214 + k * 10], [358 - (k % 2) * 5, 214 + k * 10]], w: 2.4, color: COL.head, group: "feed" });
  add({ name: "phone-button", kind: "fill", poly: circle(351, 254, 2.5), color: COL.head, sw: 0, group: "phone" });
  return P;
}

function twinsParts() {
  const P: Part[] = [], add: Add = (o) => { o.id = P.length; P.push(o); return o; };
  add({ name: "shadow", kind: "shadow", cx: 200, cy: 262, rx: 173, ry: 10, group: "shadow" });
  for (const [cx, dir, g] of [[104, 1, "L"], [296, -1, "R"]] as const) {
    const pt = (x: number, y: number): Pt => [cx + dir * x, y];
    for (const [i, coords] of [[0, [-2, 180, -62, 146, -74, 258]], [1, [8, 184, -24, 212, -35, 258]], [2, [20, 179, 43, 221, 53, 259]]] as [number, number[]][]) {
      const [hx, hy, kx, ky, fx, fy] = coords;
      legAdd(add, pt(hx, hy), pt(kx, ky), pt(fx, fy), i, g + "leg", i === 0 ? 10 : 5, dir);
    }
    add({ name: "body", kind: "fill", poly: rotate(ellipse(cx - dir * 14, 193, 48, 28), cx, 193, dir * -20), color: COL.pur, shade: 1, group: g });
    add({ name: "wing-case", kind: "fill", poly: [pt(-57, 210), pt(-29, 159), pt(14, 171), pt(-7, 205)], color: g === "L" ? COL.head : "#8B5CC6", shade: 0.7, sw: 2, group: g });
    add({ name: "wing-light", kind: "fill", poly: band(path(`M${pt(-47, 203).join(" ")} L${pt(-24, 172).join(" ")} L${pt(1, 177).join(" ")}`), 5), color: COL.wing, fine: 0.5, sw: 0, group: g });
    add({ name: "mark", kind: "line", pts: ellipse(cx - dir * 17, 187, 9, 10), closed: true, w: 3.5, color: COL.lime, group: g });
    add({ name: "thorax", kind: "fill", poly: ellipse(cx + dir * 15, 177, 22, 26, dir * 20), color: COL.head, shade: 0.7, group: g });
    add({ name: "head", kind: "fill", poly: ellipse(cx + dir * 29, 145, 23, 27, dir * 18), color: COL.pur, shade: 1, group: g });
    eyesAdd(add, [pt(36, 141)], 7, g, "t" + g);
    const [mx, my] = pt(40, 165);
    add({ name: "mouth", kind: "fill", poly: ellipse(mx, my, 5, 3), color: COL.dark, sw: 0, group: g + "m", mc: [mx, my] });
    // mirrored twins mirror the droop too
    antenna(add, pt(19, 123), pt(-3, 72), g + "a", -dir, 2.4);
    antenna(add, pt(36, 122), pt(62, 81), g + "a", dir, 2.4);
  }
  for (const r of [12, 23]) {
    add({ name: "echo", kind: "line", pts: path(`M171 ${164 - r} Q${171 + r * 0.7} 164 171 ${164 + r}`), w: 3, color: COL.lime, group: "arcs" });
    add({ name: "echo", kind: "line", pts: path(`M229 ${164 - r} Q${229 - r * 0.7} 164 229 ${164 + r}`), w: 3, color: COL.lime, group: "arcs" });
  }
  return P;
}

function queenParts() {
  const P: Part[] = [], add: Add = (o) => { o.id = P.length; P.push(o); return o; };
  add({ name: "shadow", kind: "shadow", cx: 200, cy: 272, rx: 146, ry: 12, group: "shadow" });
  for (const side of [-1, 1]) {
    const pt = (x: number, y: number): Pt => [200 + side * x, y];
    [[35, 139, 112, 147, 145, 212], [40, 147, 126, 205, 144, 261], [39, 155, 86, 238, 104, 272]].forEach(([hx, hy, kx, ky, fx, fy], i) =>
      legAdd(add, pt(hx, hy), pt(kx, ky), pt(fx, fy), i + (side > 0 ? 1 : 0), "leg", 9));
  }
  add({ name: "body", kind: "fill", poly: path("M200 130 Q261 124 290 175 Q321 235 256 257 Q200 277 144 257 Q79 235 110 175 Q139 124 200 130 Z"), color: COL.pur, shade: 1, group: "body" });
  add({ name: "shell-rim", kind: "line", pts: path("M112 211 Q135 255 200 259 Q265 255 288 211"), w: 7, color: COL.head, group: "body" });
  for (const y of [182, 210, 235]) add({ name: "armor-seam", kind: "line", pts: path(`M${y === 182 ? 128 : 120} ${y} Q200 ${y + 27} ${y === 182 ? 272 : 280} ${y}`), w: 3, color: COL.head, group: "body" });
  add({ name: "shell-light", kind: "fill", poly: path("M125 181 Q140 146 182 143 L183 155 Q153 158 141 182 Z"), color: COL.wing, sw: 0, group: "body" });
  // Paired markings carry the copy motif without widening the boss's silhouette.
  for (const x of [186, 214]) add({ name: "copy-mark", kind: "line", pts: ellipse(x, 213, 20, 16, -20), closed: true, w: 4, color: COL.lime, group: "body" });
  add({ name: "thorax", kind: "fill", poly: path("M167 117 Q200 104 233 117 L249 147 Q200 170 151 147 Z"), color: COL.head, shade: 1, group: "body" });
  add({ name: "head", kind: "fill", poly: path("M171 86 Q200 73 229 86 L235 108 Q227 134 200 139 Q173 134 165 108 Z"), color: COL.pur, shade: 1, group: "head" });
  eyesAdd(add, [[179, 105], [221, 105]], 7, "head", "q");
  add({ name: "smile", kind: "line", pts: path("M188 120 Q200 128 212 120"), w: 3, color: COL.ink, group: "head" });
  for (const side of [-1, 1]) add({ name: "mandible", kind: "line", pts: [[200 + side * 12, 129], [200 + side * 15, 142], [200 + side * 4, 138]], w: 4, color: COL.head, group: "head" });
  add({ name: "crown", kind: "fill", poly: path("M176 85 L173 58 L189 71 L200 47 L211 71 L227 58 L224 85 Z"), color: COL.lime, shade: 0.4, sw: 2.6, group: "crown" });
  for (const [x, y] of [[173, 58], [200, 47], [227, 58]]) add({ name: "jewel", kind: "fill", poly: circle(x, y, 3.5), color: COL.gold, sw: 1.5, group: "crown" });
  return P;
}

function waspParts() {
  const P: Part[] = [], add: Add = (o) => { o.id = P.length; P.push(o); return o; };
  // the clickbait sign, held up on a stick
  add({ name: "stick", kind: "line", pts: [[112, 200], [54, 86]], w: 6, color: COL.brown, group: "sign" });
  add({ name: "sign", kind: "fill", poly: rrect(12, 40, 94, 72, 8, -8), color: COL.gold, shade: 0.5, group: "sign" });
  for (const x of <any[]>[38, 72]) {
    add({ name: "bang", kind: "fill", poly: path(`M${x - 8} 55 L${x + 8} 53 L${x + 4} 84 L${x - 4} 84 Z`), color: COL.dark, fine: 0.5, sw: 0, group: "sign" });
    add({ name: "dot", kind: "fill", poly: circle(x + 1, 97, 5), color: COL.dark, fine: 0.5, sw: 0, group: "sign" });
  }
  // wings behind the body, rooted on the thorax
  for (const [x, y, r] of [[226, 94, -55], [247, 116, -10]])
    add({ name: "hindwing", kind: "fill", poly: ellipse(x, y, 39, 12, r), color: COL.wing, fine: 0.5, sw: 1.6, group: "wings" });
  add({ name: "wing", kind: "fill", poly: ellipse(244, 92, 64, 22, -24), color: COL.wing, fine: 0.6, sw: 2.4, group: "wings" });
  add({ name: "vein", kind: "line", pts: path("M212 124 Q244 94 294 68"), w: 1.8, taper: 0.5, color: COL.ghost, group: "wings" });
  add({ name: "wing", kind: "fill", poly: ellipse(262, 118, 50, 16, 8), color: COL.wing, fine: 0.6, sw: 2.4, group: "wings" });
  add({ name: "vein", kind: "line", pts: path("M216 128 Q260 116 304 124"), w: 1.8, taper: 0.5, color: COL.ghost, group: "wings" });
  // Five free legs plus the foreleg holding the placard: six in total.
  for (const [i, x, dx] of [[0, 198, -28], [1, 206, -4], [2, 213, 10], [3, 219, 30], [4, 224, 45]])
    legAdd(add, [x, 170], [x + dx, 202 + (i % 2) * 7], [x + dx - 7, 230 + (i % 2) * 7], i, "legs", 4);
  // pointed abdomen with three stripes that follow its outline
  const abd = path("M234 160 Q244 124 300 124 Q362 128 394 186 Q352 216 298 212 Q246 206 234 178 Z");
  add({ name: "stinger", kind: "fill", poly: path("M384 178 L416 198 L380 194 Z"), color: COL.dark, sw: 2, group: "body" });
  add({ name: "abdomen", kind: "fill", poly: abd, color: COL.pur, shade: 1, group: "body" });
  // the shine goes under the stripes, so it never knocks a gap into one
  add({ name: "shell-light", kind: "fill", poly: band(path("M262 141 Q287 129 303 138"), 6), color: COL.wing, fine: 0.5, sw: 0, group: "body" });
  for (const x of <any[]>[268, 310, 350]) {
    const stripe = clipHalf(clipHalf(abd, 1, 0.22, -(x - 11) - 0.22 * 168), -1, -0.22, (x + 11) + 0.22 * 168);
    if (stripe.length > 2) add({ name: "stripe", kind: "fill", poly: stripe, color: COL.lime, shade: 0.35, sw: 2.2, group: "body" });
  }
  add({ name: "waist", kind: "fill", poly: ellipse(232, 168, 10, 7), color: COL.head, sw: 2.2, group: "body" });
  add({ name: "thorax", kind: "fill", poly: ellipse(206, 158, 32, 28), color: COL.head, shade: 1, group: "body" });
  // the head, with a smug grin
  add({ name: "head", kind: "fill", poly: ellipse(150, 152, 36, 33), color: COL.pur, shade: 1, group: "body" });
  eyesAdd(add, [[129, 146], [164, 143]], 7, "body", "w");
  add({ name: "grin", kind: "line", pts: path("M132 170 Q150 184 170 168"), w: 3.2, color: COL.ink, group: "body" });
  add({ name: "mandible", kind: "line", pts: path("M140 180 Q136 188 142 192"), w: 2.6, color: COL.ink, group: "body" });
  add({ name: "mandible", kind: "line", pts: path("M162 180 Q166 188 160 192"), w: 2.6, color: COL.ink, group: "body" });
  antenna(add, [138, 122], [128, 82], "body", -1);
  antenna(add, [160, 120], [182, 84], "body", 1);
  // front leg holding the stick
  add({ name: "arm", kind: "line", pts: path("M186 176 Q150 206 116 200"), w: 4.4, taper: 0.7, color: COL.ink, group: "body" });
  add({ name: "hand", kind: "fill", poly: circle(112, 198, 6), color: COL.head, sw: 2, group: "body" });
  return P;
}

// ---------- the town: an island, seven buildings, member homes, and the Drama Spider ----------
// Buildings use local units with the base centre at (100, 300). Parts with stageMin appear only at that stage.
function houseAdd(add: any, x: any, y: any, w: any, h: any, roof: any, win: any, group: any = "body") {
  add({ name: "wall", kind: "fill", poly: rrect(x, y - h, w, h, 8), color: "#E9D8BC", shade: 0.7, group });
  add({ name: "roof", kind: "fill", poly: path(`M${x - 12} ${y - h + 6} L${x + w / 2} ${y - h - w * 0.55} L${x + w + 12} ${y - h + 6} Z`), color: roof, shade: 0.9, group });
  const dw = Math.min(26, w * 0.3);
  add({ name: "door", kind: "fill", poly: path(`M${x + w / 2 - dw / 2} ${y} L${x + w / 2 - dw / 2} ${y - h * 0.42} Q${x + w / 2} ${y - h * 0.42 - dw * 0.6} ${x + w / 2 + dw / 2} ${y - h * 0.42} L${x + w / 2 + dw / 2} ${y} Z`), color: roof, shade: 0.6, sw: 2.6, group });
  for (let k = 0; k < win; k++) {
    const wx = win > 1 ? x + 12 + k * (w - 44) / (win - 1) : x + 12;
    add({ name: "window", kind: "fill", poly: rrect(wx, y - h * 0.8, 20, 22, 4), color: "#F7E3B5", shade: 0.2, sw: 2.6, group });
  }
}
function islandParts() {
  const P: Part[] = [], add: Add = (o) => { o.id = P.length; P.push(o); return o; };
  add({ name: "underside", kind: "fill", poly: path("M60 470 Q90 610 380 660 Q700 700 1020 660 Q1310 610 1340 470 Z"), color: "#B07B53", shade: 1, group: "body" });
  for (const [x, l] of <any[]>[[300, 70], [520, 96], [760, 84], [980, 60], [1160, 44]]) add({ name: "root", kind: "line", pts: path(`M${x} ${600 + (x % 3) * 12} Q${x + 12} ${640 + l * 0.4} ${x - 6} ${650 + l * 0.7}`), w: 3.4, taper: 0.6, color: COL.brown, group: "body" });
  for (const d of ["M240 540 Q420 580 600 560", "M650 570 Q840 592 1000 540"]) add({ name: "strata", kind: "line", pts: path(d), w: 3.6, color: COL.brown, group: "body" });
  add({ name: "grass", kind: "fill", poly: ellipse(700, 470, 650, 72), color: "#86B86E", shade: 0.5, group: "body" });
  add({ name: "path", kind: "fill", poly: ellipse(700, 506, 430, 18), color: COL.tan, sw: 0, group: "body" });
  for (const [x, y, r] of <any[]>[[110, 452, 34], [1300, 450, 30], [620, 520, 16], [790, 522, 14]]) {
    add({ name: "trunk", kind: "line", pts: [[x, y + r * 0.6], [x, y + r + 22]], w: 7, color: COL.brown, group: "body" });
    add({ name: "tree", kind: "fill", poly: circle(x, y, r), color: "#6FA35C", shade: 0.9, group: "body" });
  }
  return P;
}
/// Another alliance's town, far off in the sky: a small island with a hall
/// under its flag. `flag` is the alliance's colour.
function isletParts(flag: string) {
  const P: Part[] = [], add: Add = (o) => { o.id = P.length; P.push(o); return o; };
  add({ name: "underside", kind: "fill", poly: path("M24 150 Q64 236 200 256 Q336 236 376 150 Z"), color: "#B07B53", shade: 1, group: "body" });
  for (const d of ["M150 238 Q158 262 146 284", "M252 236 Q262 258 256 276"]) add({ name: "root", kind: "line", pts: path(d), w: 5, taper: 0.6, color: COL.brown, group: "body" });
  add({ name: "grass", kind: "fill", poly: ellipse(200, 150, 180, 30), color: "#86B86E", shade: 0.5, group: "body" });
  add({ name: "trunk", kind: "line", pts: [[86, 140], [86, 118]], w: 8, color: COL.brown, group: "body" });
  add({ name: "tree", kind: "fill", poly: circle(86, 108, 24), color: "#6FA35C", shade: 0.9, group: "body" });
  add({ name: "home", kind: "fill", poly: rrect(270, 108, 50, 42, 6), color: "#E9D8BC", shade: 0.8, group: "body" });
  add({ name: "home-roof", kind: "fill", poly: path("M262 112 L295 84 L328 112 Z"), color: flag, shade: 0.8, group: "body" });
  add({ name: "wall", kind: "fill", poly: rrect(150, 80, 100, 70, 8), color: "#E9D8BC", shade: 0.8, group: "body" });
  add({ name: "roof", kind: "fill", poly: path("M138 86 L200 34 L262 86 Z"), color: flag, shade: 0.9, group: "body" });
  add({ name: "door", kind: "fill", poly: path("M184 150 L184 118 Q200 102 216 118 L216 150 Z"), color: flag, shade: 0.7, group: "body" });
  add({ name: "pole", kind: "line", pts: [[200, 36], [200, -8]], w: 5, color: COL.ink, group: "body" });
  add({ name: "flag", kind: "fill", poly: path("M200 -8 L246 2 L200 14 Z"), color: flag, shade: 0.6, sw: 3, group: "flag" });
  return P;
}
export const ISLET_FLAGS = [COL.blue, COL.teal, COL.orange, COL.rose, COL.pur, COL.lime];

function hallParts() {
  const P: Part[] = [], add: Add = (o) => { o.id = P.length; P.push(o); return o; };
  add({ name: "pole", kind: "line", pts: [[100, 22], [100, -48]], w: 4, color: COL.ink, group: "body", stageMin: 3 });
  add({ name: "flag", kind: "fill", poly: path("M100 -48 L164 -34 L100 -18 Z"), color: COL.blue, shade: 0.6, sw: 3, group: "flag", stageMin: 3 });
  add({ name: "wall", kind: "fill", poly: rrect(10, 104, 180, 196, 12), color: "#E9D8BC", shade: 0.8, group: "body" });
  add({ name: "roof", kind: "fill", poly: path("M-8 112 L100 20 L208 112 Z"), color: COL.blue, shade: 0.9, group: "body" });
  add({ name: "rose", kind: "fill", poly: circle(100, 62, 20), color: "#F7E3B5", shade: 0.3, sw: 3, group: "body" });
  add({ name: "door", kind: "fill", poly: path("M62 300 L62 216 Q100 180 138 216 L138 300 Z"), color: COL.blue, shade: 0.7, group: "body" });
  add({ name: "window", kind: "fill", poly: rrect(26, 134, 34, 40, 5), color: "#BFD0F0", shade: 0.2, sw: 2.6, group: "body" });
  add({ name: "window", kind: "fill", poly: rrect(140, 134, 34, 40, 5), color: "#BFD0F0", shade: 0.2, sw: 2.6, group: "body" });
  return P;
}
function towerParts() {
  const P: Part[] = [], add: Add = (o) => { o.id = P.length; P.push(o); return o; };
  add({ name: "wall", kind: "fill", poly: rrect(70, 90, 60, 210, 8), color: "#E9D8BC", shade: 0.8, group: "body" });
  add({ name: "roof", kind: "fill", poly: path("M54 98 L100 36 L146 98 Z"), color: COL.teal, shade: 0.9, group: "body" });
  add({ name: "window", kind: "fill", poly: rrect(86, 118, 28, 26, 5), color: COL.lens, shade: 0.2, sw: 2.6, group: "body" });
  add({ name: "spyglass", kind: "fill", poly: rrect(118, 118, 44, 12, 5, -18), color: COL.tan, shade: 0.6, sw: 2.2, group: "glass", stageMin: 3 });
  add({ name: "slit", kind: "line", pts: [[100, 190], [100, 222]], w: 5, color: COL.ink, group: "body" });
  return P;
}
function workshopParts() {
  const P: Part[] = [], add: Add = (o) => { o.id = P.length; P.push(o); return o; };
  for (const [x, y, r] of <any[]>[[142, 104, 14], [156, 76, 18], [150, 44, 12]]) add({ name: "smoke", kind: "fill", poly: circle(x, y, r), color: COL.white, sw: 2.2, group: "smoke", stageMin: 3, sm: [x, y] });
  add({ name: "chimney", kind: "fill", poly: rrect(128, 130, 22, 60, 4), color: COL.steel, shade: 0.8, group: "body" });
  houseAdd(add, 30, 300, 140, 110, COL.orange, 1);
  add({ name: "anvil", kind: "fill", poly: path("M112 262 L160 262 L150 272 L140 272 L140 290 L150 300 L122 300 L132 290 L132 272 L118 272 Z"), color: COL.steelD, shade: 0.7, sw: 2.2, group: "body" });
  return P;
}
function libraryParts() {
  const P: Part[] = [], add: Add = (o) => { o.id = P.length; P.push(o); return o; };
  houseAdd(add, 25, 300, 150, 120, COL.blue, 2);
  add({ name: "book", kind: "fill", poly: path("M70 150 Q85 140 100 150 Q115 140 130 150 L130 172 Q115 162 100 172 Q85 162 70 172 Z"), color: COL.cream, shade: 0.3, sw: 2.4, group: "body", stageMin: 2 });
  return P;
}
function beaconParts() {
  const P: Part[] = [], add: Add = (o) => { o.id = P.length; P.push(o); return o; };
  // light is ink: the fire's glow is stepped halftone rings
  ([[74, "#FBE3D2"], [54, "#F6C7B0"], [36, "#F2A98A"]] as [number, string][]).forEach(([r, c]) => add({ name: "glow", kind: "fill", poly: circle(100, 104, r), color: c, sw: 0, group: "glow", stageMin: 3 }));
  add({ name: "base", kind: "fill", poly: path("M66 300 L78 150 L122 150 L134 300 Z"), color: COL.steel, shade: 0.9, group: "body" });
  add({ name: "ring", kind: "fill", poly: rrect(56, 138, 88, 16, 6), color: COL.steelD, shade: 0.7, group: "body" });
  add({ name: "bowl", kind: "fill", poly: path("M62 138 Q100 176 138 138 Z"), color: COL.brown, shade: 0.8, group: "body" });
  add({ name: "flame", kind: "fill", poly: path("M100 60 Q126 100 118 132 Q100 144 82 132 Q74 100 100 60 Z"), color: COL.orange, shade: 0.4, sw: 2.6, group: "flame", stageMin: 3 });
  add({ name: "flame", kind: "fill", poly: path("M100 92 Q112 112 108 128 Q100 134 92 128 Q88 112 100 92 Z"), color: COL.gold, sw: 0, group: "flame", stageMin: 3 });
  return P;
}
function trophyParts() {
  const P: Part[] = [], add: Add = (o) => { o.id = P.length; P.push(o); return o; };
  add({ name: "cup", kind: "fill", poly: path("M82 50 Q82 80 100 84 Q118 80 118 50 Z"), color: COL.gold, shade: 0.8, sw: 2.6, group: "cup", stageMin: 3 });
  add({ name: "stem", kind: "fill", poly: rrect(94, 82, 12, 16, 3), color: COL.goldD, sw: 2.2, group: "cup", stageMin: 3 });
  add({ name: "roof", kind: "fill", poly: path("M6 152 L100 98 L194 152 Z"), color: COL.gold, shade: 0.8, group: "body" });
  add({ name: "frieze", kind: "fill", poly: rrect(16, 146, 168, 16, 3), color: COL.cream, shade: 0.4, group: "body" });
  for (const x of <any[]>[40, 80, 120, 160]) add({ name: "column", kind: "fill", poly: rrect(x - 9, 162, 18, 98, 4), color: "#E9D8BC", shade: 0.9, group: "body" });
  add({ name: "floor", kind: "fill", poly: rrect(22, 258, 156, 16, 3), color: COL.steelL, shade: 0.5, group: "body" });
  add({ name: "steps", kind: "fill", poly: rrect(10, 272, 180, 28, 4), color: COL.steel, shade: 0.7, group: "body" });
  return P;
}
function wallsParts() {
  const P: Part[] = [], add: Add = (o) => { o.id = P.length; P.push(o); return o; };
  // a low wall along the island's front rim, following its curve (scene x = local x + 120)
  for (let x = 0; x < 1160; x += 64) {
    const sx = x + 149, rim = 470 + 72 * Math.sqrt(Math.max(0, 1 - ((sx - 700) / 650) ** 2)), dy = rim + 16 - 560;
    add({ name: "stone", kind: "fill", poly: rrect(x, 266 + dy, 58, 34, 5), color: COL.steel, shade: 0.8, sw: 2.6, group: "body" });
    add({ name: "crenel", kind: "fill", poly: rrect(x + 6, 254 + dy, 18, 14, 3), color: COL.steelD, shade: 0.6, sw: 2.2, group: "body" });
    add({ name: "crenel", kind: "fill", poly: rrect(x + 34, 254 + dy, 18, 14, 3), color: COL.steelD, shade: 0.6, sw: 2.2, group: "body" });
  }
  return P;
}
function homesParts() {
  const P: Part[] = [], add: Add = (o) => { o.id = P.length; P.push(o); return o; };
  houseAdd(add, 0, 300, 70, 60, COL.rose, 0);
  houseAdd(add, 94, 300, 64, 56, COL.teal, 0);
  houseAdd(add, 180, 300, 72, 64, COL.orange, 1);
  return P;
}
function spiderParts() {
  const P: Part[] = [], add: Add = (o) => { o.id = P.length; P.push(o); return o; };
  for (const [a, b] of [[[35, 15], [200, 150]], [[365, 15], [200, 150]], [[35, 282], [200, 150]], [[365, 282], [200, 150]], [[200, 0], [200, 150]]] as [Pt, Pt][])
    add({ name: "web", kind: "line", pts: [a, b], w: 1.4, color: COL.ghost, group: "web" });
  for (const d of ["M92 65 Q200 94 308 65", "M68 239 Q200 205 332 239", "M133 37 Q200 55 267 37"])
    add({ name: "web", kind: "line", pts: path(d), w: 1.4, color: COL.ghost, group: "web" });
  for (const side of [-1, 1]) {
    const pt = (x: number, y: number): Pt => [200 + side * x, y];
    [[22, 168, 75, 95, 105, 36], [28, 176, 108, 138, 161, 97], [29, 184, 118, 200, 163, 241], [22, 192, 69, 231, 103, 281]].forEach(([hx, hy, kx, ky, fx, fy], i) =>
      legAdd(add, pt(hx, hy), pt(kx, ky), pt(fx, fy), i + (side > 0 ? 1 : 0), "leg", 7));
  }
  add({ name: "abdomen", kind: "fill", poly: path("M200 57 Q130 57 145 124 Q151 150 174 161 Q200 177 226 161 Q249 150 255 124 Q270 57 200 57 Z"), color: COL.pur, shade: 1, group: "body" });
  add({ name: "shell-light", kind: "fill", poly: path("M156 111 Q147 76 191 69 L192 78 Q164 83 166 110 Z"), color: COL.wing, sw: 0, group: "body" });
  for (const x of [188, 210]) add({ name: "drama", kind: "line", pts: ellipse(x, 118, 17, 13, 30), closed: true, w: 4, color: COL.lime, group: "body" });
  add({ name: "head", kind: "fill", poly: path("M174 151 Q200 139 226 151 Q244 176 224 202 Q200 215 176 202 Q156 176 174 151 Z"), color: COL.head, shade: 1, group: "body" });
  eyesAdd(add, [[189, 184], [211, 184]], 6, "body", "sp");
  for (const x of [177, 190, 210, 223]) add({ name: "small-eye", kind: "fill", poly: circle(x, x === 177 || x === 223 ? 173 : 167, 3), color: COL.lime, sw: 1, group: "body" });
  for (const side of [-1, 1]) add({ name: "brow", kind: "line", pts: [[200 + side * 18, 170], [200 + side * 8, 174]], w: 3.4, color: COL.ink, group: "body" });
  add({ name: "mouth", kind: "line", pts: path("M193 198 Q200 193 207 198"), w: 2.8, color: COL.ink, group: "body" });
  for (const side of [-1, 1]) add({ name: "palp", kind: "line", pts: [[200 + side * 12, 201], [200 + side * 17, 213], [200 + side * 8, 217]], w: 4, taper: 0.6, color: COL.head, group: "body" });
  return P;
}

function gnatParts() {
  const P: Part[] = [], add: Add = (o) => { o.id = P.length; P.push(o); return o; };
  add({ name: "wing", kind: "fill", poly: ellipse(29, 32, 22, 10, 35), color: COL.wing, sw: 2, group: "wingL", pivot: [45, 45] });
  add({ name: "wing", kind: "fill", poly: ellipse(71, 32, 22, 10, -35), color: COL.wing, sw: 2, group: "wingR", pivot: [55, 45] });
  for (const side of [-1, 1]) for (let i = 0; i < 3; i++) add({ name: "leg", kind: "line", pts: [[50 + side * 8, 48 + i * 4], [50 + side * (20 + i * 2), 51 + i * 9], [50 + side * (25 + i * 2), 58 + i * 10]], w: 2, taper: 0.5, color: COL.ink, group: "body" });
  add({ name: "abdomen", kind: "fill", poly: path("M39 51 Q50 42 61 51 Q67 71 50 85 Q33 71 39 51 Z"), color: COL.pur, shade: 1, group: "body" });
  add({ name: "band", kind: "line", pts: path("M41 65 Q50 70 59 65"), w: 3, color: COL.lime, group: "body" });
  add({ name: "thorax", kind: "fill", poly: ellipse(50, 47, 12, 13), color: COL.head, shade: 1, group: "body" });
  add({ name: "head", kind: "fill", poly: ellipse(50, 33, 15, 12), color: COL.pur, shade: 1, group: "body" });
  eyesAdd(add, [[42, 32], [58, 32]], 4.2, "body", "g");
  add({ name: "mouth", kind: "line", pts: path("M46 39 Q50 42 54 39"), w: 2, color: COL.ink, group: "body" });
  return P;
}

export function folkParts(cls: FolkClass) {
  const C = { scribe: COL.blue, scout: COL.teal, smith: COL.orange, herald: COL.rose }[cls];
  const P: Part[] = [], add: Add = (o) => { o.id = P.length; P.push(o); return o; };
  add({ name: "shadow", kind: "shadow", cx: 200, cy: 398, rx: 118, ry: 15, group: "shadow" });
  if (cls === "herald") {
    add({ name: "pole", kind: "line", pts: [[112, 380], [92, 150]], w: 7, taper: 0.25, color: COL.brown, group: "armL" });
    add({ name: "flag", kind: "fill", poly: path("M94 156 L36 138 L50 176 L26 204 L98 206 Z"), color: COL.rose, shade: 0.6, sw: 2.8, group: "flag" });
  }
  add({ name: "foot", kind: "fill", poly: ellipse(162, 384, 28, 14), color: COL.plum, shade: 0.6, group: "footL" });
  add({ name: "foot", kind: "fill", poly: ellipse(238, 384, 28, 14), color: COL.plum, shade: 0.6, group: "footR" });
  add({ name: "body", kind: "fill", poly: path("M118 262 Q118 186 200 186 Q282 186 282 262 L282 330 Q282 382 200 382 Q118 382 118 330 Z"), color: C, shade: 1, group: "body" });
  if (cls === "scribe") add({ name: "collar", kind: "fill", poly: path("M176 196 L200 238 L224 196 Z"), color: COL.cream, shade: 0.3, sw: 2.6, group: "body" });
  if (cls === "scout") {
    // the strap runs from the right shoulder to the left hip, away from the spyglass hand
    add({ name: "strap", kind: "fill", poly: path("M268 238 L260 226 L124 318 L132 330 Z"), color: COL.brown, shade: 0.6, sw: 2.4, group: "body" });
    add({ name: "pouch", kind: "fill", poly: rrect(150, 286, 34, 28, 6, -34), color: COL.tan, shade: 0.7, sw: 2.4, group: "body" });
  }
  if (cls === "smith") {
    add({ name: "apron", kind: "fill", poly: path("M150 228 L250 228 L250 348 Q200 368 150 348 Z"), color: COL.brown, shade: 0.8, group: "body" });
    add({ name: "pocket", kind: "fill", poly: rrect(180, 262, 40, 26, 5), color: COL.tan, shade: 0.5, sw: 2.4, group: "body" });
  }
  if (cls === "herald") add({ name: "sash", kind: "fill", poly: path("M130 222 Q200 250 270 222 L270 246 Q200 276 130 246 Z"), color: COL.cream, shade: 0.5, sw: 2.6, group: "body" });
  add({ name: "arm", kind: "fill", poly: ellipse(124, 270, 20, 32, 30), color: C, shade: 0.9, group: "armL" });
  // prop in the right hand; its tip is where attacks launch from
  if (cls === "scribe") {
    add({ name: "quill", kind: "fill", poly: path("M292 296 Q296 232 318 180 Q340 124 380 96 Q392 146 372 196 Q350 254 292 296 Z"), color: COL.cream, shade: 0.8, group: "armR" });
    add({ name: "vein", kind: "line", pts: path("M292 296 Q330 210 378 104"), w: 2.6, color: COL.blue, group: "armR" });
  } else if (cls === "scout") {
    // a short, fat spyglass: reads as a telescope even at town size
    // a telescope that widens toward its lens (its narrow end sits in the hand);
    // drawn along the x axis around its centre, then turned 50 degrees up
    const tube = (pts: Pt[]) => rotate(pts, 324, 250, -50);
    add({ name: "spyglass", kind: "fill", poly: tube([[276, 262], [276, 238], [372, 226], [372, 274]]), color: COL.tan, shade: 1, sw: 3, group: "armR" });
    add({ name: "ring", kind: "fill", poly: tube(rrect(326, 230, 10, 42, 3)), color: COL.gold, shade: 0.6, sw: 2.2, group: "armR" });
    add({ name: "lens", kind: "fill", poly: tube(ellipse(374, 250, 10, 26)), color: COL.lens, shade: 0.4, sw: 3, group: "armR" });
  } else if (cls === "smith") {
    add({ name: "handle", kind: "fill", poly: rrect(262, 150, 18, 170, 8, 28), color: COL.brown, shade: 0.8, group: "armR" });
    add({ name: "hammer", kind: "fill", poly: rrect(282, 118, 86, 44, 8, 28), color: COL.steel, shade: 1, group: "armR" });
  } else {
    add({ name: "horn", kind: "fill", poly: path("M270 272 L338 226 Q362 222 366 256 Q362 290 338 284 Z"), color: COL.gold, shade: 1, group: "armR" });
    add({ name: "bell", kind: "fill", poly: ellipse(352, 255, 12, 30), color: COL.goldD, shade: 0.7, sw: 2.8, group: "armR" });
  }
  add({ name: "arm", kind: "fill", poly: ellipse(282, 284, 20, 32, -26), color: C, shade: 0.9, group: "armR" });
  // head
  // each hero has one bold head shape that still reads when the face is a few dots:
  // the Scribe's quill behind the ear, the Scout's goggles, the Smith's helmet, the Herald's plume
  if (cls === "scribe") {
    // tucked behind the right ear and leaning out, a dark feather against the pale head
    add({ name: "ear-quill", kind: "fill", poly: path("M262 118 Q282 70 322 36 Q340 24 346 34 Q336 78 276 128 Z"), color: COL.pur, shade: 0.8, sw: 3, group: "head" });
    add({ name: "ear-quill-vein", kind: "line", pts: path("M258 136 Q290 84 342 32"), w: 3.4, color: COL.ink, group: "head" });
  }
  if (cls === "herald") {
    add({ name: "plume", kind: "fill", poly: path("M196 64 Q176 20 196 -18 Q214 -40 238 -34 Q218 -8 222 22 Q226 46 208 66 Z"), color: COL.rose, shade: 0.8, sw: 3, group: "head" });
    add({ name: "plume-rib", kind: "line", pts: path("M204 62 Q196 18 226 -30"), w: 3, color: COL.gold, group: "head" });
  }
  if (cls === "scribe") add({ name: "tuft", kind: "fill", poly: path("M200 66 Q170 40 186 14 Q214 30 200 66 Z"), color: COL.leaf, shade: 0.8, sw: 2.8, group: "head" });
  if (cls === "scribe") add({ name: "tuft", kind: "fill", poly: path("M204 66 Q222 34 250 38 Q240 66 204 66 Z"), color: COL.leaf, shade: 0.8, sw: 2.8, group: "head" });
  add({ name: "face", kind: "fill", poly: circle(200, 132, 76), color: COL.skin, shade: 0.9, group: "head" });
  for (const [ex, g] of <any[]>[[172, "eyeL"], [228, "eyeR"]]) {
    add({ name: "eye", kind: "fill", poly: ellipse(ex, 138, 9, 12), color: COL.ink, fine: 0.5, sw: 0, group: g, ec: [ex, 138] });
    add({ name: "shine", kind: "fill", poly: circle(ex + 3, 133, 3), color: COL.white, sw: 0, group: g, ec: [ex, 138] });
  }
  add({ name: "cheek", kind: "fill", poly: ellipse(148, 162, 13, 8), color: COL.cheek, sw: 0, group: "head" });
  add({ name: "cheek", kind: "fill", poly: ellipse(252, 162, 13, 8), color: COL.cheek, sw: 0, group: "head" });
  add({ name: "mouth", kind: "line", pts: path("M185 166 Q200 179 215 166"), w: 4.2, taper: 0, color: COL.ink, group: "head" });
  if (cls === "scout") {
    add({ name: "band", kind: "fill", poly: path("M126 96 Q200 70 274 96 L274 110 Q200 86 126 110 Z"), color: COL.plum, shade: 0.4, sw: 2.4, group: "head" });
    // pushed up on the forehead and big enough to break the round outline of the head
    for (const gx of [168, 232]) {
      add({ name: "goggle", kind: "fill", poly: circle(gx, 70, 27), color: COL.steel, shade: 0.9, sw: 3, group: "head" });
      add({ name: "goggle-lens", kind: "fill", poly: circle(gx, 70, 17), color: COL.lens, shade: 0.35, sw: 2.6, group: "head" });
    }
  }
  if (cls === "scribe") {
    for (const gx of <any[]>[172, 228]) add({ name: "glasses", kind: "line", pts: circle(gx, 138, 21), closed: true, w: 3.4, color: COL.ink, group: "head" });
    add({ name: "bridge", kind: "line", pts: [[193, 136], [207, 136]], w: 3.4, color: COL.ink, group: "head" });
  }
  if (cls === "smith") {
    add({ name: "helmet", kind: "fill", poly: path("M122 112 Q122 46 200 46 Q278 46 278 112 Z"), color: COL.steel, shade: 1, group: "head" });
    add({ name: "brim", kind: "fill", poly: rrect(110, 104, 180, 18, 9), color: COL.steelD, shade: 0.8, group: "head" });
    add({ name: "ridge", kind: "fill", poly: rrect(190, 52, 20, 56, 8), color: COL.steelL, shade: 0.5, sw: 2.4, group: "head" });
  }
  return P;
}
// ---------- species: how each model sits in the world ----------
// anchor = the point placed on the ground; box = bounds in model units;
// hit = ellipses [cx, cy, rx, ry] that count as a tap; aim = where
// attacks land on a boss.
export type Ellipse = [number, number, number, number];
export interface Species {
  parts: () => Part[];
  seed: number;
  anchor: Pt;
  box: [number, number, number, number];
  boss?: boolean;
  building?: boolean;
  center?: Pt;
  look?: Pt;
  hit?: Ellipse[];
  aim?: Ellipse[];
}

export const BOSS_KINDS = ["beetle", "slug", "twins", "queen"] as const;
export type BossKind = (typeof BOSS_KINDS)[number];
export const BUILDING_IDS = ["tower", "workshop", "trophy", "hall", "library", "beacon", "walls"] as const;
export type BuildingId = (typeof BUILDING_IDS)[number];
export const FOLK: FolkClass[] = ["scribe", "scout", "smith", "herald"];

export const SPECIES: Record<string, Species> = {
  beetle: { parts: beetleParts, boss: true, seed: 22, anchor: [200, 262], box: [68, 36, 332, 280], center: [200, 165], look: [200, 101],
    hit: [[200, 190, 92, 70], [200, 102, 42, 42]], aim: [[200, 170, 66, 52]] },
  slug: { parts: slugParts, boss: true, seed: 23, anchor: [190, 262], box: [16, 104, 400, 280], center: [200, 205], look: [312, 127],
    hit: [[170, 215, 135, 45], [320, 140, 40, 40], [351, 226, 38, 44]], aim: [[180, 218, 90, 20]] },
  twins: { parts: twinsParts, boss: true, seed: 24, anchor: [200, 262], box: [18, 60, 382, 278], center: [200, 176], look: [200, 141],
    hit: [[104, 181, 71, 72], [296, 181, 71, 72]], aim: [[96, 186, 34, 22], [304, 186, 34, 22]] },
  queen: { parts: queenParts, boss: true, seed: 27, anchor: [200, 272], box: [42, 36, 358, 286], center: [200, 165], look: [200, 105],
    hit: [[200, 192, 100, 70], [200, 106, 42, 42], [200, 58, 42, 30]], aim: [[200, 190, 72, 48]] },
  wasp: { parts: waspParts, seed: 26, anchor: [240, 160], box: [0, 28, 428, 252], center: [240, 160], hit: [[306, 170, 90, 48], [178, 154, 64, 40], [59, 76, 56, 45]] },
  island: { parts: islandParts, anchor: [700, 470], box: [50, 380, 1350, 700], seed: 51 },
  walls: { parts: wallsParts, building: true, anchor: [580, 300], box: [0, 200, 1160, 300], seed: 52 },
  tower: { parts: towerParts, building: true, anchor: [100, 300], box: [50, 32, 166, 300], seed: 53 },
  workshop: { parts: workshopParts, building: true, anchor: [100, 300], box: [18, 28, 182, 300], seed: 54 },
  trophy: { parts: trophyParts, building: true, anchor: [100, 300], box: [6, 46, 194, 300], seed: 55 },
  hall: { parts: hallParts, building: true, anchor: [100, 300], box: [-10, -52, 210, 300], seed: 56 },
  library: { parts: libraryParts, building: true, anchor: [100, 300], box: [13, 94, 187, 300], seed: 57 },
  beacon: { parts: beaconParts, building: true, anchor: [100, 300], box: [24, 28, 176, 300], seed: 58 },
  homes: { parts: homesParts, building: true, anchor: [126, 300], box: [-12, 188, 264, 300], seed: 59 },
  ...Object.fromEntries(ISLET_FLAGS.map((c, i) => [`islet${i}`, { parts: () => isletParts(c), anchor: [200, 150], box: [24, -8, 376, 256], seed: 60 + i } satisfies Species])),
  spider: { parts: spiderParts, anchor: [200, 150], box: [20, 0, 380, 290], seed: 60 },
  gnat: { parts: gnatParts, anchor: [50, 55], box: [4, 8, 96, 91], seed: 31 },
  scribe: { parts: () => folkParts("scribe"), anchor: [200, 398], box: [60, 10, 392, 412], seed: 41 },
  scout: { parts: () => folkParts("scout"), anchor: [200, 398], box: [60, 10, 392, 412], seed: 42 },
  smith: { parts: () => folkParts("smith"), anchor: [200, 398], box: [60, 10, 392, 412], seed: 43 },
  herald: { parts: () => folkParts("herald"), anchor: [200, 398], box: [20, -44, 392, 412], seed: 44 },
};

/// The town in scene units (1400 wide), back to front.
export const TOWN: { id: BuildingId | "homes"; x: number; y: number }[] = [
  { id: "tower", x: 190, y: 470 }, { id: "workshop", x: 365, y: 488 }, { id: "trophy", x: 528, y: 478 }, { id: "hall", x: 700, y: 494 },
  { id: "library", x: 895, y: 486 }, { id: "beacon", x: 1065, y: 474 }, { id: "walls", x: 700, y: 560 }, { id: "homes", x: 1228, y: 478 },
];
