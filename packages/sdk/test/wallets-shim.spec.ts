import { execFile } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * `@ecency/wallets` is now a shim over `@ecency/sdk/wallets` (#2062), published
 * once more so existing installs get a working, deprecated release.
 *
 * The published 6.x manifests carried the literal range `workspace:*`, because
 * `publish:wallets` ran plain `npm publish`, which does not rewrite pnpm
 * workspace ranges, and npm cannot install that. This packs the shim the way
 * `publish:wallets` does and reads the manifest that would reach the registry.
 */

const exec = promisify(execFile);
const SDK = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ROOT = resolve(SDK, "../..");
const SHIM = join(ROOT, "packages/wallets");
const PACK_MS = 120_000;

let dir: string;
let manifest: Record<string, Record<string, string> | string | undefined>;

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "wallets-shim-pack-"));
  await exec("pnpm", ["pack", "--pack-destination", dir], { cwd: SHIM, timeout: PACK_MS });
  const tarball = readdirSync(dir).find((f) => f.endsWith(".tgz"));
  expect(tarball).toBeDefined();
  await exec("tar", ["-xzf", join(dir, tarball!), "-C", dir, "package/package.json"]);
  manifest = JSON.parse(readFileSync(join(dir, "package", "package.json"), "utf8"));
}, PACK_MS);

afterAll(() => {
  if (dir) rmSync(dir, { recursive: true, force: true });
});

describe("the packed @ecency/wallets shim", () => {
  it("carries no workspace: range anywhere", () => {
    expect(JSON.stringify(manifest)).not.toContain("workspace:");
  });

  it("depends on @ecency/sdk with a caret range on the current SDK version", () => {
    const sdkVersion = JSON.parse(readFileSync(join(SDK, "package.json"), "utf8")).version;
    const deps = (manifest.dependencies ?? {}) as Record<string, string>;
    expect(deps).toEqual({ "@ecency/sdk": `^${sdkVersion}` });
    // A regular dependency, not a peer: a peer is what made every SDK minor
    // release bump this package to a new major.
    expect(manifest.peerDependencies ?? {}).not.toHaveProperty("@ecency/sdk");
  });
});

describe("publish:wallets", () => {
  it("publishes the packed tarball, not the workspace directory", () => {
    const script = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")).scripts[
      "publish:wallets"
    ] as string;
    expect(script).toMatch(/pnpm pack/);
    expect(script).toMatch(/npm@11 publish \S+\.tgz/);
  });
});
