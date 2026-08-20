// @vitest-environment node
import { describe, expect, it, afterEach } from "vitest";
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PHASE_PRODUCTION_SERVER } from "next/constants";

/**
 * The production image starts Next with `node --require ./next-runtime-config.js`
 * (see the Dockerfile). Without it, `next start` in an image that carries no
 * next.config.js resolves every request-time option to Next's default, which
 * is the production-only drift this preload exists to close. These tests boot
 * the real preload in a child process against a staged `.next/` directory, and
 * the last one pins the Next-internal hook it relies on, so a Next upgrade
 * that drops the hook fails here instead of silently reverting production.
 */

const PRELOAD = join(process.cwd(), "next-runtime-config.js");
const ENV_KEY = "__NEXT_PRIVATE_STANDALONE_CONFIG";
const staged: string[] = [];

function stage(manifest?: unknown): string {
  const dir = mkdtempSync(join(tmpdir(), "next-runtime-config-"));
  staged.push(dir);
  copyFileSync(PRELOAD, join(dir, "next-runtime-config.js"));
  if (manifest !== undefined) {
    mkdirSync(join(dir, ".next"));
    writeFileSync(join(dir, ".next", "required-server-files.json"), JSON.stringify(manifest));
  }
  return dir;
}

function boot(dir: string, env: NodeJS.ProcessEnv = {}) {
  return spawnSync(
    process.execPath,
    ["--require", "./next-runtime-config.js", "-e", `process.stdout.write(process.env.${ENV_KEY} || "")`],
    { cwd: dir, encoding: "utf8", env: { ...process.env, [ENV_KEY]: "", ...env } }
  );
}

afterEach(() => {
  delete process.env[ENV_KEY];
  for (const dir of staged.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("next-runtime-config preload", () => {
  const config = { htmlLimitedBots: "Googlebot|Yeti", compress: true, experimental: {} };

  it("hands Next the config the build resolved", () => {
    const res = boot(stage({ version: 1, config }));
    expect(res.status, res.stderr).toBe(0);
    expect(JSON.parse(res.stdout)).toEqual(config);
    expect(res.stderr).toContain("[next-runtime-config] build config applied");
  });

  it("does not let a value inherited from the environment win over the build", () => {
    const res = boot(stage({ version: 1, config }), { [ENV_KEY]: JSON.stringify({ stale: true }) });
    expect(res.status, res.stderr).toBe(0);
    expect(JSON.parse(res.stdout)).toEqual(config);
  });

  it("fails loudly when the build manifest is missing", () => {
    const res = boot(stage());
    expect(res.status).toBe(1);
    expect(res.stderr).toContain("cannot read");
    expect(res.stdout).toBe("");
  });

  it("fails loudly when the manifest carries no config object", () => {
    const res = boot(stage({ version: 1 }));
    expect(res.status).toBe(1);
    expect(res.stderr).toContain("carries no config object");
  });

  it("is honoured by Next's own config loader (pins the hook the preload relies on)", async () => {
    // No next.config.js in the staged dir, exactly like the production image.
    const dir = stage();
    process.env[ENV_KEY] = JSON.stringify(config);
    const { default: loadConfig } = await import("next/dist/server/config");
    const loaded = await loadConfig(PHASE_PRODUCTION_SERVER, dir);
    expect(loaded.htmlLimitedBots).toBe("Googlebot|Yeti");
  });
});
