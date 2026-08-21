// @vitest-environment node
import fs from "fs";
import path from "path";
import { SENTRY_EXPORTS, sentry } from "@/core/sentry/lazy-sentry";

/**
 * The facade restricts its dynamic import to the exports it calls through a
 * `webpackExports` magic comment (#1595). That comment is a string webpack
 * reads; TypeScript cannot tie it to the SENTRY_EXPORTS const that types the
 * method set. If the two drift, the missing export is simply undefined in the
 * production bundle and nothing in the mocked facade spec would notice.
 */
const SOURCE = path.resolve(__dirname, "../../../core/sentry/lazy-sentry.ts");

function exportsFromMagicComment(): string[] {
  const src = fs.readFileSync(SOURCE, "utf8");
  const m = src.match(/\/\*\s*webpackExports:\s*(\[[^\]]*\])\s*\*\//);
  if (!m) throw new Error("webpackExports magic comment not found in lazy-sentry.ts");
  return JSON.parse(m[1]);
}

describe("lazy-sentry webpackExports stays in sync with SENTRY_EXPORTS (#1595)", () => {
  it("lists exactly the same exports", () => {
    expect([...exportsFromMagicComment()].sort()).toEqual([...SENTRY_EXPORTS].sort());
  });

  it("covers every method the facade exposes, plus init", () => {
    const needed = [...Object.keys(sentry), "init", "setTag"];
    for (const method of needed) {
      expect(SENTRY_EXPORTS).toContain(method);
    }
  });
});
