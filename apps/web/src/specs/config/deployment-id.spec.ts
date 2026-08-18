import fs from "fs";
import path from "path";

/**
 * The deployment ID is appended to every asset and RSC chunk reference as
 * `?dpl=<id>`. A post page carries ~1,235 such references, so each byte of the
 * id costs ~1.2 KB of page weight. The full 40-char SHA cost 55,575 B, 16-19%
 * of the page (#1533).
 *
 * Skew protection only requires the value to CHANGE between deploys, so it is
 * truncated to 8 hex. This evaluates the real expression out of next.config.js
 * rather than grepping for `.slice`, so it fails if the logic is rewritten in a
 * way that restores the long id.
 */
const CONFIG = path.resolve(__dirname, "../../../next.config.js");
const SHA = "2e1e30395130118638606085fb594aedfcf2e694";
const CHUNK_REFS_PER_POST_PAGE = 1235;

function deploymentIdFor(sentryRelease: string | undefined): string | undefined {
  const src = fs.readFileSync(CONFIG, "utf8");
  const m = src.match(/deploymentId:\s*([\s\S]*?),\n\s{2}\w/);
  if (!m) throw new Error("deploymentId expression not found in next.config.js");
  // eslint-disable-next-line no-new-func
  return new Function("process", `return (${m[1]});`)({ env: { SENTRY_RELEASE: sentryRelease } });
}

describe("deploymentId stays short (#1533)", () => {
  it("truncates the CI release SHA to 8 characters", () => {
    const id = deploymentIdFor(`ecency-next@${SHA}`);
    expect(id).toBe("2e1e3039");
    expect(id).toHaveLength(8);
  });

  it("is undefined in local dev, where skew protection is inactive", () => {
    expect(deploymentIdFor(undefined)).toBeUndefined();
  });

  it("still changes between deploys, which is all skew protection needs", () => {
    expect(deploymentIdFor("ecency-next@aaaaaaaa1111"))
      .not.toBe(deploymentIdFor("ecency-next@bbbbbbbb2222"));
  });

  it("keeps the per-page ?dpl= cost under 20 KB", () => {
    const perRef = `?dpl=${deploymentIdFor(`ecency-next@${SHA}`)}`.length;
    expect(perRef * CHUNK_REFS_PER_POST_PAGE).toBeLessThan(20_000);
  });

  it("does not truncate SENTRY_RELEASE itself (sourcemaps match the full release)", () => {
    const src = fs.readFileSync(CONFIG, "utf8");
    const inlined = src.match(/SENTRY_RELEASE: process\.env\.SENTRY_RELEASE[^\n]*/);
    expect(inlined).not.toBeNull();
    expect(inlined![0]).not.toMatch(/slice|substring|substr/);
  });
});
