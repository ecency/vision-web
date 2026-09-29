/* Shape data for every model: named parts in paint order, drawn in each
   model's own units. Pure data; print.ts turns it into dots and scene.ts
   poses it. */
import { COL, circle, clipHalf, ellipse, path, rotate, rrect, type Part, type Pt } from "./print";

type Add = (o: any) => Part;
export type FolkClass = "scribe" | "scout" | "smith" | "herald";

function beetleParts() {
  const P: Part[] = [], add: Add = (o) => { o.id = P.length; P.push(o); return o; };
  add({ name: "copy", kind: "ring", cx: 70, cy: 170, rx: 58, ry: 44 });
  add({ name: "copy", kind: "ring", cx: 330, cy: 170, rx: 58, ry: 44 });
  add({ name: "shadow", kind: "shadow", cx: 200, cy: 262, rx: 120, ry: 14, group: "shadow" });
  [[[150, 150], [104, 130]], [[146, 196], [100, 214]], [[250, 150], [296, 130]], [[254, 196], [300, 214]], [[170, 230], [150, 262]], [[230, 230], [250, 262]]]
    .forEach(([a, b], i) => add({ name: "leg", kind: "line", pts: [a, b], w: 5, taper: 0.45, color: COL.ink, group: "leg", pivot: a, i }));
  add({ name: "body", kind: "fill", poly: ellipse(200, 176, 76, 60), color: COL.pur, shade: 1, group: "body" });
  add({ name: "seam", kind: "line", pts: [[200, 118], [200, 234]], w: 3.4, taper: 0.3, color: COL.ink, group: "body" });
  add({ name: "head", kind: "fill", poly: circle(200, 102, 30), color: COL.head, shade: 1, group: "head" });
  eyesAdd(add, [[187, 98], [213, 98]], 8.5, "head", "b");
  for (const [side, b, t] of <any[]>[[-1, [186, 76], [166, 44]], [1, [214, 76], [234, 44]]]) {
    const c = [(b[0] + t[0]) / 2 + (t[0] - b[0]) * 0.3, Math.min(b[1], t[1]) - 6];
    add({ name: "antenna", kind: "line", pts: path(`M${b[0]} ${b[1]} Q${c[0]} ${c[1]} ${t[0]} ${t[1]}`), w: 3.4, taper: 0.4, color: COL.ink, group: "ant", side, pivot: b });
    add({ name: "tip", kind: "fill", poly: circle(t[0], t[1], 4.5), color: COL.lime, fine: 0.55, sw: 2, group: "ant", side, pivot: b });
  }
  for (const [x, y, rot] of <any[]>[[156, 150, -8], [230, 188, 10]]) {
    add({ name: "letter", kind: "fill", poly: rrect(x - 22, y - 15, 44, 30, 4, rot), color: COL.lime, shade: 0.4, sw: 2.6, group: "body" });
    add({ name: "flap", kind: "line", pts: rotate([[x - 20, y - 12], [x, y + 3], [x + 20, y - 12]], x, y, rot), w: 2.4, color: COL.ink, group: "body" });
  }
  return P;
}

// Eyes shared by every pest: lime white, dark pupil, knocked-out shine. Pupils follow the pointer; on defeat they spiral.
function eyesAdd(add: any, list: any, r: any, group: any, key: any) {
  list.forEach(([x, y]: Pt, k: number) => {
    const eyeKey = key + k, side = list.length > 1 ? (k ? 1 : -1) : (/R$/.test(key) ? 1 : -1);
    add({ name: "eye", kind: "fill", poly: circle(x, y, r), color: COL.lime, fine: 0.5, sw: 2.2, group, eye: "white", ec: [x, y], eyeKey, side, r });
    add({ name: "pupil", kind: "fill", poly: circle(x + r * 0.12, y + r * 0.1, r * 0.54), color: COL.dark, fine: 0.45, sw: 0, group, eye: "pupil", ec: [x, y], eyeKey, side });
    add({ name: "shine", kind: "fill", poly: circle(x + r * 0.33, y - r * 0.14, Math.max(1.6, r * 0.2)), color: COL.white, sw: 0, group, eye: "pupil", ec: [x, y], eyeKey, side });
  });
}
function antenna(add: any, b: any, tp: any, group: any, side: any, w: any = 3.4) {
  const c = [(b[0] + tp[0]) / 2 + (tp[0] - b[0]) * 0.3, Math.min(b[1], tp[1]) - 6];
  add({ name: "antenna", kind: "line", pts: path(`M${b[0]} ${b[1]} Q${c[0]} ${c[1]} ${tp[0]} ${tp[1]}`), w, taper: 0.4, color: COL.ink, group, side, pivot: b });
  add({ name: "tip", kind: "fill", poly: circle(tp[0], tp[1], 4.5), color: COL.lime, fine: 0.55, sw: 2, group, side, pivot: b });
}

