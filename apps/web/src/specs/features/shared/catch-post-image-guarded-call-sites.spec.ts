import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

/**
 * Where `catchPostImage` may be called raw, and where it may not.
 *
 * The extractor's last tier is `markdown2Html` + a DOM parse over an
 * author-written body. That tier is reachable from every call site that is
 * handed a real body and finds no image in `json_metadata` or by regex, and it
 * has thrown on author input before (a numeric character reference above
 * U+10FFFF raised a RangeError out of `sanitizeHtml`; fixed at source in
 * @ecency/render-helper, and the app builds the package from source, so this
 * is about the NEXT one).
 *
 * What a throw costs is not "one missing image". apps/web has a single
 * `app/global-error.tsx` and no per-segment `error.tsx`, so there is no
 * boundary that turns a throw into a degraded row: on the server it fails the
 * response, in the browser it replaces the whole app with the error screen.
 *
 * Feed rows normally arrive with `body: ""` (slimEntry), which starves the
 * markdown tier, but a full body still reaches these calls three ways:
 *   - slimEntrySafely / cardOnlyEntryPage hand back the UN-slimmed entry when
 *     slimming throws (core/entries/slim-entry.ts),
 *   - BODY_BACKED_SECTIONS skips slimming for the comments/replies profile
 *     feeds (api/queries/get-account-posts-feed-query.ts),
 *   - the profile's pinned entry is fetched through the post cache, unslimmed.
 * Search rows, drafts, schedules, RSS items and the proposal body are never
 * slimmed at all — those carry a full body by design.
 *
 * So: every apps/web call site that is handed an author-written body goes
 * through `catchPostImageSafely`. The exceptions below are listed by name with
 * their reason, so the decision is pinned rather than implicit, and the sweep
 * at the bottom stops a new file from quietly joining them.
 */
const SRC = path.resolve(__dirname, "../../..");

/** Call sites routed through the guard, with how many calls each makes. */
const GUARDED: { file: string; calls: number }[] = [
  // #1790 — the four that render inside a route's SSR shell.
  // Full-size thumbnail + the LQIP placeholder behind it.
  { file: "features/shared/entry-list-item/entry-list-item-thumbnail.tsx", calls: 2 },
  { file: "features/shared/search-list-item/index.tsx", calls: 1 },
  // #1795 — the rest of the app.
  // Full bodies by design: RSS items, the user's own drafts and scheduled
  // posts, search rows in a deck column, and the proposal page's own body.
  { file: "features/rss/entries-rss-handler.ts", calls: 1 },
  { file: "features/shared/drafts/draft-list-item.tsx", calls: 1 },
  { file: "features/shared/schedules/scheduled-list-item.tsx", calls: 1 },
  { file: "app/decks/_components/columns/deck-items/deck-search-list-item.tsx", calls: 1 },
  { file: "app/proposals/[id]/page.tsx", calls: 1 },
  // Slim by default, full body only via the slimming backstop — the same risk
  // class as the feed card, on the homepage and the entry page.
  { file: "app/_components/landing-page/landing-trending.tsx", calls: 1 },
  {
    file:
      "app/(dynamicPages)/entry/[category]/[author]/[permlink]/_components/entry-related-item.ts",
    calls: 2
  }
];

/**
 * Call sites that keep the raw export, and why. Each is checked for the reason
 * that makes it safe, so the reason cannot quietly stop being true.
 */
