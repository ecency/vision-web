import React from "react";
import { describe, expect, it, vi } from "vitest";
import { QueryClientProvider } from "@tanstack/react-query";
import { ARCHIVE_PAGE_SIZE } from "@/app/(dynamicPages)/profile/[username]/_helpers/author-archive";

// Streams the real profile TAB page — /@user/{posts,blog,comments,replies} —
// through React's server renderer and asserts on the HTML a browser would
// receive: the cards must be part of the shell, never inside a hidden segment
// that a later swap script reveals (#1805).
//
// progressiveChunkSize is forced tiny so React outlines any completed Suspense
// boundary the way it does in production, where the head, navbar and profile
// card alone exceed the 12.8 KB default: a <Suspense> re-introduced anywhere
// above the list shows up here as `<div hidden id="S:n">` around the cards and
// fails the test. A route-level loading.tsx cannot be exercised through a
// component render; the structure spec next to this one pins its absence, on
// the route AND on every ancestor segment.
//
// Two of the page's three branches are streamed. The default branch renders
// ProfileEntriesList (server page 1 + infinite list); `?before=` renders
// ProfileEntriesArchive (a fully server-rendered list plus the crawlable
// pager). The third, `?q=`, is NOT streamed here: page.tsx reaches
// `getSearchApiInfiniteQueryOptions` straight off @ecency/sdk, which the global
// spec setup does not stand in for, and replacing that mock file-locally would
// take the card render's own SDK stand-ins down with it. Its chain
// (ProfileSearchContent -> SearchListItem) is pinned structurally instead, in
// profile-section-page-no-ssr-skeleton.spec.ts.

vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined }),
  headers: async () => new Headers({ host: "ecency.com" })
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/@alice/comments",
  useParams: () => ({ username: "@alice", section: "comments" }),
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
    back: vi.fn()
  }),
  redirect: (url: string) => {
    throw new Error(`redirect:${url}`);
  },
  notFound: () => {
    throw new Error("notFound");
  }
}));

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: any) => (
    <a href={typeof href === "string" ? href : href?.pathname} {...rest}>
      {children}
    </a>
  ),
  useLinkStatus: () => ({ pending: false })
}));

// next/image needs Next's build-time image config, which no component render
// has. A plain <img> keeps the thumbnail in the markup (it is part of the card)
// without dragging the loader in.
vi.mock("next/image", () => ({
  default: ({ src, alt, ...rest }: any) => <img src={src} alt={alt} {...rest} />
}));

vi.mock("next/dynamic", () => ({ default: () => () => null }));

// The global SDK mock stays in place: importing the real SDK here would pull a
// second React copy (vitest has no react-query alias, next.config does), and
// every hook under the page would then throw.
vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));
vi.mock("@/features/i18n", () => ({ initI18next: async () => undefined }));

vi.mock("@/utils", async () => ({
  ...(await vi.importActual("@/utils")),
  random: vi.fn(),
  getAccessToken: vi.fn(() => "mock-token")
}));

// Hoisted with the fixtures, not declared beside them: the mock factories below
// read these, and vitest hoists the factories above every module-level const.
const { PINNED_TITLE, FEED_TITLE_PREFIX, ARCHIVE_TITLE_PREFIX, OLDER_CURSOR, PAGE_SIZE, fixtures } =
  vi.hoisted(() => ({
    PINNED_TITLE: "Pinned post that has to reach the browser in the shell",
    FEED_TITLE_PREFIX: "Section card",
    ARCHIVE_TITLE_PREFIX: "Archive card",
    OLDER_CURSOR: "alice/older-than-this",
    // Mirrors ARCHIVE_PAGE_SIZE; a test below fails if the two ever diverge.
    PAGE_SIZE: 20,
    fixtures: {
      account: null as any,
      pinnedEntry: null as any,
      feed: null as any,
      archive: [] as any[]
    }
  }));

