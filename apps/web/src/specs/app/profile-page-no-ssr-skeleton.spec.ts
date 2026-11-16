import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

// The profile index ships its feed cards inside the SSR shell. page.tsx awaits
// the account, the first feed page and the pinned entry before it returns any
// JSX, so a Suspense boundary above it is emitted PENDING: the skeleton goes in
// the shell and the cards land in a hidden <div id="S:n"> chunk that a $RC swap
// script reveals only once the parser reaches it. On a throttled phone that
// swap runs well after the HTML has arrived (#1783, #1778).
//
// This route is the one in the series where the win is NOT LCP. Its LCP element
// is the profile header, which the layout renders outside the boundary, and the
// baseline already reflects that (LCP 2.07s, start render 2.00s). What moves is
// the feed: 2 hidden segments and a $RC swap on that baseline.
//
// And it can cut the other way. With no boundary above the page, nothing
// flushes until the page's awaits resolve — the account fetch, the feed fetch
// and, for accounts with a pinned post, a second hop that depends on the first
// — so the header itself now waits on work it used to paint ahead of. Whether
// the cards arriving early beats the header arriving later is a measurement,
// not an argument: it is checked on alpha after this lands, against test
// 260909_7C_P, and reverted if start render or LCP regresses.
//
// A loading module is such a boundary for its OWN segment AND for every segment
// nested under it, which is why profile/[username]/loading.tsx had to go rather
// than move: it covered the profile index and, with it, every profile tab.
// Each tab that relied on it got its own leaf module instead (below), so no tab
// lost its pending UI — except wallet/ and [section]/, which are deliberately
// left with none.
const APP = path.resolve(__dirname, "../../app");
const PROFILE = path.join(APP, "(dynamicPages)/profile");
const ROUTE = path.join(PROFILE, "[username]");
const SEGMENTS = [ROUTE, PROFILE, path.join(APP, "(dynamicPages)"), APP];
const LOADING_NAMES = ["loading.tsx", "loading.ts", "loading.jsx", "loading.js"];

// The tabs that inherited profile/[username]/loading.tsx and therefore had to
// be handed their own.
const TABS_WITH_LEAF_LOADING = [
  "communities",
  "followers",
  "following",
  "insights",
  "notifications",
  "permissions",
  "referrals",
  "settings",
  "trail"
];

// The tabs that must NOT have one, for two different reasons.
//
// wallet/: a loading module there would apply to every segment nested under it,
// and wallet/(token)/[token] renders post bodies through EcencyRenderer
// (hive-engine-token-history.tsx). A boundary above a markdown renderer
// recreates precisely the defect this change removes.
//
// [section]/: serves /@user/{posts,blog,comments,replies} and had its own
// module until #1805 measured what it cost — the first card at 69.2% of the
// document on /@ecency/comments against 15.2% on the fixed index. It is the
// same defect as the index's, one segment down, and it is pinned in detail by
// profile-section-page-no-ssr-skeleton.spec.ts.
const TAB_WITHOUT_LOADING = "wallet";
const TABS_WITHOUT_LOADING = ["[section]", TAB_WITHOUT_LOADING];

function hasLoadingModule(dir: string) {
  return LOADING_NAMES.some((name) => fs.existsSync(path.join(dir, name)));
}

function tabSegments() {
  return fs
    .readdirSync(ROUTE, { withFileTypes: true })
    .filter((e) => e.isDirectory() && !e.name.startsWith("_"))
    .map((e) => e.name)
    .filter((name) => fs.existsSync(path.join(ROUTE, name, "page.tsx")))
    .sort();
}

function pageSource() {
  return fs.readFileSync(path.join(ROUTE, "page.tsx"), "utf8");
}

