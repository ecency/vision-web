// @vitest-environment node
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

/**
 * Post pages are cached at the edge and the origin for days, referencing the
 * chunks of the build that rendered them. When a deploy removes those chunks
 * the cached page loads 404s and hard-reloads onto the new build (#1615).
 * retain-static.js carries the previous builds' static assets into the new
 * image, bounded to the last few builds. These tests drive the merge on temp
 * directories and pin the Dockerfile/workflow wiring that invokes it.
 */
const { retainStatic, MANIFEST, MAX_AGE_MS, MAX_BUILDS, MAX_RETAINED_BYTES } = require("../../../retain-static.js") as {
  retainStatic: (o: {
    currentDir: string;
    previousDir?: string;
    buildId: string;
    now?: number;
    maxAgeMs?: number;
    maxBuilds?: number;
    maxRetainedBytes?: number;
  }) => {
    current: string;
    retained: { id: string; builtAt: number; files: string[] }[];
    copied: number;
    retainedBytes: number;
  };
  MANIFEST: string;
  MAX_AGE_MS: number;
  MAX_BUILDS: number;
  MAX_RETAINED_BYTES: number;
};
const DAY = 24 * 60 * 60 * 1000;

const root = join(__dirname, "..", "..", "..", "..", "..");
const read = (p: string) => readFileSync(join(root, p), "utf8");

const dirs: string[] = [];
function tmp(): string {
  const d = mkdtempSync(join(tmpdir(), "retain-"));
  dirs.push(d);
  return d;
}
function put(dir: string, rel: string, body = rel) {
  mkdirSync(join(dir, rel, ".."), { recursive: true });
  writeFileSync(join(dir, rel), body);
}
function manifest(dir: string) {
  return JSON.parse(readFileSync(join(dir, MANIFEST), "utf8")) as {
    builds: { id: string; builtAt: number; files: string[] }[];
  };
}
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

