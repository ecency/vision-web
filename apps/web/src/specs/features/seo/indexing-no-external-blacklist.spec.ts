import fs from "fs";
import path from "path";

/**
 * Indexability may not depend on a third-party abuse list.
 *
 * `isIndexable()` used to take a `blacklist` set, filled from
 * `spaminator.me/api/bl/all.json` (~202k accounts) via a Redis set, and treat
 * membership as an unconditional noindex. Measured over 12 months that
 * suppressed 8.3% of Ecency-originated posts, including authors at reputation
 * 70+ with thousands of posts, and the sitemap cron additionally refused to
 * publish until the refresh succeeded — so an unreachable source stalled
 * sitemap regeneration (#1524).
 *
 * The unit tests next door cannot catch a regression here: once the parameter
 * is gone there is no way to express "this author is blacklisted" against
 * `isIndexable()`, so any such test would pass against the old code too. The
 * check therefore has to be on the import graph and the Redis key, the two
 * places the dependency actually lived.
 *
 * Abuse is still handled — downvotes cut reputation, and the reputation gate
 * rejects the author on the next render — so reintroducing an external feed
 * should be a deliberate, reviewed decision rather than a quiet import.
 */

const SRC = path.resolve(__dirname, "../../..");
const REPO = path.resolve(__dirname, "../../../../../..");

// Deploy config is part of the dependency surface: the first cleanup left
// SEO_BLACKLIST_URL wired through both deploy workflows after the code was
// gone, because this guard only scanned application source.
const CONFIG_FILES = [
  ".github/workflows/staging.yml",
  ".github/workflows/master.yml",
  "apps/web/docker-compose.yml",
  "apps/web/docker-compose.production.yml"
];

// The deleted boundary module, its Redis key, and the env var that fed it.
const FORBIDDEN: { pattern: RegExp; what: string }[] = [
  { pattern: /features\/seo\/blacklist-check/, what: "the deleted blacklist-check module" },
  { pattern: /blacklist:authors/, what: "the blacklist:authors Redis key" },
  { pattern: /SEO_BLACKLIST_URL/, what: "the SEO_BLACKLIST_URL env var" },
  { pattern: /spaminator/i, what: "the spaminator feed" }
];

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === "specs") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(entry.name)) out.push(full);
  }
  return out;
}

describe("indexing does not depend on an external blacklist (#1524)", () => {
  const files = walk(SRC);

  it("finds source files to scan (guards against a broken walk)", () => {
    expect(files.length).toBeGreaterThan(100);
  });

  it.each(FORBIDDEN)("no module references $what", ({ pattern }) => {
    const offenders = files.filter((f) => pattern.test(fs.readFileSync(f, "utf8")));
    expect(offenders.map((f) => path.relative(SRC, f))).toEqual([]);
  });

  it.each(CONFIG_FILES)("%s carries no blacklist wiring", (rel) => {
    const full = path.join(REPO, rel);
    // Fail loudly rather than skipping: a silent pass on a missing path is how
    // a guard rots into a no-op (it did exactly that while REPO was wrong).
    expect(fs.existsSync(full), `${rel} not found at ${full}`).toBe(true);
    const text = fs.readFileSync(full, "utf8");
    const hits = FORBIDDEN.filter(({ pattern }) => pattern.test(text)).map((f) => f.what);
    expect(hits).toEqual([]);
  });

  it("isIndexable takes no blacklist parameter", () => {
    const src = fs.readFileSync(path.join(SRC, "utils/entry-indexability.ts"), "utf8");
    const signature = src.slice(src.indexOf("export function isIndexable"));
    expect(signature.slice(0, signature.indexOf("): boolean"))).not.toMatch(/blacklist/i);
  });
});