const UNGUARDED_BY_DESIGN: { file: string; why: string; proof: RegExp }[] = [
  {
    file: "features/structured-data/index.tsx",
    why: "carries its own try/catch around the call (an Article without an image beats a 500)",
    proof: /try\s*{\s*\n\s*image = catchPostImage\([\s\S]*?\n\s*}\s*catch\s*{/
  },
  {
    file: "app/(dynamicPages)/entry/_helpers/entry-card-fields.ts",
    why: "carries its own try/catch (generateMetadata's outer catch would drop title, cards, canonical and robots)",
    proof: /try\s*{\s*\n\s*image = catchPostImage\([\s\S]*?\n\s*}\s*catch\s*{/
  },
  {
    file: "core/entries/slim-entry.ts",
    why: "fast mode never renders markdown, and the call already sits inside slimEntrySafely's try/catch",
    proof: /catchPostImage\(entry, 0, 0, "match", { fast: true }\)/
  },
  {
    file:
      "app/(dynamicPages)/entry/[category]/[author]/[permlink]/_components/similar-entries/similar-entry-item.tsx",
    why: "is handed a search-index URL, not author markdown, and renders only on the deleted-post screen",
    proof: /catchPostImage\(entry\.img_url,/
  }
];

/** The guard module itself, which is the only file that may wrap the export. */
const GUARD_MODULE = "core/entries/catch-post-image-safely.ts";

const read = (file: string) => fs.readFileSync(path.join(SRC, file), "utf8");

/** A named import of `catchPostImage` (not `...Safely`) from the package. */
const IMPORTS_RAW = /import\s*(?:type\s*)?{([^}]*)}\s*from\s*["']@ecency\/render-helper["']/g;

function importsRawExport(source: string, name = "catchPostImage"): boolean {
  IMPORTS_RAW.lastIndex = 0;
  for (const m of source.matchAll(IMPORTS_RAW)) {
    const names = m[1].split(",").map((n) => n.trim().split(/\s+as\s+/)[0].trim());
    if (names.includes(name)) {
      return true;
    }
  }
  return false;
}

function walk(dir: string, out: string[] = []): string[] {
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    if (fs.statSync(full).isDirectory()) {
      if (name === "node_modules" || name === ".next") {
        continue;
      }
      walk(full, out);
    } else if (name.endsWith(".ts") || name.endsWith(".tsx")) {
      out.push(path.relative(SRC, full));
    }
  }
  return out;
}

describe("catchPostImage call sites go through the guard", () => {
  it.each(GUARDED)("$file imports the guard, not the raw export", ({ file }) => {
    const source = read(file);
    expect(source).toMatch(
      /import\s*{[^}]*\bcatchPostImageSafely\b[^}]*}\s*from "@\/core\/entries\/catch-post-image-safely";/
    );
    expect(importsRawExport(source)).toBe(false);
  });

  it.each(GUARDED)("$file makes all $calls of its calls through the guard", ({ file, calls }) => {
    const source = read(file);
    expect(source.match(/catchPostImageSafely\(/g)?.length ?? 0).toBe(calls);
    expect(source.match(/(?<!Safely)\bcatchPostImage\(/g)).toBeNull();
  });

  it("the guard swallows the throw and reports rather than rethrowing", () => {
    const source = read(GUARD_MODULE);
    expect(source).toMatch(/catch\s*\([\s\S]*?\)\s*{[\s\S]*?return null;/);
    // The report-once bookkeeping moved into report-render-helper-failure.ts,
    // shared with the summary guard; the guard must still call it.
    expect(source).toMatch(/reportRenderHelperFailureOnce\(\s*"catchPostImage"/);
    expect(read("core/entries/report-render-helper-failure.ts")).toContain("reportedFailures");
  });
});

describe("the call sites that keep the raw export", () => {
  it.each(UNGUARDED_BY_DESIGN)("$file $why", ({ file, proof }) => {
    expect(read(file)).toMatch(proof);
  });

  it("is the complete list — no other file in apps/web reaches for the raw export", () => {
    const allowed = new Set([GUARD_MODULE, ...UNGUARDED_BY_DESIGN.map((s) => s.file)]);
    const offenders = walk(SRC)
      // Specs mock the module by name; only production code is in scope here.
      .filter((f) => !f.startsWith("specs" + path.sep))
      .filter((f) => !allowed.has(f.split(path.sep).join("/")))
      .filter((f) => importsRawExport(read(f)));

    expect(offenders).toEqual([]);
  });
});

/**
 * The card's animated-cover check reads the same metadata and body as the
 * extractor's first tier, on the same entry, in the same SSR render. Left raw,
 * a body that breaks that scan is caught by catchPostImageSafely and then
 * thrown again by this call, with no boundary above the profile tabs (#1805),
 * the feed or the community routes to contain it.
 */
describe("getEntryCardImageRawUrl goes through its guard", () => {
  const THUMBNAIL = "features/shared/entry-list-item/entry-list-item-thumbnail.tsx";

  it("the feed card makes its one call through the guard", () => {
    const source = read(THUMBNAIL);
    expect(source.match(/getEntryCardImageRawUrlSafely\(/g)?.length ?? 0).toBe(1);
    expect(source.match(/(?<!Safely)\bgetEntryCardImageRawUrl\(/g)).toBeNull();
  });

  it("the guard swallows the throw and reports rather than rethrowing", () => {
    const source = read(GUARD_MODULE);
    expect(source).toMatch(
      /getEntryCardImageRawUrl\(\.\.\.args\);\s*}\s*catch\s*\(e\)\s*{\s*reportRenderHelperFailureOnce\(\s*"getEntryCardImageRawUrl"[\s\S]*?return null;/
    );
  });

  it("no other file in apps/web reaches for the raw export", () => {
    const offenders = walk(SRC)
      .filter((f) => !f.startsWith("specs" + path.sep))
      .filter((f) => f.split(path.sep).join("/") !== GUARD_MODULE)
      .filter((f) => importsRawExport(read(f), "getEntryCardImageRawUrl"));

    expect(offenders).toEqual([]);
  });
});