describe("profile page has no SSR skeleton boundary above the feed cards", () => {
  it("route directory exists", () => {
    expect(fs.existsSync(path.join(ROUTE, "page.tsx"))).toBe(true);
  });

  it("has no loading module on the route or on any ancestor segment", () => {
    for (const dir of SEGMENTS) {
      for (const name of LOADING_NAMES) {
        expect(
          fs.existsSync(path.join(dir, name)),
          `${path.relative(APP, dir) || "app"}/${name}`
        ).toBe(false);
      }
    }
  });

  // Deleting the parent module must not have cost any tab its pending UI. Each
  // of these is a leaf: it covers its own segment only, never the index.
  it("gives every tab that relied on the parent module its own leaf module", () => {
    for (const tab of TABS_WITH_LEAF_LOADING) {
      const dir = path.join(ROUTE, tab);
      expect(fs.existsSync(path.join(dir, "page.tsx")), `${tab}/page.tsx`).toBe(true);
      expect(hasLoadingModule(dir), `${tab}/loading.tsx`).toBe(true);
    }
  });

  // The [section] tab is pinned in full next door; this route's own guard only
  // has to know that the tab is NOT relying on a module here, because a module
  // at [section]/ is invisible to the index's checks above.
  it("leaves the [section] tab without a loading module", () => {
    const dir = path.join(ROUTE, "[section]");
    expect(fs.existsSync(path.join(dir, "page.tsx")), "[section]/page.tsx").toBe(true);
    expect(hasLoadingModule(dir), "[section]/loading.tsx").toBe(false);
  });

  it("leaves wallet without a loading module, on its own segment and below it", () => {
    const wallet = path.join(ROUTE, TAB_WITHOUT_LOADING);
    expect(fs.existsSync(path.join(wallet, "page.tsx"))).toBe(true);
    expect(hasLoadingModule(wallet), "wallet/loading.tsx").toBe(false);

    // Only the segments that WRAP the token route are off limits. The wallet
    // index and the hp page could each take a leaf module later (scoped by a
    // route group, the way app/waves/(feed) is) without touching the token
    // history, and this check must not stand in the way of that.
    const tokenRoute = path.join(wallet, "(token)/[token]");
    const chain = path
      .relative(ROUTE, tokenRoute)
      .split(path.sep)
      .filter((seg) => !seg.startsWith("("));
    const wrapping: string[] = [];
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (!entry.isDirectory() || entry.name.startsWith("_")) continue;
        const child = path.join(dir, entry.name);
        const segs = path
          .relative(ROUTE, child)
          .split(path.sep)
          .filter((seg) => !seg.startsWith("("));
        if (hasLoadingModule(child) && segs.every((seg, i) => chain[i] === seg)) {
          wrapping.push(path.relative(ROUTE, child));
        }
        walk(child);
      }
    };
    walk(wallet);
    expect(wrapping, "loading modules wrapping the token history route").toEqual([]);

    // The exclusion is only defensible while a markdown renderer still sits
    // under this segment; if that moves, the reason has to be revisited rather
    // than silently inherited.
    const history = path.join(
      wallet,
      "(token)/[token]/_components/hive-engine-token-history.tsx"
    );
    expect(fs.existsSync(history), history).toBe(true);
    expect(fs.readFileSync(history, "utf8")).toMatch(/EcencyRenderer/);

    // ...and while the reason is written down where the next reader will be.
    const walletPage = fs.readFileSync(path.join(wallet, "page.tsx"), "utf8");
    expect(walletPage).toMatch(/NO loading\.tsx in this directory, on purpose/);
  });

  // A new tab added later must make the same decision explicitly: either a leaf
  // module, or the wallet-style exclusion. Inheriting nothing by accident is
  // how the tabs would quietly lose their pending UI.
  it("accounts for every tab segment under the route", () => {
    expect(tabSegments()).toEqual(
      [...TABS_WITH_LEAF_LOADING, ...TABS_WITHOUT_LOADING].sort()
    );
  });

  // Anchoring "before the list" on a marker is fragile here: the page renders
  // two branches (search results and the entries list) and a boundary around
  // only the second one still sits after the first marker. The page has no
  // legitimate use for a boundary at all, so forbid the lot, either spelling.
  it("renders no <Suspense> anywhere in the page", () => {
    const source = pageSource();
    const fn = source.indexOf("export default async function Page");
    expect(fn).toBeGreaterThan(-1);
    expect(source).not.toMatch(/<(React\.)?Suspense/);
    expect(source).not.toMatch(/\bSuspense\b[^\n]*from "react"/);
    // The markers this route actually ships, so the check above cannot go green
    // by the page rendering nothing.
    expect(source).toMatch(/<ProfileEntriesList/);
    expect(source).toMatch(/<ProfileSearchContent/);
  });

  it("no route or ancestor layout adds Suspense above the page", () => {
    let checked = 0;
    for (const dir of SEGMENTS) {
      for (const name of ["layout.tsx", "template.tsx"]) {
        const file = path.join(dir, name);
        if (!fs.existsSync(file)) continue;
        checked += 1;
        expect(fs.readFileSync(file, "utf8"), path.relative(APP, file)).not.toMatch(/<(React\.)?Suspense/);
      }
    }
    // The profile layout and the root layout at least.
    expect(checked).toBeGreaterThanOrEqual(2);
  });

  // page.tsx hands the account and the prefetched feed to ProfileEntriesList,
  // which reaches the rendered card title through the files below. A <Suspense>
  // inside any of them would hide the cards again without touching page.tsx, so
  // they are pinned too.
  it("no component between the page and the rendered cards adds Suspense", () => {
    const chain = [
      path.join(ROUTE, "_components/profile-entries-list.tsx"),
      path.join(ROUTE, "_components/profile-entries-layout.tsx"),
      path.resolve(__dirname, "../../features/shared/entry-list-content/index.tsx"),
      path.resolve(__dirname, "../../features/shared/entry-list-item/index.tsx"),
      path.resolve(
        __dirname,
        "../../features/shared/entry-list-item/entry-list-item-muted-content.tsx"
      )
    ];
    for (const file of chain) {
      expect(fs.existsSync(file), file).toBe(true);
      expect(fs.readFileSync(file, "utf8"), file).not.toMatch(/<(React\.)?Suspense/);
    }
    // The chain list is only worth something if it still ends at the card.
    const card = fs.readFileSync(chain[chain.length - 1], "utf8");
    expect(card).toMatch(/item-title/);
    expect(card).toMatch(/EntryListItemThumbnail/);
  });

  // The route children reach this page through a chain of wrappers, not just
  // the last one: RootLayout -> Providers -> NewsletterRuntimeProvider ->
  // ClientProviders -> {children}. A <Suspense> around {children} in ANY of
  // them hides every page body in the app behind a swap script, and a guard
  // that reads only client-providers.tsx leaves the first two unwatched.
  it("no provider in the root wrapper chain puts the route children in Suspense", () => {
    const chain = [
      path.join(APP, "providers.tsx"),
      path.resolve(APP, "../features/newsletter/runtime.tsx"),
      path.join(APP, "client-providers.tsx")
    ];
    let sawChildren = 0;
    for (const file of chain) {
      expect(fs.existsSync(file), file).toBe(true);
      const source = fs.readFileSync(file, "utf8");
      if (/\{(props\.)?children\}/.test(source)) sawChildren += 1;
      const blocks =
        source.match(/<(React\.)?Suspense\b[^>]*>[\s\S]*?<\/(React\.)?Suspense>/g) ?? [];
      for (const boundary of blocks) {
        expect(boundary, file).not.toMatch(/\{(props\.)?children\}/);
      }
    }
    // Every file in the chain must actually hand children on, or the list has
    // drifted from the tree it claims to describe.
    expect(sawChildren).toBe(chain.length);
  });
});