describe("retain-static", () => {
  it("first run: treats a previous image without a manifest as one build and merges it", () => {
    const prev = tmp();
    put(prev, "chunks/old-a.js");
    put(prev, "css/old.css");
    put(prev, "oldbuild/_buildManifest.js");
    const cur = tmp();
    put(cur, "chunks/new-a.js");
    put(cur, "newbuild/_buildManifest.js");

    const r = retainStatic({ currentDir: cur, previousDir: prev, buildId: "newbuild" });
    expect(r.copied).toBe(3);
    expect(existsSync(join(cur, "chunks/old-a.js"))).toBe(true);
    expect(existsSync(join(cur, "oldbuild/_buildManifest.js"))).toBe(true);
    const m = manifest(cur);
    expect(m.builds.map((b) => b.id)).toEqual(["newbuild", "previous"]);
    expect(m.builds[0].files.sort()).toEqual(["chunks/new-a.js", "newbuild/_buildManifest.js"]);
    expect(m.builds[1].files.sort()).toEqual(["chunks/old-a.js", "css/old.css", "oldbuild/_buildManifest.js"]);
  });

  it("keeps builds for the cache horizon, not a fixed count: many deploys a day all stay", () => {
    // The longest HTML tier is s-maxage 30 days (entry-archive / entry-ancient),
    // honoured by Cloudflare's standard cache and the origin nginx.
    expect(MAX_AGE_MS).toBe(31 * DAY);
    let prev = tmp();
    put(prev, "chunks/b0.js");
    writeFileSync(join(prev, MANIFEST), JSON.stringify({ builds: [{ id: "b0", builtAt: 0, files: ["chunks/b0.js"] }] }));
    // Ten deploys over one day: every one of them is still retained.
    let cur = prev;
    for (let i = 1; i <= 10; i++) {
      prev = cur;
      cur = tmp();
      put(cur, `chunks/b${i}.js`);
      retainStatic({ currentDir: cur, previousDir: prev, buildId: `b${i}`, now: i * (DAY / 10) });
    }
    const ids = manifest(cur).builds.map((b) => b.id);
    expect(ids).toEqual(["b10", "b9", "b8", "b7", "b6", "b5", "b4", "b3", "b2", "b1", "b0"]);
    expect(existsSync(join(cur, "chunks/b0.js"))).toBe(true);
    // 31.5 days later the builds older than the window (b0..b4, built in the
    // first half of day one) have aged out; the rest stay.
    prev = cur;
    cur = tmp();
    put(cur, "chunks/b11.js");
    const r = retainStatic({ currentDir: cur, previousDir: prev, buildId: "b11", now: 31.5 * DAY });
    const after = manifest(cur).builds.map((b) => b.id);
    expect(after).toEqual(["b11", "b10", "b9", "b8", "b7", "b6", "b5"]);
    expect(existsSync(join(cur, "chunks/b0.js"))).toBe(false);
    expect(existsSync(join(cur, "chunks/b4.js"))).toBe(false);
    expect(existsSync(join(cur, "chunks/b5.js"))).toBe(true);
    expect(r.retained.every((b) => typeof b.builtAt === "number")).toBe(true);
  });

  it("caps the number of retained builds as a backstop", () => {
    const prev = tmp();
    const builds = [];
    for (let i = 0; i < 5; i++) {
      put(prev, `chunks/p${i}.js`);
      builds.push({ id: `p${i}`, builtAt: 1000 - i, files: [`chunks/p${i}.js`] });
    }
    writeFileSync(join(prev, MANIFEST), JSON.stringify({ builds }));
    const cur = tmp();
    put(cur, "chunks/c.js");
    retainStatic({ currentDir: cur, previousDir: prev, buildId: "c", now: 1000, maxBuilds: 3 });
    expect(manifest(cur).builds.map((b) => b.id)).toEqual(["c", "p0", "p1", "p2"]);
    expect(MAX_BUILDS).toBe(400);
  });

  it("stops retaining older builds once the retained bytes exceed the cap", () => {
    const prev = tmp();
    const builds = [];
    for (let i = 0; i < 4; i++) {
      put(prev, `chunks/p${i}.js`, "x".repeat(1000));
      builds.push({ id: `p${i}`, builtAt: 100 - i, files: [`chunks/p${i}.js`] });
    }
    writeFileSync(join(prev, MANIFEST), JSON.stringify({ builds }));
    const cur = tmp();
    put(cur, "chunks/c.js");
    const r = retainStatic({ currentDir: cur, previousDir: prev, buildId: "c", now: 100, maxRetainedBytes: 2500 });
    // p0 (1000) + p1 (2000) + p2 (3000 > cap, but the check happens per build)
    // => after p2 the cap is exceeded and p3 is not retained.
    expect(manifest(cur).builds.map((b) => b.id)).toEqual(["c", "p0", "p1", "p2"]);
    expect(r.retainedBytes).toBe(3000);
    expect(MAX_RETAINED_BYTES).toBe(1024 * 1024 * 1024);
  });

  it("a file shared by several builds survives the older build aging out", () => {
    const prev = tmp();
    put(prev, "chunks/shared.js");
    put(prev, "chunks/old-only.js");
    writeFileSync(
      join(prev, MANIFEST),
      JSON.stringify({
        builds: [
          { id: "newer", builtAt: 100, files: ["chunks/shared.js"] },
          { id: "older", builtAt: 0, files: ["chunks/shared.js", "chunks/old-only.js"] }
        ]
      })
    );
    const cur = tmp();
    put(cur, "chunks/c.js");
    retainStatic({ currentDir: cur, previousDir: prev, buildId: "c", now: 100, maxAgeMs: 50 });
    expect(existsSync(join(cur, "chunks/shared.js"))).toBe(true);
    expect(existsSync(join(cur, "chunks/old-only.js"))).toBe(false);
    expect(manifest(cur).builds.map((b) => b.id)).toEqual(["c", "newer"]);
  });

  it("never overwrites a file the new build produced and does not duplicate shared files", () => {
    const prev = tmp();
    put(prev, "chunks/shared.js", "OLD");
    put(prev, "chunks/only-old.js");
    writeFileSync(join(prev, MANIFEST), JSON.stringify({ builds: [{ id: "p", files: ["chunks/shared.js", "chunks/only-old.js"] }] }));
    const cur = tmp();
    put(cur, "chunks/shared.js", "NEW");
    const r = retainStatic({ currentDir: cur, previousDir: prev, buildId: "n" });
    expect(readFileSync(join(cur, "chunks/shared.js"), "utf8")).toBe("NEW");
    expect(r.copied).toBe(1);
    // the shared file is attributed to the current build only
    expect(manifest(cur).builds[1].files).toEqual(["chunks/only-old.js"]);
  });

  it("is a no-op without a previous directory and still writes the manifest", () => {
    const cur = tmp();
    put(cur, "chunks/a.js");
    const r = retainStatic({ currentDir: cur, previousDir: join(cur, "does-not-exist"), buildId: "solo", now: 7 });
    expect(r.copied).toBe(0);
    expect(manifest(cur).builds).toEqual([{ id: "solo", builtAt: 7, files: ["chunks/a.js"] }]);
  });

  it("keeps a rebuilt commit's earlier files when the same BUILD_ID produced different output", () => {
    const prev = tmp();
    put(prev, "chunks/x.js");
    put(prev, "chunks/only-in-first-build.js");
    writeFileSync(
      join(prev, MANIFEST),
      JSON.stringify({ builds: [{ id: "same", builtAt: 1, files: ["chunks/x.js", "chunks/only-in-first-build.js"] }] })
    );
    const cur = tmp();
    put(cur, "chunks/x.js");
    const r = retainStatic({ currentDir: cur, previousDir: prev, buildId: "same", now: 2 });
    // Identical files cost nothing; the differing one is retained under an id
    // made unique with its build time so the manifest stays unambiguous.
    expect(r.retained).toEqual([{ id: "same#1", builtAt: 1, files: ["chunks/only-in-first-build.js"] }]);
    expect(existsSync(join(cur, "chunks/only-in-first-build.js"))).toBe(true);
    expect(manifest(cur).builds.map((b) => b.id)).toEqual(["same", "same#1"]);

    // A further rebuild of the same commit must not collide with that entry.
    const cur2 = tmp();
    put(cur2, "chunks/x.js");
    put(cur2, "chunks/third-only.js");
    retainStatic({ currentDir: cur2, previousDir: cur, buildId: "same", now: 3 });
    const ids = manifest(cur2).builds.map((b) => b.id);
    expect(ids).toEqual(["same", "same#1"]);
    expect(new Set(ids).size).toBe(ids.length);
    // and with a forged timestamp clash the counter keeps them apart
    const prev3 = tmp();
    put(prev3, "chunks/a.js");
    put(prev3, "chunks/b.js");
    writeFileSync(
      join(prev3, MANIFEST),
      JSON.stringify({
        builds: [
          { id: "same", builtAt: 5, files: ["chunks/a.js"] },
          { id: "same#5", builtAt: 5, files: ["chunks/b.js"] }
        ]
      })
    );
    const cur3 = tmp();
    put(cur3, "chunks/c.js");
    retainStatic({ currentDir: cur3, previousDir: prev3, buildId: "same", now: 6 });
    const ids3 = manifest(cur3).builds.map((b) => b.id);
    expect(ids3).toEqual(["same", "same#5", "same#5-2"]);
  });
});

