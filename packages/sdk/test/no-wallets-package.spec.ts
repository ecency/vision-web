import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * The standalone wallets package is gone (#2062): its code ships as the
 * `@ecency/sdk/wallets` entry. Apps, build tooling and the lockfile must not
 * reach for the removed workspace package, or an install or a CI job breaks
 * (or, worse, silently pulls the deprecated npm release).
 *
 * Docs and changelogs may still name the old package to say it is deprecated,
 * so only code and tooling are checked.
 */

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const REMOVED = ["@ecency/" + "wallets", "packages/" + "wallets"];

/** Source and tooling files, tracked by git, where a reference is a dependency. */
function codeAndTooling(): string[] {
  const files = execFileSync("git", ["ls-files", "-z"], { cwd: ROOT, encoding: "utf8" })
    .split("\0")
    .filter(Boolean);
  return files.filter(
    (f) =>
      !f.includes("/dist/") &&
      !f.endsWith(".md") &&
      existsSync(join(ROOT, f)) &&
      (/^apps\/[^/]+\/src\/.*\.(ts|tsx|js|jsx|mjs|cjs)$/.test(f) ||
        /(^|\/)package\.json$/.test(f) ||
        /(^|\/)Dockerfile$/.test(f) ||
        /^\.github\/(workflows|scripts)\//.test(f) ||
        f === "apps/web/next.config.js" ||
        f === "pnpm-lock.yaml" ||
        f === "pnpm-workspace.yaml")
  );
}

describe("the removed wallets package", () => {
  it("is no longer a workspace package", () => {
    expect(existsSync(join(ROOT, REMOVED[1], "package.json"))).toBe(false);
  });

  it("is not referenced by app source, manifests, Dockerfiles, workflows or the lockfile", () => {
    const files = codeAndTooling();
    // Not vacuous: the scan must actually see app source and the CI config.
    expect(files).toContain("apps/web/package.json");
    expect(files).toContain(".github/workflows/packages.yml");
    expect(files.some((f) => f.startsWith("apps/self-hosted/src/"))).toBe(true);

    const hits = files.flatMap((f) => {
      const text = readFileSync(join(ROOT, f), "utf8");
      return REMOVED.filter((needle) => text.includes(needle)).map((needle) => `${f}: ${needle}`);
    });
    expect(hits).toEqual([]);
  });
});
