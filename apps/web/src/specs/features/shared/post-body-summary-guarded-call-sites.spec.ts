import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

/**
 * The call sites that run `postBodySummary` on a body the app did not slim.
 *
 * The twin of catch-post-image-guarded-call-sites, for the other
 * author-controlled string a card renders. Feed rows normally arrive with
 * `body: ""` (slimEntry), which starves the markdown renderer, but four paths
 * carry a FULL body here:
 *   - slimEntrySafely returns the un-slimmed entry when slimming throws
 *     (core/entries/slim-entry.ts),
 *   - BODY_BACKED_SECTIONS skips slimming for the comments/replies profile
 *     feeds (api/queries/get-account-posts-feed-query.ts, reachable as
 *     /feed/comments/@user and /feed/replies/@user),
 *   - the profile's pinned entry is fetched through the post cache, unslimmed,
 *   - search rows are never slimmed at all.
 * The slimmer itself is a fifth: it calls entrySummary on the full body of
 * every row of every ranked feed to derive `description`, inside the queryFn.
 *
 * A throw at the card reader is a blank route, not a missing excerpt: it runs
 * during the SSR render of the feed, profile and community routes, which have
 * no Suspense boundary above their cards any more (#1786 and siblings) and no
 * route error.tsx (see app/global-error.tsx for why neither is coming back).
 */
const SRC = path.resolve(__dirname, "../../..");

const SITES: { file: string; calls: number }[] = [
  // The card reader: two passes in summarizeText (capped, then untruncated)
  // plus the body fallback in entrySummary.
  { file: "core/entries/entry-summary.ts", calls: 3 },
  { file: "features/shared/search-list-item/search-summary.tsx", calls: 1 }
];

const read = (file: string) => fs.readFileSync(path.join(SRC, file), "utf8");

// Cards and search rows read their summary without the markdown renderer
// (postBodyTextSafely over getPostBodyText, #2113); both guards share the
// report-once failure handling.
describe("card and search summaries go through the summary guard", () => {
  it.each(SITES)("$file imports the guard, not a raw export", ({ file }) => {
    const source = read(file);
    expect(source).toMatch(
      /import\s*{\s*postBodyTextSafely\s*}\s*from\s*"[^"]*post-body-text-safely"/
    );
    // Only the guard module may import the summary functions from the package here.
    expect(source).not.toMatch(
      /import\s*{[^}]*\b(?:postBodySummary|getPostBodyText)\b[^}]*}\s*from\s*"@ecency\/render-helper"/
    );
  });

  it.each(SITES)("$file makes all $calls of its calls through the guard", ({ file, calls }) => {
    const source = read(file);
    expect(source.match(/postBodyTextSafely\s*\(/g)?.length ?? 0).toBe(calls);
    expect(source.match(/(?<!Safely)\b(?:postBodySummary|getPostBodyText)\s*\(/g)).toBeNull();
  });

  // The card component reaches the reader through this module, so the pin above
  // is only worth something while that import is still the one it uses.
  it("the muted-content card still reads its summary through entrySummary", () => {
    const source = read("features/shared/entry-list-item/entry-list-item-muted-content.tsx");
    expect(source).toContain('from "@/core/entries/entry-summary"');
    expect(source).toMatch(/entrySummary\(entry\)/);
  });

  // The search rows reach the guard through searchSummary; the pin above covers
  // them only while both still use it, and call no summary reader directly.
  // Each row's excerpt JSX shows the value searchSummary produced, not the
  // raw body: `rendered` is how that value appears in the markup.
  it.each([
    ["features/shared/search-list-item/index.tsx", 1, /const summary = useMemo\(\s*\(\) => searchSummary\(/, "{summary}"],
    [
      "app/decks/_components/columns/deck-items/deck-search-list-item.tsx",
      2,
      /useState\(\s*searchSummary\(/,
      "{body}"
    ]
  ])("%s reads its excerpt through searchSummary", (file, calls, binding, rendered) => {
    const source = read(file);
    expect(source).toMatch(/import\s*{\s*searchSummary\s*}\s*from\s*"[^"]*search-summary"/);
    expect(source.match(/searchSummary\s*\(/g)?.length ?? 0).toBe(calls);
    expect(source).toMatch(binding);
    expect(source).toContain(rendered);
    expect(source).not.toMatch(/[{(]\s*(?:res|entry)\.body\s*[})]/);
    // Whitespace before the parenthesis is still a call.
    expect(source).not.toMatch(/\b(?:postBodyTextSafely|postBodySummary|getPostBodyText)\s*\(/);
  });

  it("the guard swallows the throw and reports rather than rethrowing", () => {
    const source = read("core/entries/post-body-summary-safely.ts");
    expect(source).toMatch(/catch\s*\([\s\S]*?\)\s*{[\s\S]*?return "";/);
    expect(source).toMatch(/reportRenderHelperFailureOnce\(\s*"postBodySummary"/);
    // The card summary guard sits apart and imports only getPostBodyText, so a
    // card never imports postBodySummary and its Remarkable (#2113).
    const text = read("core/entries/post-body-text-safely.ts");
    expect(text).toMatch(/reportRenderHelperFailureOnce\(\s*"getPostBodyText"/);
    expect(text).not.toMatch(/\bpostBodySummary\b/);
  });

  // The two guards share one dedupe set, so the call site has to be part of the
  // key: a body that breaks both extractors has two defects. Reporting only
  // whichever ran first would hide one of them.
  it("the shared reporter keys on the call site as well as the post", () => {
    const source = read("core/entries/report-render-helper-failure.ts");
    expect(source).toMatch(/`\$\{where\}\|\$\{entry\}`/);
  });
});