function slugParts() {
  const P: Part[] = [], add: Add = (o) => { o.id = P.length; P.push(o); return o; };
  add({ name: "trail", kind: "fill", poly: ellipse(118, 262, 90, 12), color: "#C4E57A", sw: 0, group: "ground" });
  for (const [x, y] of <any[]>[[44, 244], [70, 236]]) add({ name: "drip", kind: "fill", poly: circle(x, y, 5), color: COL.lime, sw: 0, group: "ground" });
  add({ name: "shadow", kind: "shadow", cx: 190, cy: 262, rx: 150, ry: 12, group: "shadow" });
  // the phone's glow: light is ink, in stepped halftone rings
  ([[60, "#EAF5C8"], [47, "#DDF0A8"], [35, "#D0EA92"]] as [number, string][]).forEach(([r, c]) => add({ name: "glow", kind: "fill", poly: circle(350, 196, r), color: c, sw: 0, group: "glow" }));
  add({ name: "body", kind: "fill", poly: path("M40 252 Q52 190 150 184 Q236 176 268 156 Q296 140 302 180 Q306 222 262 238 Q190 258 40 252 Z"), color: COL.pur, shade: 1, group: "body" });
  add({ name: "stripe", kind: "line", pts: path("M100 222 Q124 210 148 222"), w: 3.4, color: COL.head, group: "body" });
  add({ name: "stripe", kind: "line", pts: path("M164 216 Q188 204 212 212"), w: 3.4, color: COL.head, group: "body" });
  add({ name: "stalk", kind: "line", pts: path("M276 156 Q282 116 312 120"), w: 4, taper: 0.3, color: COL.ink, group: "stalkL" });
  add({ name: "stalk", kind: "line", pts: path("M290 152 Q306 118 334 136"), w: 4, taper: 0.3, color: COL.ink, group: "stalkR" });
  eyesAdd(add, [[314, 122]], 8, "stalkL", "sL");
  eyesAdd(add, [[336, 138]], 8, "stalkR", "sR");
  add({ name: "phone", kind: "fill", poly: rrect(332, 164, 38, 64, 8), color: "#C4E57A", shade: 0.2, sw: 3, group: "phone" });
  for (let k = 0; k < 4; k++) add({ name: "feed", kind: "line", pts: [[340, 176 + k * 12], [340 + (k % 3 === 2 ? 14 : 22), 176 + k * 12]], w: 3, color: COL.ink, group: "feed" });
  return P;
}

function twinsParts() {
  const P: Part[] = [], add: Add = (o) => { o.id = P.length; P.push(o); return o; };
  add({ name: "shadow", kind: "shadow", cx: 200, cy: 262, rx: 170, ry: 12, group: "shadow" });
  for (const [cx, col, g] of <any[]>[[104, COL.pur, "L"], [296, "#8B5CC6", "R"]]) {
    for (const dx of <any[]>[-30, 30]) add({ name: "leg", kind: "line", pts: [[cx + dx * 0.8, 210], [cx + dx * 1.3, 256]], w: 5, taper: 0.4, color: COL.ink, group: g });
    add({ name: "body", kind: "fill", poly: ellipse(cx, 176, 62, 54), color: col, shade: 1, group: g });
    eyesAdd(add, [[cx - 18, 160], [cx + 18, 160]], 8.5, g, "t" + g);
    const mx = cx + (cx < 200 ? 12 : -12);
    add({ name: "mouth", kind: "fill", poly: ellipse(mx, 198, 14, 11), color: COL.dark, sw: 0, group: g + "m", mc: [mx, 198] });
    antenna(add, [cx - 18, 126], [cx - 36, 88], g + "a", -1);
    antenna(add, [cx + 18, 126], [cx + 36, 88], g + "a", 1);
  }
  for (const r of <any[]>[14, 28]) {
    add({ name: "echo", kind: "line", pts: path(`M172 ${196 - r} Q${172 + r * 1.1} 196 172 ${196 + r}`), w: 3.6, color: COL.lime, group: "arcs" });
    add({ name: "echo", kind: "line", pts: path(`M228 ${196 - r} Q${228 - r * 1.1} 196 228 ${196 + r}`), w: 3.6, color: COL.lime, group: "arcs" });
  }
  return P;
}