vi.mock("@/core/react-query", async () => {
  const actual = await vi.importActual<typeof import("@/core/react-query")>("@/core/react-query");
  const { mockEntry, mockFullAccount } = await import("@/specs/test-utils");

  fixtures.account = mockFullAccount({
    name: "alice",
    profile: { name: "Alice", about: "About Alice", pinned: "pinned-post" }
  });
  fixtures.pinnedEntry = mockEntry({
    author: "alice",
    permlink: "pinned-post",
    category: "hive-1",
    title: PINNED_TITLE,
    body: "Body of the pinned post.\n\n".repeat(10)
  });
  // A FULL page 1 (ARCHIVE_PAGE_SIZE), because that is what makes the default
  // branch emit its crawlable "Older" link — the one no-JS entry into the
  // archive, and the thing a re-introduced boundary would strand along with
  // the cards.
  fixtures.feed = {
    pageParams: [undefined],
    pages: [
      Array.from({ length: PAGE_SIZE }, (_, i) =>
        mockEntry({
          author: "alice",
          permlink: i === PAGE_SIZE - 1 ? "older-than-this" : `section-post-${i}`,
          category: "hive-1",
          title: `${FEED_TITLE_PREFIX} ${i}`,
          body: `Body of section post ${i}.\n\n`.repeat(3)
        })
      )
    ]
  };
  fixtures.archive = [0, 1].map((i) =>
    mockEntry({
      author: "alice",
      permlink: `archive-post-${i}`,
      category: "hive-1",
      title: `${ARCHIVE_TITLE_PREFIX} ${i}`,
      body: `Body of archive post ${i}.\n\n`.repeat(3)
    })
  );

  const prefetchFixture = async (options: { queryKey: readonly unknown[] }) => {
    const data = JSON.stringify(options.queryKey).includes("account")
      ? fixtures.account
      : fixtures.pinnedEntry;
    actual.getQueryClient().setQueryData(options.queryKey, data);
    return data;
  };

  // prefetchRequired is the account lookup (found here, so it returns the
  // record); its failure and not-found paths are pinned in
  // profile-community-lookup-unavailable.spec.ts.
  return {
    ...actual,
    prefetchQuery: prefetchFixture,
    prefetchRequired: prefetchFixture
  };
});

// The `?before=` branch's only network call. archiveCursor()/cursorToken() stay
// real: they decide WHICH branch the page takes, and stubbing them would let
// the archive test pass while the page had actually rendered page 1.
vi.mock("@/app/(dynamicPages)/profile/[username]/_helpers/author-archive", async () => {
  const actual = await vi.importActual<
    typeof import("@/app/(dynamicPages)/profile/[username]/_helpers/author-archive")
  >("@/app/(dynamicPages)/profile/[username]/_helpers/author-archive");
  return {
    ...actual,
    fetchAuthorCursorPage: async () => ({
      entries: fixtures.archive,
      hasNext: true,
      nextCursor: { author: "alice", permlink: "older-still" }
    })
  };
});

// Inside the card but below its body: the deferred action island (vote, payout,
// votes, reblog, tip, translate, menu — many query observers and floating-ui
// popovers). Rendering its own placeholder is exactly what production does for
// every card past the top two, and it keeps this spec off that dependency tree.
// It cannot add a boundary above the body: it is rendered after it.
vi.mock("@/features/shared/hydrate-on-visible", () => ({
  HydrateOnVisible: ({ placeholder }: { placeholder?: React.ReactNode }) => <>{placeholder}</>
}));

// The card's tag chip resolves community titles through a query the global SDK
// mock does not carry. Disabled options are what a non-community category
// yields in production anyway.
vi.mock("@/core/caches/communities-cache", () => ({
  getCommunityCache: () => ({ queryKey: ["communities", "stub"], enabled: false })
}));

// The mute list is a per-viewer client query with no server counterpart: on the
// server useMutedAuthors() resolves to undefined and every entry is visible.
vi.mock("@/features/shared/entry-list-item/use-muted-authors", () => ({
  useMutedAuthors: () => undefined,
  useVisibleEntries: (entries: unknown[]) => entries
}));

// The feed query itself is network; the SSR prefetch and the client hook are
// replaced by one fixed page so the render is deterministic. Neither may add a
// boundary above the cards, and the page keeps its own tree.
vi.mock("@/api/queries", async () => {
  const actual = await vi.importActual<typeof import("@/api/queries")>("@/api/queries");
  return {
    ...actual,
    prefetchGetPostsFeedQuery: async () => fixtures.feed,
    getPostsFeedQueryData: () => fixtures.feed,
    usePostsFeedQuery: () => ({
      data: fixtures.feed,
      isFetching: false,
      isLoading: false,
      hasNextPage: false,
      isFetchingNextPage: false,
      fetchNextPage: vi.fn()
    })
  };
});

