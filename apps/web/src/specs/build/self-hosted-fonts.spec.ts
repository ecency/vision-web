import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// A build must not depend on Google Fonts answering: next/font/google
// downloads its files on every build, and the build fails whenever Google
// answers with something else (#2136). The fonts ship with the repo instead.

const SRC = path.resolve(__dirname, "../..");
const FONTS = path.join(SRC, "fonts");

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === "specs" ? [] : sourceFiles(full);
    return /\.(tsx?|jsx?|mjs)$/.test(entry.name) ? [full] : [];
  });
}

/** The modules that declare faces (stack.ts only joins them). */
const fontModules = () =>
  fs.existsSync(FONTS)
    ? fs
        .readdirSync(FONTS)
        .filter((f) => f.endsWith(".ts"))
        .map((f) => path.join(FONTS, f))
        .filter((f) => fs.readFileSync(f, "utf8").includes("localFont("))
    : [];

describe("self-hosted fonts (#2136)", () => {
  it("no source file loads fonts from Google at build time", () => {
    const offenders = sourceFiles(SRC).filter((f) => /from\s+["']next\/font\/google["']/.test(fs.readFileSync(f, "utf8")));
    expect(offenders.map((f) => path.relative(SRC, f))).toEqual([]);
  });

  it("every font file a module names is in the repo and is a woff2", () => {
    const modules = fontModules();
    expect(modules.length).toBeGreaterThan(0);
    for (const mod of modules) {
      const paths = [...fs.readFileSync(mod, "utf8").matchAll(/path:\s*"([^"]+)"/g)].map((m) => m[1]);
      expect(paths.length).toBeGreaterThan(0);
      for (const p of paths) {
        const file = path.resolve(path.dirname(mod), p);
        expect(fs.existsSync(file), p).toBe(true);
        expect(fs.readFileSync(file).subarray(0, 4).toString("latin1"), p).toBe("wOF2");
      }
    }
  });

  it("every bundled family carries its copyright notice and the full OFL text", () => {
    const families = fs.readdirSync(FONTS, { withFileTypes: true }).filter((e) => e.isDirectory());
    expect(families.length).toBeGreaterThan(0);
    for (const family of families) {
      const license = path.join(FONTS, family.name, "OFL.txt");
      expect(fs.existsSync(license), family.name).toBe(true);
      const text = fs.readFileSync(license, "utf8");
      expect(text, family.name).toMatch(/^Copyright \d{4} The .+ Project Authors/m);
      expect(text, family.name).toContain("SIL OPEN FONT LICENSE Version 1.1");
    }
  });

  it("sizes the fallback fonts exactly as next/font/google did", async () => {
    // The fallback shows until the webfont swaps in; different metrics than
    // before would change how much the text shifts at that swap.
    const nextDir = path.dirname(require.resolve("next/package.json"));
    const google = await import(
      path.join(nextDir, "dist/compiled/@next/font/dist/google/get-fallback-font-override-metrics.js")
    );
    const metricsOf = (google.getFallbackFontOverrideMetrics ?? google.default.getFallbackFontOverrideMetrics) as (
      family: string
    ) => { fallbackFont: string; ascentOverride: string; descentOverride: string; lineGapOverride: string; sizeAdjust: string };
    const css = fs.readFileSync(path.join(FONTS, "fallbacks.css"), "utf8");
    for (const family of ["Inter", "Lora", "Fredoka"]) {
      const m = metricsOf(family);
      const face = new RegExp(`@font-face\\s*\\{[^}]*font-family:\\s*"${family} Fallback"[^}]*\\}`).exec(css)?.[0];
      expect(face, family).toBeDefined();
      expect(face).toContain(`local("${m.fallbackFont}")`);
      expect(face).toContain(`ascent-override: ${m.ascentOverride}`);
      expect(face).toContain(`descent-override: ${m.descentOverride}`);
      expect(face).toContain(`line-gap-override: ${m.lineGapOverride}`);
      expect(face).toContain(`size-adjust: ${m.sizeAdjust}`);
    }
    // No face computes its own fallback: the stacks end with these instead.
    for (const mod of fontModules()) {
      const source = fs.readFileSync(mod, "utf8");
      expect(source).not.toMatch(/adjustFontFallback:\s*"/);
      for (const m of source.matchAll(/fontStack\(\[[^\]]+\],\s*"([^"]+)"\)/g)) {
        expect(m[1]).toMatch(/^(Inter|Lora|Fredoka) Fallback$/);
      }
      expect(source).toMatch(/fontStack\(\[[^\]]+\],\s*"[A-Za-z]+ Fallback"\)/);
    }
  });

  it("each face keeps its unicode range, and only latin faces are preloaded", () => {
    for (const mod of fontModules()) {
      const calls = fs.readFileSync(mod, "utf8").split("localFont({").slice(1);
      expect(calls.length).toBeGreaterThan(0);
      for (const call of calls) {
        const subset = /path:\s*"\.\/[a-z]+\/([a-z-]+)\.woff2"/.exec(call)?.[1];
        expect(call, subset).toMatch(/prop:\s*"unicode-range"/);
        expect(call.includes("preload: true"), subset).toBe(subset === "latin");
      }
    }
  });

  it("stacks latin first and the other subsets after it, as Google's CSS resolved them", () => {
    // Google declares latin last and the last face wins where ranges overlap
    // (\u0131, \u0153, \u0491...); in a family list the FIRST family wins, so the
    // stack runs in reverse declaration order, latin-ext right after latin.
    for (const mod of fontModules()) {
      const source = fs.readFileSync(mod, "utf8");
      const stacks = [...source.matchAll(/fontStack\(\[([^\]]+)\]/g)].map((m) => m[1].split(",").map((n) => n.trim()));
      expect(stacks.length).toBeGreaterThan(0);
      for (const names of stacks) {
        expect(names[0]).toMatch(/Latin$/);
        expect(names[1]).toMatch(/LatinExt$/);
      }
    }
  });

  it("keeps the whole stack in reverse declaration order for each family", () => {
    // Google's CSS declares each family's subsets in this order (latin last).
    const declared: Record<string, string[]> = {
      inter: ["CyrillicExt", "Cyrillic", "GreekExt", "Greek", "Vietnamese", "LatinExt", "Latin"],
      lora: ["CyrillicExt", "Cyrillic", "Math", "Symbols", "Vietnamese", "LatinExt", "Latin"],
      fredoka: ["Hebrew", "LatinExt", "Latin"],
    };
    const found: Record<string, string[]> = {};
    for (const mod of fontModules()) {
      for (const m of fs.readFileSync(mod, "utf8").matchAll(/fontStack\(\[([^\]]+)\]/g)) {
        const names = m[1].split(",").map((n) => n.trim());
        const family = /^[a-z]+/.exec(names[0])![0];
        found[family] = names.map((n) => n.slice(family.length));
      }
    }
    for (const [family, order] of Object.entries(declared)) {
      expect(found[family], family).toEqual([...order].reverse());
    }
  });
});