function queenParts() {
  const P: Part[] = [], add: Add = (o) => { o.id = P.length; P.push(o); return o; };
  add({ name: "copy", kind: "ring", cx: 222, cy: 196, rx: 96, ry: 66 });
  add({ name: "copy", kind: "ring", cx: 222, cy: 110, rx: 38, ry: 38 });
  add({ name: "shadow", kind: "shadow", cx: 200, cy: 272, rx: 140, ry: 12, group: "shadow" });
  [[[130, 186], [80, 160]], [[130, 214], [78, 232]], [[270, 186], [320, 160]], [[270, 214], [322, 232]]]
    .forEach(([a, b], i) => add({ name: "leg", kind: "line", pts: [a, b], w: 5.5, taper: 0.45, color: COL.ink, group: "leg", pivot: a, i }));
  add({ name: "body", kind: "fill", poly: ellipse(200, 192, 96, 66), color: COL.pur, shade: 1, group: "body" });
  add({ name: "stripe", kind: "line", pts: path("M130 178 Q200 204 270 178"), w: 3.4, color: COL.head, group: "body" });
  add({ name: "stripe", kind: "line", pts: path("M140 218 Q200 240 260 218"), w: 3.4, color: COL.head, group: "body" });
  add({ name: "head", kind: "fill", poly: circle(200, 106, 38), color: COL.head, shade: 1, group: "head" });
  eyesAdd(add, [[186, 104], [214, 104]], 8, "head", "q");
  add({ name: "smile", kind: "line", pts: path("M188 124 Q200 132 212 124"), w: 3.2, color: COL.ink, group: "head" });
  add({ name: "crown", kind: "fill", poly: path("M160 80 L168 40 L184 64 L200 30 L216 64 L232 40 L240 80 Z"), color: COL.lime, shade: 0.5, sw: 3, group: "crown" });
  for (const [x, y] of <any[]>[[168, 40], [200, 30], [232, 40]]) add({ name: "jewel", kind: "fill", poly: circle(x, y, 5), color: COL.gold, sw: 2, group: "crown" });
  return P;
}