// Stand-in for the profile LAYOUT, which in production renders the navbar and
// the whole profile card around {children}.
//
// It has to WRAP the page, not merely precede it. React gives a boundary a
// content preamble — and refuses to outline it — while the insertion mode is
// still below HTML_MODE (react-dom renderSuspenseBoundary ->
// isEligibleForOutlining, which requires `null === contentPreamble`). Verified
// by mutation: with this element removed and the page streamed as a bare
// fragment, a <Suspense> around the entries is INLINED (`<!--$-->` at the root)
// instead of outlined. In production the boundary is deep inside <body>, which
// this element reproduces.
//
// Its SIZE, unlike in the profile-index spec next door, is not what carries the
// outlining here — a full 20-card page 1 is past progressiveChunkSize on its
// own (mutation-checked: shrinking the filler text to one repeat changed
// nothing). It stays because it is the shape production has, not because a
// check depends on it.
//
// None of that decides whether this spec has teeth, because expectInShell()
// counts boundary COMMENTS as well as outlined segments and so catches an
// inlined boundary too. The "control" test at the bottom pins the outlining
// property itself, so a renderer change that stopped outlining is reported
// rather than absorbed.
function ProfileLayoutStandIn({ children }: { children: React.ReactNode }) {
  return (
    <div className="reading-page">
      <div aria-hidden="true">{"profile header stand-in. ".repeat(80)}</div>
      {children}
    </div>
  );
}

async function streamElement(element: React.ReactNode): Promise<string> {
  const { renderToReadableStream } = await import("react-dom/server.browser");
  const { getQueryClient } = await import("@/core/react-query");
  const stream = await renderToReadableStream(
    <QueryClientProvider client={getQueryClient()}>
      <ProfileLayoutStandIn>{element}</ProfileLayoutStandIn>
    </QueryClientProvider>,
    { progressiveChunkSize: 512 }
  );
  await stream.allReady;
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let html = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    html += decoder.decode(value, { stream: true });
  }
  return html;
}

async function renderPage(section: string, searchParams: Record<string, string> = {}) {
  const { default: SectionPage } = await import(
    "@/app/(dynamicPages)/profile/[username]/[section]/page"
  );
  return SectionPage({
    params: Promise.resolve({ username: "%40alice", section }),
    searchParams: Promise.resolve(searchParams)
  }) as Promise<React.ReactNode>;
}

async function streamPage(section: string, searchParams: Record<string, string> = {}) {
  return streamElement(await renderPage(section, searchParams));
}

/**
 * Nothing React outlined, and no boundary of any kind, may sit between the
 * start of the document and the marker.
 *
 * The hidden-segment and placeholder checks catch a boundary React DECIDED to
 * outline. They are not enough on their own: React only outlines once the shell
 * has passed progressiveChunkSize, so a boundary wrapping the cards in a small
 * render is inlined and both checks stay green while production — where the
 * head, navbar and profile card alone blow past the threshold — would outline
 * it. So the boundary comments are counted too: React opens one with `<!--$-->`
 * (or `<!--$?-->` pending, `<!--$!-->` errored) and closes it with `<!--/$-->`,
 * and an unbalanced count before the marker means the marker is inside a
 * boundary.
 */
function expectInShell(html: string, marker: string) {
  const at = html.indexOf(marker);
  expect(at, `${marker} missing from the streamed HTML`).toBeGreaterThan(-1);

  const firstHidden = html.indexOf("<div hidden id=");
  if (firstHidden !== -1) {
    expect(at, `${marker} is after a hidden segment`).toBeLessThan(firstHidden);
  }
  const firstPlaceholder = html.indexOf("<template id=");
  if (firstPlaceholder !== -1) {
    expect(at, `${marker} is after a boundary placeholder`).toBeLessThan(firstPlaceholder);
  }

  const before = html.slice(0, at);
  const opened = (before.match(/<!--\$[?!]?-->/g) ?? []).length;
  const closed = (before.match(/<!--\/\$-->/g) ?? []).length;
  expect(opened - closed, `${marker} is inside an open Suspense boundary`).toBe(0);
}

