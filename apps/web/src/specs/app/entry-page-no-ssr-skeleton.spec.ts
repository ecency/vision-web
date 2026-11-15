import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

// The entry route ships the post body inside the SSR shell, and nothing above
// the body may be a Suspense boundary. Two mechanisms turn such a boundary into
// a hidden <div id="S:n"> chunk plus a $RC swap script that only reveals the
// body once the parser reaches it (on a starved main thread that was seconds
// after the HTML had arrived, so LCP was the swap, not the paint):
//  1. A boundary whose subtree AWAITS (loading.tsx around the page, which
//     awaits network before returning JSX, or a <Suspense> containing an async
//     server component) is emitted pending: fallback in the shell, content
//     later.
//  2. A boundary whose subtree resolves synchronously is still outlined when
//     it is over 500 bytes and the shell has passed React's
//     progressiveChunkSize (12.8 KB). The head + navbar ahead of the body
//     already exceed that, so a <Suspense> around EntryPageContentSSR would
//     be written as a pending placeholder + hidden chunk even though it is
//     complete (react-dom-server flushSegment / isEligibleForOutlining).
// Hence: no loading module on any segment, and no <Suspense> at or above the
// post body in page.tsx. The related-footer Suspense is fine because it sits
// BELOW the body.
const APP = path.resolve(__dirname, "../../app");
const ROUTE = path.join(APP, "(dynamicPages)/entry/[category]/[author]/[permlink]");
const SEGMENTS = [
  ROUTE,
  path.join(APP, "(dynamicPages)/entry/[category]/[author]"),
  path.join(APP, "(dynamicPages)/entry/[category]"),
  path.join(APP, "(dynamicPages)/entry"),
  path.join(APP, "(dynamicPages)"),
  APP
];

function pageSource() {
  return fs.readFileSync(path.join(ROUTE, "page.tsx"), "utf8");
}

describe("entry page has no SSR skeleton boundary above the post body", () => {
  it("route directory exists", () => {
    expect(fs.existsSync(path.join(ROUTE, "page.tsx"))).toBe(true);
  });

  it("has no loading.tsx on the route or on any ancestor segment", () => {
    for (const dir of SEGMENTS) {
      for (const name of ["loading.tsx", "loading.ts", "loading.jsx", "loading.js"]) {
        expect(fs.existsSync(path.join(dir, name)), `${path.relative(APP, dir) || "app"}/${name}`).toBe(false);
      }
    }
  });

  it("renders no <Suspense> before the post body anywhere in the page function", () => {
    // Scans from the page component to the body, not just the slice between
    // EntryRenderBoundary and the body: a <Suspense fallback={<Skeleton/>}>
    // placed ABOVE the render boundary is the most natural way to bring the
    // skeleton back, and the slice-only check let it through. Prose comments
    // mention Suspense without the "<", which keeps this green on purpose.
    const source = pageSource();
    const fn = source.indexOf("export default async function EntryPage");
    const body = source.indexOf("<EntryPageContentSSR");
    expect(fn).toBeGreaterThan(-1);
    expect(body).toBeGreaterThan(fn);
    const firstSuspense = source.indexOf("<Suspense", fn);
    expect(firstSuspense === -1 || firstSuspense > body).toBe(true);
  });

  it("does not wrap the post body in Suspense", () => {
    const source = pageSource();
    const start = source.indexOf("<EntryRenderBoundary>");
    const body = source.indexOf("<EntryPageContentSSR");
    expect(start).toBeGreaterThan(-1);
    expect(body).toBeGreaterThan(start);
    expect(source.slice(start, body)).not.toMatch(/<Suspense/);
  });

  it("keeps the related-footer Suspense below the body", () => {
    const source = pageSource();
    const body = source.indexOf("<EntryPageContentSSR");
    const related = source.indexOf("<Suspense fallback={null}>");
    expect(related).toBeGreaterThan(body);
  });

  it("no route or ancestor layout adds Suspense above the page", () => {
    let checked = 0;
    for (const dir of SEGMENTS) {
      for (const name of ["layout.tsx", "template.tsx"]) {
        const file = path.join(dir, name);
        if (!fs.existsSync(file)) continue;
        checked += 1;
        expect(fs.readFileSync(file, "utf8"), path.relative(APP, file)).not.toMatch(/<Suspense/);
      }
    }
    // The route layout and the root layout at least.
    expect(checked).toBeGreaterThanOrEqual(2);
  });

  // The root layout hands {children} to ClientProviders, which mounts its own
  // lazy widgets inside Suspense. Those boundaries must never enclose the
  // route children, or every page body would be hidden behind a swap.
  it("client providers keep the route children outside every Suspense", () => {
    const source = fs.readFileSync(path.join(APP, "client-providers.tsx"), "utf8");
    expect(source).toMatch(/\{props\.children\}/);
    const blocks = source.match(/<Suspense\b[^>]*>[\s\S]*?<\/Suspense>/g) ?? [];
    expect(blocks.length).toBeGreaterThan(0);
    for (const block of blocks) {
      expect(block).not.toMatch(/\{(props\.)?children\}/);
    }
  });

  // page.tsx hands the body to EntryPageContentSSR, which reaches #post-body
  // through the files below. A <Suspense> inside any of them would hide the
  // body again without touching page.tsx, so they are pinned too.
  it("no component between the page and #post-body adds Suspense", () => {
    const chain = [
      "entry-page-content-ssr.tsx",
      "entry-page-nsfw-body-wrapper.tsx",
      "entry-page-nsfw-revealing.tsx",
      "entry-page-static-body.tsx",
      "entry-page-body-html.tsx",
      "entry-page-raw-body.tsx"
    ].map((name) => path.join(ROUTE, "_components", name));
    for (const file of chain) {
      expect(fs.existsSync(file), path.relative(APP, file)).toBe(true);
      expect(fs.readFileSync(file, "utf8"), path.relative(APP, file)).not.toMatch(/<Suspense/);
    }
    // The chain list is only worth something if it still ends at the body.
    const emitters = chain.filter((file) =>
      /id="post-body"/.test(fs.readFileSync(file, "utf8"))
    );
    expect(emitters.length).toBeGreaterThan(0);
  });
});