function waspParts() {
  const P: Part[] = [], add: Add = (o) => { o.id = P.length; P.push(o); return o; };
  // the clickbait sign, held up on a stick
  add({ name: "stick", kind: "line", pts: [[112, 200], [54, 86]], w: 6, color: COL.brown, group: "sign" });
  add({ name: "sign", kind: "fill", poly: rrect(-6, 22, 120, 88, 12, -8), color: COL.gold, shade: 0.5, group: "sign" });
  for (const x of <any[]>[34, 72]) {
    add({ name: "bang", kind: "fill", poly: path(`M${x - 10} 42 L${x + 10} 39 L${x + 5} 83 L${x - 5} 84 Z`), color: COL.dark, fine: 0.5, sw: 0, group: "sign" });
    add({ name: "dot", kind: "fill", poly: circle(x + 1, 97, 8), color: COL.dark, fine: 0.5, sw: 0, group: "sign" });
  }
  // wings behind the body, rooted on the thorax
  add({ name: "wing", kind: "fill", poly: ellipse(244, 92, 64, 22, -24), color: COL.wing, fine: 0.6, sw: 2.4, group: "wings" });
  add({ name: "vein", kind: "line", pts: path("M212 124 Q244 94 294 68"), w: 1.8, taper: 0.5, color: COL.ghost, group: "wings" });
  add({ name: "wing", kind: "fill", poly: ellipse(262, 118, 50, 16, 8), color: COL.wing, fine: 0.6, sw: 2.4, group: "wings" });
  add({ name: "vein", kind: "line", pts: path("M216 128 Q260 116 304 124"), w: 1.8, taper: 0.5, color: COL.ghost, group: "wings" });
  // three legs dangling in flight
  for (const [x, dx] of <any[]>[[200, -6], [216, 2], [230, 12]])
    add({ name: "leg", kind: "line", pts: path(`M${x} 178 Q${x + dx - 4} 200 ${x + dx} 206 L${x + dx - 8} 226`), w: 4, taper: 0.5, color: COL.ink, group: "legs", pivot: [x, 178] });
  // pointed abdomen with three stripes that follow its outline
  const abd = path("M234 160 Q244 124 300 124 Q362 128 394 186 Q352 216 298 212 Q246 206 234 178 Z");
  add({ name: "stinger", kind: "fill", poly: path("M384 178 L416 198 L380 194 Z"), color: COL.dark, sw: 2, group: "body" });
  add({ name: "abdomen", kind: "fill", poly: abd, color: COL.pur, shade: 1, group: "body" });
  for (const x of <any[]>[268, 310, 350]) {
    const band = clipHalf(clipHalf(abd, 1, 0.22, -(x - 11) - 0.22 * 168), -1, -0.22, (x + 11) + 0.22 * 168);
    if (band.length > 2) add({ name: "stripe", kind: "fill", poly: band, color: COL.lime, shade: 0.35, sw: 2.2, group: "body" });
  }
  add({ name: "waist", kind: "fill", poly: ellipse(232, 168, 10, 7), color: COL.head, sw: 2.2, group: "body" });
  add({ name: "thorax", kind: "fill", poly: ellipse(206, 158, 32, 28), color: COL.head, shade: 1, group: "body" });
  // the head, with a smug grin
  add({ name: "head", kind: "fill", poly: ellipse(150, 152, 36, 33), color: COL.pur, shade: 1, group: "body" });
  eyesAdd(add, [[136, 146], [164, 146]], 10, "body", "w");
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
  add({ name: "strata", kind: "line", pts: path("M240 540 Q420 580 600 560 M650 570 Q840 592 1000 540"), w: 3.6, color: COL.brown, group: "body" });
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
  add({ name: "root", kind: "line", pts: path("M150 238 Q158 262 146 284 M252 236 Q262 258 256 276"), w: 5, taper: 0.6, color: COL.brown, group: "body" });
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
  for (const [a, b] of <any[]>[[[20, 10], [200, 150]], [[380, 10], [200, 150]], [[20, 290], [200, 150]], [[380, 290], [200, 150]], [[200, 0], [200, 150]]])
    add({ name: "web", kind: "line", pts: [a, b], w: 2.2, color: COL.ink, group: "web" });
  for (const d of <any[]>["M90 70 Q200 100 310 70", "M60 230 Q200 196 340 230", "M130 30 Q200 50 270 30", "M40 150 Q200 170 360 150"]) add({ name: "web", kind: "line", pts: path(d), w: 2.2, color: COL.ink, group: "web" });
  for (const side of <any[]>[-1, 1]) [[150, 80], [170, 150], [160, 220], [120, 270]].forEach(([ex, ey], k) =>
    add({ name: "leg", kind: "line", pts: path(`M${200 + side * 30} ${160 + k * 8} Q${200 + side * (ex - 40)} ${ey - 30} ${200 + side * ex} ${ey}`), w: 6, taper: 0.5, color: COL.ink, group: "leg", side, k, pivot: [200 + side * 30, 160 + k * 8] }));
  add({ name: "body", kind: "fill", poly: ellipse(200, 176, 56, 50), color: COL.pur, shade: 1, group: "body" });
  add({ name: "head", kind: "fill", poly: circle(200, 114, 32), color: COL.head, shade: 1, group: "body" });
  eyesAdd(add, [[188, 114], [212, 114]], 7, "body", "sp");
  add({ name: "brow", kind: "line", pts: [[172, 96], [190, 104]], w: 4.5, color: COL.ink, group: "body" });
  add({ name: "brow", kind: "line", pts: [[228, 96], [210, 104]], w: 4.5, color: COL.ink, group: "body" });
  add({ name: "mouth", kind: "line", pts: path("M190 132 Q200 126 210 132"), w: 3.4, color: COL.ink, group: "body" });
  add({ name: "drama", kind: "line", pts: path("M176 182 Q190 158 204 182 Q218 204 230 178 Q220 162 202 172 Q182 190 196 198 Q214 206 224 192"), w: 3.6, color: COL.lime, group: "body" });
  return P;
}

