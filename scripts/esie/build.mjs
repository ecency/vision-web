#!/usr/bin/env node
// Builds the web's Esie mascot images: one self-contained animated SVG per mood.
//
// Source of truth is the native app (ecency/vision-mobile, native/tools/esie/): `esie.svg` here is a copy of its
// approved master `art/esie.svg`. The per-mood CSS below is the approved motion (`art/motion.css` there) as the
// native rig `EsieRig.kt` plays it, so the web and the apps show the same poses, timings and framing:
//   - each mood's viewBox is the native `EsieViewports` frame (nothing clips during a hop, jolt or wave)
//   - after about 30 s every loop ends on its first frame and holds (native SETTLE_MS); only the blink keeps going.
//     The tear and the thought dots fill both ways, so they hold their keyframe pose (tear run off, dots even)
//     instead of snapping to the art's resting style
//   - "wave" waves three times, then rests the fin (native WELCOME and LOGIN placements)
//   - happy waves its fin with closed eyes (the approved happy render) and hops once; surprised jolts once;
//     then they breathe
//   - prefers-reduced-motion shows a still pose
//
// After copying a new master, or changing the motion rules below to follow a native motion change:
//   node scripts/esie/build.mjs
// Output files carry a content hash in their name, so caches (and the PWA precache) never serve stale art.
// esie.spec.tsx rebuilds in memory and fails when the committed output differs.
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..");
export const outDir = join(root, "apps/web/public/assets/esie");
export const tsOut = join(root, "apps/web/src/features/ui/esie/esie-moods.generated.ts");

// native EsieViewports (left, top, right, bottom in art units)
const VIEWPORTS = {
  rest: [597.98706, 268.0, 1835.5774, 1768.0],
  "thumbs-up": [196.42545, 268.0, 1835.5774, 1768.0],
  wave: [211.02596, 268.0, 1835.5774, 1768.0],
  happy: [211.02596, 174.8251, 1835.5774, 1772.3641],
  sad: [598.8225, 268.0, 1834.0144, 1775.829],
  thinking: [568.2747, 246.00687, 1856.6112, 1771.6663],
  surprised: [597.98737, 168.43448, 1835.5767, 1772.472],
  // the face, square, for the navbar button and the chat list (not a native viewport)
  avatar: [580, 110, 1920, 1450]
};

// Loops run this many times (at least 30 s), so they end on their first frame and hold.
const SETTLE_MS = 30000;
const times = (ms) => Math.ceil(SETTLE_MS / ms);
const loop = (name, ms, easing = "ease-in-out", extra = "") =>
  `${name} ${ms}ms ${easing}${extra ? " " + extra : ""} ${times(ms)}`;

const KEYFRAMES = `
@keyframes breathe{0%,100%{transform:scale(1,1)}50%{transform:scale(1.012,.988)}}
@keyframes sway{0%,100%{transform:rotate(0)}50%{transform:rotate(-7deg)}}
@keyframes blink{0%,90%,100%{transform:translateY(var(--up))}94%{transform:translateY(0)}}
@keyframes armwave{0%,100%{transform:rotate(2deg)}50%{transform:rotate(-5deg)}}
@keyframes handwave{from{transform:rotate(12deg)}to{transform:rotate(-16deg)}}
@keyframes drip{0%{transform:translateY(0) scale(.6);opacity:0}15%{opacity:1;transform:translateY(0) scale(1)}80%{opacity:1}100%{transform:translateY(90px);opacity:0}}
@keyframes dot{0%,100%{transform:scale(.6);opacity:.35}40%{transform:scale(1);opacity:1}}
@keyframes ponder{0%,100%{transform:rotate(0)}50%{transform:rotate(-2deg)}}
@keyframes jolt{0%{transform:translateY(0) scale(1,1)}35%{transform:translateY(-26px) scale(.97,1.04)}100%{transform:translateY(0) scale(1,1)}}
@keyframes sigh{0%,100%{transform:scale(1,1) translateY(0)}50%{transform:scale(1.01,.985) translateY(8px)}}
@keyframes wiggle{0%,100%{transform:rotate(0)}50%{transform:rotate(12deg)}}
@keyframes hop{0%,100%{transform:translateY(0) scale(1,1)}40%{transform:translateY(-40px) scale(.98,1.03)}}
@keyframes vanish{to{opacity:0}}
@keyframes appear{to{opacity:1}}`;

const BASE = `
#esie{transform-box:fill-box;transform-origin:50% 100%}
#tail_tip{transform-box:fill-box;transform-origin:10% 5%;animation:${loop("sway", 2600)}}
#ears path{transform-box:fill-box;transform-origin:50% 100%}
#fin_wave_arm{transform-box:fill-box;transform-origin:85% 88%}
#fin_wave_hand{transform-box:fill-box;transform-origin:72% 96%}
#fin_rest{transform-box:fill-box;transform-origin:70% 0%}
#tear{transform-box:fill-box;transform-origin:50% 0%}
#thought circle{transform-box:fill-box;transform-origin:center}
.lid{animation:blink 4s infinite}`;

