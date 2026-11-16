// Tailwind colour-class audit (#1742).
// apps/web/tailwind.config.ts sets `presets: []` and lists its palette by hand,
// so a colour utility whose shade is not in that list (`text-amber-600`,
// `bg-red-500`) compiles to nothing: the markup carries it, no CSS defines it,
// and nothing reports it. This audit collects every colour utility written in
// apps/web/src, runs Tailwind on them with the app's own config, and reports
// each one that produced no CSS. CI runs with --fail: any finding exits 1.
import { createRequire } from "node:module";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const WEB = join(ROOT, "apps/web");
const require = createRequire(join(WEB, "package.json"));
const postcss = require("postcss");
const tailwind = require("tailwindcss");
const loadConfig = require("tailwindcss/loadConfig");
const defaultColors = require("tailwindcss/colors");
const escapeClassName = require("tailwindcss/lib/util/escapeClassName").default;
const failing = process.argv.includes("--fail");

const config = loadConfig(join(WEB, "tailwind.config.ts"));
const configColors = typeof config.theme.colors === "function"
  ? config.theme.colors({ colors: defaultColors, theme: () => ({}) })
  : config.theme.colors;
// A colour family: Tailwind's own palette names plus the config's roots
// (`gray-steel` has root `gray`, `red-020` has root `red`).
const roots = new Set(
  [...Object.keys(defaultColors), ...Object.keys(configColors)]
    .map((key) => key.split("-")[0])
    .filter((root) => /^[a-z]+$/.test(root))
);
const UTILITY = new RegExp(
  "^-?(?:bg|text|border(?:-[trblxyse])?|ring(?:-offset)?|fill|stroke|divide|from|via|to|outline|decoration|placeholder|accent|caret|shadow)-" +
    `(${[...roots].join("|")})(?:-[a-z0-9-]+)?(?:/(?:\\d+|\\[[^\\]]+\\]))?$`
);

const files = [];
(function walk(dir) {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      if (entry !== "specs" && entry !== "node_modules") walk(path);
    } else if (/\.(tsx?|jsx?)$/.test(entry) && !/\.(spec|test)\./.test(entry)) {
      files.push(path);
    }
  }
})(join(WEB, "src"));

// utility -> the files that write it. Variants (`dark:`, `hover:`) and the
// important flag are stripped: the question is whether the colour exists.
const uses = new Map();
for (const file of files) {
  const text = readFileSync(file, "utf8");
  for (const token of text.split(/[^A-Za-z0-9:/!._\-[\]#%]+/)) {
    const base = token.slice(token.lastIndexOf(":") + 1).replace(/^!/, "");
    if (!UTILITY.test(base)) continue;
    if (!uses.has(base)) uses.set(base, new Set());
    uses.get(base).add(relative(ROOT, file));
  }
}

// The utilities among `candidates` that Tailwind builds no rule for. A class
// counts as built only when a rule's selector names it exactly: a substring
// test let `bg-blue-dark` pass on the strength of `bg-blue-dark-sky`.
async function deadUtilities(candidates) {
  const root = await postcss([
    tailwind({ ...config, content: [{ raw: candidates.join(" "), extension: "html" }], safelist: [] })
  ]).process("@tailwind utilities;", { from: undefined });
  const built = new Set();
  root.root.walkRules((rule) => {
    for (const m of rule.selector.matchAll(/\.((?:\\.|[A-Za-z0-9_-])+)/g)) built.add(m[1]);
  });
  return candidates.filter((utility) => !built.has(escapeClassName(utility))).sort();
}

// --self-test: prove the check still tells dead from live, prefix twins included.
if (process.argv.includes("--self-test")) {
  const expectDead = ["bg-blue-dark", "text-gray-60", "border-red-5", "text-red-02", "text-amber-650"];
  const expectLive = ["bg-blue-dark-sky", "text-gray-600", "border-red-500", "text-red-020-50", "text-red", "bg-black/45"];
  const dead = new Set(await deadUtilities([...expectDead, ...expectLive]));
  const wrong = [...expectDead.filter((u) => !dead.has(u)), ...expectLive.filter((u) => dead.has(u))];
  if (wrong.length > 0) {
    console.error(`self-test FAILED, misclassified: ${wrong.join(", ")}`);
    process.exit(1);
  }
  console.log(`self-test ok (${expectDead.length} dead, ${expectLive.length} live)`);
  process.exit(0);
}

const candidates = [...uses.keys()];
const dead = await deadUtilities(candidates);
for (const utility of dead) {
  console.log(`${utility}  (${[...uses.get(utility)].sort().join(", ")})`);
}
console.log(`\n${dead.length} colour utilities produce no CSS (${candidates.length} checked).`);
if (failing && dead.length > 0) process.exit(1);