describe("retain-static wiring", () => {
  it("the Dockerfile pulls the previous image as a stage and runs the merge after copying .next", () => {
    const df = read("apps/web/Dockerfile");
    expect(df).toMatch(/^ARG PREVIOUS_IMAGE=ecency\/vision-web:latest$/m);
    expect(df).toMatch(/^FROM \$\{PREVIOUS_IMAGE\} AS previous$/m);
    const copyNext = df.indexOf("COPY --from=base /var/app/apps/web/.next ./apps/web/.next");
    const run = df.indexOf("RUN --mount=type=bind,from=previous,source=/,target=/previous");
    expect(copyNext).toBeGreaterThan(-1);
    expect(run).toBeGreaterThan(copyNext);
    expect(df.slice(run, run + 200)).toContain("node apps/web/retain-static.js /previous/var/app/apps/web/.next/static");
    // The webpack build cache must not ship: it made the image ~2.8 GB heavier.
    expect(df.indexOf("rm -rf apps/web/.next/cache/webpack")).toBeGreaterThan(df.indexOf("pnpm --filter @ecency/web build"));
    // No COPY of the previous static dir: that would leave a dead layer behind.
    expect(df).not.toContain("COPY --from=previous");
  });

  it.each([
    ["master.yml", "ecency/vision-web:latest"],
    ["staging.yml", "ecency/vision-web:develop"]
  ])("%s pulls the tag it replaces and hands it to the build", (file, tag) => {
    const wf = read(`.github/workflows/${file}`);
    expect(wf).toContain(`tags: ${tag}`);
    expect(wf).toContain("pull: true");
    expect(wf).toContain(`PREVIOUS_IMAGE=${tag}`);
  });
});
