// @vitest-environment node
import fs from "fs";
import path from "path";
import { faqKeysGeneral } from "@/consts";
import pathData from "@/features/ecency-center/data/path.json";

const SRC = path.resolve(__dirname, "../..");
const faq = JSON.parse(fs.readFileSync(path.join(SRC, "features/i18n/locales/en-US.json"), "utf8"))
  .static.faq as Record<string, string>;

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return e.name === "specs" ? [] : sourceFiles(p);
    return /\.tsx?$/.test(e.name) ? [p] : [];
  });
}

/**
 * /faq, the help center, the about page and the decks FAQ column all render
 * `static.faq.<key>-header` / `-body` for every key in `faqKeysGeneral`, and
 * the help center also for its per-path suggestions. A key without copy shows
 * up as the raw i18n key (#1617).
 */
describe("faqKeysGeneral", () => {
  it("has a header and a body in en-US for every key", () => {
    const missing = faqKeysGeneral.filter((k) => !faq[`${k}-header`] || !faq[`${k}-body`]);
    expect(missing).toEqual([]);
  });

  it("covers every help center path suggestion", () => {
    const suggestions = pathData.faqPaths.flatMap((p) => p.suggestions);
    expect(suggestions.length).toBeGreaterThan(0);
    expect(suggestions.filter((k) => !faqKeysGeneral.includes(k))).toEqual([]);
  });

  it("covers every hardcoded /faq#<key> link", () => {
    const linked = new Set(
      sourceFiles(SRC).flatMap((f) =>
        [...fs.readFileSync(f, "utf8").matchAll(/\/faq#([\w-]+)/g)].map((m) => m[1])
      )
    );
    expect(linked.size).toBeGreaterThan(0);
    expect([...linked].filter((k) => !faqKeysGeneral.includes(k))).toEqual([]);
  });
});