const BREATHE = loop("breathe", 3200);
const REST_FIN = `#fin_front,#fin_back{display:none!important}
#fin_rest{display:inline!important;animation:${loop("sway", 2800, "ease-in-out", "reverse")}}`;
const WAVE_FINS = `#fin_front,#fin_back,#fin_rest{display:none!important}
#fin_wave{display:inline!important}
#fin_wave_arm{animation:${loop("armwave", 1000)}}
#fin_wave_hand{animation:handwave 500ms ease-in-out ${times(500) % 2 ? times(500) + 1 : times(500)} alternate}`;
// the shown mouth needs the higher specificity: both rules are !important
const mouth = (id) => `#mouth .mouth{opacity:0!important}#mouth #${id}{opacity:1!important}`;

const MOODS = {
  rest: `#esie{animation:${BREATHE}}${REST_FIN}`,
  "thumbs-up": `#esie{animation:${BREATHE}}`,
  // three waves, then the fin rests (still pose under reduced motion keeps the raised fin)
  wave: `#esie{animation:${BREATHE}}
#fin_front,#fin_back{display:none!important}
#fin_wave{display:inline!important;animation:vanish 1ms 3000ms forwards}
#fin_wave_arm{animation:armwave 1000ms ease-in-out 3}
#fin_wave_hand{animation:handwave 500ms ease-in-out 6 alternate}
#fin_rest{display:inline!important;opacity:0;animation:appear 1ms 3000ms forwards,${loop("sway", 2800, "ease-in-out", "3000ms reverse")}}`,
  happy: `#esie{animation:hop 600ms cubic-bezier(.3,1.6,.5,1) 1,breathe 3200ms ease-in-out 600ms ${times(3200)}}
${WAVE_FINS}
#eye_l,#eye_r,#body_shade{display:none!important}
#eyes_happy{display:inline!important}
${mouth("mouth_big")}
#ears path{animation:wiggle 500ms ease-in-out 3}`,
  sad: `#esie{animation:${loop("sigh", 3600)}}${REST_FIN}
#brows_sad,#lids_sad,#tear{display:inline!important}
${mouth("mouth_frown")}
[id$="_pupil"]>*{transform:translate(-6px,40px)}
#ears path{transform:rotate(-10deg)}
#tear{animation:${loop("drip", 2400, "ease-in", "both")}}`,
  thinking: `#esie{animation:${loop("ponder", 3000)}}${REST_FIN}
#brows_think,#thought{display:inline!important}
${mouth("mouth_hmm")}
[id$="_pupil"]>*{transform:translate(26px,-34px)}
#thought_1{animation:${loop("dot", 1800, "ease-in-out", "both")}}
#thought_2{animation:dot 1800ms ease-in-out 300ms both ${times(1800)}}
#thought_3{animation:dot 1800ms ease-in-out 600ms both ${times(1800)}}`,
  // still apart from the blink: it sits in the navbar on every page
  avatar: `#fin_front,#fin_back{display:none!important}#fin_rest{display:inline!important}#tail_tip{animation:none}`,
  surprised: `#esie{animation:jolt 450ms cubic-bezier(.2,1.8,.4,1) 1,breathe 3200ms ease-in-out 450ms ${times(3200)}}${REST_FIN}
#brows_surprised{display:inline!important}
${mouth("mouth_o")}
[id$="_pupil"]{transform-box:fill-box;transform-origin:center;transform:scale(.72)!important}
#ears{transform:translateY(-14px)}`
};

const REDUCED = "@media (prefers-reduced-motion:reduce){*{animation:none!important}}";

const minify = (s) =>
  s
    .replace(/>\s+</g, "><")
    .replace(/\s*\n\s*/g, "")
    .trim();

/** Builds every mood: `files` maps output file names to their content, `ts` is the generated module. */
export function buildEsie() {
  const master = readFileSync(join(here, "esie.svg"), "utf8");
  const files = {};
  const entries = [];
  for (const [mood, css] of Object.entries(MOODS)) {
    const [l, t, r, b] = VIEWPORTS[mood];
    const x = Math.floor(l);
    const y = Math.floor(t);
    const w = Math.ceil(r) - x;
    const h = Math.ceil(b) - y;
    const style = `<style>${minify(KEYFRAMES + BASE + css)}${REDUCED}</style>`;
    const svg = minify(
      master.replace(
        /<svg [^>]*>/,
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x} ${y} ${w} ${h}" width="${w}" height="${h}">${style}`
      )
    );
    const name = `${mood}.${createHash("sha256").update(svg).digest("hex").slice(0, 8)}.svg`;
    files[name] = svg + "\n";
    entries.push(`  "${mood}": { src: "/assets/esie/${name}", ratio: ${(w / h).toFixed(4)} }`);
  }
  const ts = `// Generated by scripts/esie/build.mjs. Do not edit.
export const ESIE_MOODS = {
${entries.join(",\n")}
} as const;

export type EsieMood = keyof typeof ESIE_MOODS;
`;
  return { files, ts };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { files, ts } = buildEsie();
  mkdirSync(outDir, { recursive: true });
  for (const old of readdirSync(outDir)) if (old.endsWith(".svg")) rmSync(join(outDir, old));
  for (const [name, content] of Object.entries(files)) writeFileSync(join(outDir, name), content);
  writeFileSync(tsOut, ts);
  console.log(`wrote ${Object.keys(files).length} moods to ${outDir}`);
}