describe("profile section page streamed HTML", () => {
  // The default branch only emits its crawlable "Older" link when page 1 came
  // back FULL, so the fixture has to be exactly one real page. If ARCHIVE_PAGE_SIZE
  // changes and the fixture does not, the pager silently stops rendering and
  // the assertion for it below would be dropped rather than failed.
  it("streams a fixture page of exactly one archive page size", () => {
    expect(PAGE_SIZE).toBe(ARCHIVE_PAGE_SIZE);
  });

  // /@ecency/comments was the worst of the three tabs on production: first card
  // at 69.2% of the document, 1 pending boundary, 2 hidden segments, 1 swap
  // script. Comments and replies carry no pinned post (PINNED_SECTIONS), so
  // this branch is the cards and the pager alone.
  it("ships the comments tab's cards in the shell", { timeout: 20000 }, async () => {
    const html = await streamPage("comments");

    expect(html).toContain("entry-list-item");
    expectInShell(html, `${FEED_TITLE_PREFIX} 0`);
    // Not just the first card: the whole server-rendered page 1.
    expectInShell(html, `${FEED_TITLE_PREFIX} ${ARCHIVE_PAGE_SIZE - 1}`);

    // The crawlable "Older" link that page 1 emits once it is full. Infinite
    // scroll is the JS enhancement; this link is the no-JS/crawler path, and a
    // boundary above the list strands it with the cards.
    expectInShell(html, OLDER_CURSOR);

    // A pinned post must NOT appear on this tab — otherwise the assertions
    // above could be satisfied by a page rendering the wrong section.
    expect(html).not.toContain(PINNED_TITLE);
  });

  // The blog tab additionally shows the pinned post, which comes from a SECOND
  // awaited fetch in page.tsx (`prefetchQuery(getEntryQueryByPath(...))`). It is
  // the last thing to reach the shell and the first thing a re-introduced
  // boundary would strand, so it is streamed on its own.
  it("ships the blog tab's pinned entry and cards in the shell", { timeout: 20000 }, async () => {
    const html = await streamPage("blog");

    expectInShell(html, PINNED_TITLE);
    expectInShell(html, `${FEED_TITLE_PREFIX} 0`);
    expectInShell(html, `${FEED_TITLE_PREFIX} ${ARCHIVE_PAGE_SIZE - 1}`);

    // The pinned card is unshifted to the top of the list, so it is the
    // earliest thing that must be in the shell.
    expect(html.indexOf(PINNED_TITLE)).toBeLessThan(html.indexOf(`${FEED_TITLE_PREFIX} 0`));
  });

  // `?before=` renders a different tree entirely: a fully server-rendered list
  // with no infinite scroll, plus the crawlable pager. Pinning only page 1
  // would leave the archive — the deep-crawl path — unguarded.
  it("ships the ?before= archive cards and pager in the shell", { timeout: 20000 }, async () => {
    const html = await streamPage("comments", { before: "alice/some-cursor" });

    expect(html).toContain("entry-list-item");
    expectInShell(html, `${ARCHIVE_TITLE_PREFIX} 0`);
    expectInShell(html, `${ARCHIVE_TITLE_PREFIX} 1`);
    expectInShell(html, "older-still");
    // The archive branch, not page 1 dressed up as one.
    expect(html).not.toContain(`${FEED_TITLE_PREFIX} 0`);
  });

  // Anti-vacuity, run every time rather than trusted once: put a <Suspense>
  // exactly where a loading.tsx would put one — around the page, inside the
  // layout stand-in — and the assertions above MUST fail. If React stops
  // outlining here (a smaller stand-in, a different progressiveChunkSize, a
  // renderer change), every other test in this file goes quietly vacuous, and
  // this is what notices.
  it("control: a boundary in this position is outlined", { timeout: 20000 }, async () => {
    const page = await renderPage("comments");
    const html = await streamElement(<React.Suspense fallback={null}>{page}</React.Suspense>);

    // The cards still exist — they are just no longer in the shell.
    expect(html).toContain(`${FEED_TITLE_PREFIX} 0`);
    expect(html).toContain("<div hidden id=");
    expect(() => expectInShell(html, `${FEED_TITLE_PREFIX} 0`)).toThrow();
  });
});