function gnatParts() {
  const P: Part[] = [], add: Add = (o) => { o.id = P.length; P.push(o); return o; };
  add({ name: "wing", kind: "fill", poly: ellipse(28, 30, 20, 11, -30), color: COL.wing, sw: 2.2, group: "wingL", pivot: [40, 42] });
  add({ name: "wing", kind: "fill", poly: ellipse(72, 30, 20, 11, 30), color: COL.wing, sw: 2.2, group: "wingR", pivot: [60, 42] });
  add({ name: "body", kind: "fill", poly: circle(50, 55, 28), color: COL.pur, shade: 1, group: "body" });
  for (const ex of <any[]>[40, 60]) {
    add({ name: "eye", kind: "fill", poly: circle(ex, 52, 7.5), color: COL.lime, fine: 0.55, sw: 2, group: "body" });
    add({ name: "pupil", kind: "fill", poly: circle(ex + 1, 53, 4), color: COL.dark, fine: 0.5, sw: 0, group: "body" });
    add({ name: "shine", kind: "fill", poly: circle(ex + 2.5, 51, 1.6), color: COL.white, sw: 0, group: "body" });
  }
  add({ name: "mouth", kind: "line", pts: path("M43 67 Q50 72 57 67"), w: 2.6, color: COL.ink, group: "body" });
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
    add({ name: "strap", kind: "fill", poly: path("M132 238 L140 226 L276 318 L268 330 Z"), color: COL.brown, shade: 0.6, sw: 2.4, group: "body" });
    add({ name: "pouch", kind: "fill", poly: rrect(216, 286, 34, 28, 6, 34), color: COL.tan, shade: 0.7, sw: 2.4, group: "body" });
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
    add({ name: "spyglass", kind: "fill", poly: rrect(270, 217, 100, 26, 11, -60), color: COL.tan, shade: 1, group: "armR" });
    add({ name: "lens", kind: "fill", poly: circle(345, 187, 13), color: COL.lens, shade: 0.4, sw: 2.6, group: "armR" });
  } else if (cls === "smith") {
    add({ name: "handle", kind: "fill", poly: rrect(262, 150, 18, 170, 8, 28), color: COL.brown, shade: 0.8, group: "armR" });
    add({ name: "hammer", kind: "fill", poly: rrect(282, 118, 86, 44, 8, 28), color: COL.steel, shade: 1, group: "armR" });
  } else {
    add({ name: "horn", kind: "fill", poly: path("M270 272 L338 226 Q362 222 366 256 Q362 290 338 284 Z"), color: COL.gold, shade: 1, group: "armR" });
    add({ name: "bell", kind: "fill", poly: ellipse(352, 255, 12, 30), color: COL.goldD, shade: 0.7, sw: 2.8, group: "armR" });
  }
  add({ name: "arm", kind: "fill", poly: ellipse(282, 284, 20, 32, -26), color: C, shade: 0.9, group: "armR" });
  // head
  if (cls !== "smith") add({ name: "tuft", kind: "fill", poly: path("M200 66 Q170 40 186 14 Q214 30 200 66 Z"), color: COL.leaf, shade: 0.8, sw: 2.8, group: "head" });
  if (cls !== "smith") add({ name: "tuft", kind: "fill", poly: path("M204 66 Q222 34 250 38 Q240 66 204 66 Z"), color: COL.leaf, shade: 0.8, sw: 2.8, group: "head" });
  add({ name: "face", kind: "fill", poly: circle(200, 132, 76), color: COL.skin, shade: 0.9, group: "head" });
  for (const [ex, g] of <any[]>[[172, "eyeL"], [228, "eyeR"]]) {
    add({ name: "eye", kind: "fill", poly: ellipse(ex, 138, 9, 12), color: COL.ink, fine: 0.5, sw: 0, group: g, ec: [ex, 138] });
    add({ name: "shine", kind: "fill", poly: circle(ex + 3, 133, 3), color: COL.white, sw: 0, group: g, ec: [ex, 138] });
  }
  add({ name: "cheek", kind: "fill", poly: ellipse(148, 162, 13, 8), color: COL.cheek, sw: 0, group: "head" });
  add({ name: "cheek", kind: "fill", poly: ellipse(252, 162, 13, 8), color: COL.cheek, sw: 0, group: "head" });
  add({ name: "mouth", kind: "line", pts: path("M185 166 Q200 179 215 166"), w: 4.2, taper: 0, color: COL.ink, group: "head" });
  if (cls === "scout") {
    add({ name: "band", kind: "fill", poly: path("M126 104 Q200 80 274 104 L274 116 Q200 94 126 116 Z"), color: COL.plum, shade: 0.4, sw: 2.4, group: "head" });
    for (const gx of <any[]>[172, 228]) {
      add({ name: "goggle", kind: "fill", poly: circle(gx, 96, 19), color: COL.steel, shade: 0.9, group: "head" });
      add({ name: "goggle-lens", kind: "fill", poly: circle(gx, 96, 12), color: COL.lens, shade: 0.35, sw: 2.4, group: "head" });
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
  beetle: { parts: beetleParts, boss: true, seed: 22, anchor: [200, 262], box: [60, 36, 340, 278], center: [200, 165], look: [200, 98],
    hit: [[200, 176, 90, 74], [200, 102, 42, 42]], aim: [[200, 170, 66, 52]] },
  slug: { parts: slugParts, boss: true, seed: 23, anchor: [190, 262], box: [30, 104, 410, 270], center: [200, 205], look: [325, 130],
    hit: [[170, 215, 135, 45], [320, 140, 40, 40], [350, 196, 38, 44]], aim: [[165, 218, 100, 24]] },
  twins: { parts: twinsParts, boss: true, seed: 24, anchor: [200, 262], box: [34, 80, 366, 266], center: [200, 176], look: [200, 160],
    hit: [[104, 176, 68, 60], [296, 176, 68, 60]], aim: [[104, 178, 42, 36], [296, 178, 42, 36]] },
  queen: { parts: queenParts, boss: true, seed: 27, anchor: [200, 272], box: [70, 26, 330, 276], center: [200, 165], look: [200, 104],
    hit: [[200, 192, 100, 70], [200, 106, 42, 42], [200, 58, 42, 30]], aim: [[200, 190, 72, 48]] },
  wasp: { parts: waspParts, seed: 26, anchor: [240, 160], box: [-16, 12, 420, 232], center: [240, 160], hit: [[306, 170, 90, 48], [178, 154, 64, 40], [56, 66, 68, 52]] },
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
  gnat: { parts: gnatParts, anchor: [50, 55], box: [8, 18, 92, 84], seed: 31 },
  scribe: { parts: () => folkParts("scribe"), anchor: [200, 398], box: [60, 10, 392, 412], seed: 41 },
  scout: { parts: () => folkParts("scout"), anchor: [200, 398], box: [60, 10, 392, 412], seed: 42 },
  smith: { parts: () => folkParts("smith"), anchor: [200, 398], box: [60, 10, 392, 412], seed: 43 },
  herald: { parts: () => folkParts("herald"), anchor: [200, 398], box: [20, 10, 392, 412], seed: 44 },
};

/// The town in scene units (1400 wide), back to front.
export const TOWN: { id: BuildingId | "homes"; x: number; y: number }[] = [
  { id: "tower", x: 190, y: 470 }, { id: "workshop", x: 365, y: 488 }, { id: "trophy", x: 528, y: 478 }, { id: "hall", x: 700, y: 494 },
  { id: "library", x: 895, y: 486 }, { id: "beacon", x: 1065, y: 474 }, { id: "walls", x: 700, y: 560 }, { id: "homes", x: 1228, y: 478 },
];
