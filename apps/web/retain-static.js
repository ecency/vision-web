#!/usr/bin/env node
/*
 * Keep the previous builds' hashed static assets in the new image (#1615).
 *
 * HTML for post pages is cached at the edge and at the origin nginx for days.
 * That HTML references the chunks of the build that rendered it, and those
 * chunks disappear from the origins the moment a new image rolls out, so a
 * visitor who gets a cached page loads 404s and is hard-reloaded onto the new
 * build: two builds' worth of assets for one page view, for every cached post
 * page, for as long as the cache lives.
 *
 * The Dockerfile bind-mounts the previous image's `.next/static` (first CLI
 * argument; defaults to `.next/static-previous`) and runs this script, which
 * merges the previous builds' files into the new directory (new files win on a
 * clash, which never happens for hashed names) and records which files belong
 * to which build, with its build time, in `retained-builds.json`. A build is
 * kept while it is younger than MAX_AGE_MS: the longest HTML tier
 * (entry-archive / entry-ancient) is s-maxage 30 days, honoured by Cloudflare's
 * standard cache and by the origin nginx (the worker's own cache caps at 7
 * days; stale-while-revalidate does not extend this, the revalidation fetches
 * the new build). MAX_BUILDS and MAX_RETAINED_BYTES are backstops so the image
 * cannot grow without bound: a retained build only adds the files it does not
 * share with newer ones, roughly 1-2 MB for a typical deploy.
 *
 * Stale HTML then renders on the build it was made for. On that visitor's
 * first navigation the old client talks to the new server; Next 15 self-hosted
 * has no deployment-id handshake (the client sends x-deployment-id, nothing
 * reads it), so a chunk mismatch there is caught by the app's own skew handler
 * (utils/deploy-skew.ts) and reloads once. That moves the one reload from
 * page load, where it doubled every cached page view, to the first navigation.
 *
 * Best effort by design: any failure logs and exits 0, leaving exactly the
 * build that `next build` produced.
 */
const fs = require("fs");
const path = require("path");

const MANIFEST = "retained-builds.json";
const MAX_AGE_MS = 31 * 24 * 60 * 60 * 1000;
const MAX_BUILDS = 400;
const MAX_RETAINED_BYTES = 1024 * 1024 * 1024;

function walk(dir, base = dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, base, out);
    else if (entry.isFile()) out.push(path.relative(base, full).split(path.sep).join("/"));
  }
  return out;
}

function readManifest(dir) {
  try {
    const parsed = JSON.parse(fs.readFileSync(path.join(dir, MANIFEST), "utf8"));
    return Array.isArray(parsed.builds) ? parsed.builds : [];
  } catch {
    return null;
  }
}

/**
 * Merge `previousDir` into `currentDir`.
 * @returns {{ current: string, retained: {id: string, builtAt: number, files: string[]}[], copied: number }}
 */
function retainStatic({
  currentDir,
  previousDir,
  buildId,
  now = Date.now(),
  maxAgeMs = MAX_AGE_MS,
  maxBuilds = MAX_BUILDS,
  maxRetainedBytes = MAX_RETAINED_BYTES
}) {
  const currentFiles = walk(currentDir).filter((f) => f !== MANIFEST);
  const result = { current: buildId, retained: [], copied: 0, retainedBytes: 0 };

  if (previousDir && fs.existsSync(previousDir)) {
    let previousBuilds = readManifest(previousDir);
    if (!previousBuilds) {
      // The previous image predates this script: treat everything it shipped
      // as one build, dated now so it gets the full window.
      previousBuilds = [
        { id: "previous", builtAt: now, files: walk(previousDir).filter((f) => f !== MANIFEST) }
      ];
    }
    const current = new Set(currentFiles);
    const usedIds = new Set([buildId]);
    for (const build of previousBuilds) {
      const builtAt = typeof build.builtAt === "number" ? build.builtAt : now;
      // A rebuild of the same commit reuses the BUILD_ID (a short git SHA) and
      // normally the same hashed files, so merging costs nothing; if its output
      // did differ, the earlier files are kept like any other build's, under an
      // id made unique with the build's timestamp (and a counter should even
      // that collide), so repeated rebuilds keep the manifest unambiguous.
      const base = build.id === buildId ? `${build.id}#${builtAt}` : String(build.id);
      let id = base;
      for (let n = 2; usedIds.has(id); n++) id = `${base}-${n}`;
      usedIds.add(id);
      if (now - builtAt > maxAgeMs) continue;
      if (result.retained.length >= maxBuilds) break;
      if (result.retainedBytes >= maxRetainedBytes) break;
      const kept = [];
      for (const rel of build.files || []) {
        if (current.has(rel) || kept.includes(rel)) continue;
        const src = path.join(previousDir, rel);
        if (!fs.existsSync(src)) continue;
        const dest = path.join(currentDir, rel);
        if (!fs.existsSync(dest)) {
          fs.mkdirSync(path.dirname(dest), { recursive: true });
          fs.copyFileSync(src, dest);
          result.copied += 1;
        }
        result.retainedBytes += fs.statSync(dest).size;
        kept.push(rel);
        current.add(rel);
      }
      if (kept.length) result.retained.push({ id, builtAt, files: kept });
    }
  }

  const manifest = {
    builds: [{ id: buildId, builtAt: now, files: currentFiles }, ...result.retained]
  };
  fs.writeFileSync(path.join(currentDir, MANIFEST), JSON.stringify(manifest));
  return result;
}

function main() {
  const appDir = path.resolve(__dirname);
  const currentDir = path.join(appDir, ".next", "static");
  const defaultPrevious = path.join(appDir, ".next", "static-previous");
  const previousDir = process.argv[2] ? path.resolve(process.argv[2]) : defaultPrevious;
  let buildId = "unknown";
  try {
    buildId = fs.readFileSync(path.join(appDir, ".next", "BUILD_ID"), "utf8").trim() || buildId;
  } catch {
    /* keep "unknown" */
  }
  try {
    const r = retainStatic({ currentDir, previousDir, buildId });
    console.log(
      `[retain-static] build ${r.current}: kept ${r.retained.length} previous build(s) ` +
        `(${r.retained.map((b) => `${b.id}:${b.files.length}`).join(", ") || "none"}), ` +
        `copied ${r.copied} file(s), ${(r.retainedBytes / 1048576).toFixed(1)} MB retained`
    );
  } catch (e) {
    console.warn("[retain-static] skipped:", e && e.message ? e.message : e);
  } finally {
    // Only an in-tree copy is ours to remove; a bind mount is read-only and
    // disappears with the build step.
    if (previousDir === defaultPrevious) {
      try {
        fs.rmSync(previousDir, { recursive: true, force: true });
      } catch {
        /* nothing to clean */
      }
    }
  }
}

if (require.main === module) main();

module.exports = { retainStatic, walk, MANIFEST, MAX_AGE_MS, MAX_BUILDS, MAX_RETAINED_BYTES };
