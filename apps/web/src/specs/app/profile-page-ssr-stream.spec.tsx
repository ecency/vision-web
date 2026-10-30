import React from "react";
import { describe, expect, it, vi } from "vitest";
import { QueryClientProvider } from "@tanstack/react-query";

// Streams the real profile index page through React's server renderer and
// asserts on the HTML a browser would receive: the feed cards — the pinned
// entry first, then the first feed page — must be part of the shell, never
// inside a hidden segment that a later swap script reveals (#1787).
//
// progressiveChunkSize is forced tiny so React outlines any completed Suspense
// boundary the way it does in production, where the head, navbar and profile
// card alone exceed the 12.8 KB default: a <Suspense> re-introduced anywhere
// above the list shows up here as `<div hidden id="S:n">` around the cards and
// fails the test. A route-level loading.tsx cannot be exercised through a
// component render; the structure spec next to this one pins its absence, on
// the route AND on every ancestor segment.
//
// The pinned entry is rendered on purpose: it is the one card that comes from a
// SECOND awaited fetch in page.tsx (`prefetchQuery(getEntryQueryByPath(...))`),
// so it is the last thing to reach the shell and the first thing a
// re-introduced boundary would strand.

vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined }),
  headers: async () => new Headers({ host: "ecency.com" })
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/@alice",
  useParams: () => ({ username: "@alice" }),
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

const PINNED_TITLE = "Pinned post that has to reach the browser in the shell";
const FEED_TITLE_PREFIX = "Feed card";

const fixtures = vi.hoisted(() => ({
  account: null as any,
  pinnedEntry: null as any,
  feed: null as any
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
  fixtures.feed = {
    pageParams: [undefined],
    pages: [
      Array.from({ length: 6 }, (_, i) =>
        mockEntry({
          author: "alice",
          permlink: `feed-post-${i}`,
          category: "hive-1",
          title: `${FEED_TITLE_PREFIX} ${i}`,
          body: `Body of feed post ${i}.\n\n`.repeat(6)
        })
      )
    ]
  };

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
// Stubbed to exactly that, so the spec does not need the muted-users query
// options that the global SDK mock does not carry.
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
// the whole profile card around {children}. Both of its jobs are load-bearing,
// and this spec was verified to be VACUOUS without them:
//
//  1. It must WRAP the page, not merely precede it. React gives a boundary a
//     content preamble — and refuses to outline it — while the insertion mode
//     is still below HTML_MODE (react-dom renderSuspenseBoundary ->
//     isEligibleForOutlining, which requires `null === contentPreamble`). A
//     page rendered as a bare fragment sits in root mode, so a <Suspense>
//     wrapping the entries was inlined and the spec passed. In production the
//     boundary is deep inside <body>, which this element reproduces.
//  2. It must be big enough. React outlines a completed boundary only once the
//     bytes already flushed plus the boundary's own exceed progressiveChunkSize;
//     the real head, navbar and profile card are far past it before the entries
//     begin.
function ProfileLayoutStandIn({ children }: { children: React.ReactNode }) {
  return (
    <div className="reading-page">
      <div aria-hidden="true">{"profile header stand-in. ".repeat(80)}</div>
      {children}
    </div>
  );
}

async function streamPage(): Promise<string> {
  const { renderToReadableStream } = await import("react-dom/server.browser");
  const { getQueryClient } = await import("@/core/react-query");
  const { default: ProfilePage } = await import(
    "@/app/(dynamicPages)/profile/[username]/page"
  );
  const element = await ProfilePage({
    params: Promise.resolve({ username: "%40alice" }),
    searchParams: Promise.resolve({})
  });
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

describe("profile page streamed HTML", () => {
  it(
    "ships the pinned entry and the feed cards in the shell, outside every hidden segment",
    { timeout: 20000 },
    async () => {
      const html = await streamPage();

      const firstCard = html.indexOf("entry-list-item");
      expect(firstCard).toBeGreaterThan(-1);
      // The pinned entry (second awaited fetch) and the feed page both landed.
      expect(html).toContain(PINNED_TITLE);
      expect(html).toContain(`${FEED_TITLE_PREFIX} 0`);
      expect(html).toContain(`${FEED_TITLE_PREFIX} 5`);

      // The pinned card is unshifted to the top of the list, so it is the
      // earliest thing that must be in the shell.
      const pinnedAt = html.indexOf(PINNED_TITLE);
      const lastCardAt = html.indexOf(`${FEED_TITLE_PREFIX} 5`);

      // Anything outlined by React lands after the shell as a hidden segment.
      const firstHidden = html.indexOf("<div hidden id=");
      if (firstHidden !== -1) {
        expect(pinnedAt).toBeLessThan(firstHidden);
        expect(lastCardAt).toBeLessThan(firstHidden);
      }
      // No boundary placeholder (pending or outlined) may precede the cards.
      const firstPlaceholder = html.indexOf("<template id=");
      if (firstPlaceholder !== -1) {
        expect(pinnedAt).toBeLessThan(firstPlaceholder);
        expect(lastCardAt).toBeLessThan(firstPlaceholder);
      }
    }
  );
});
