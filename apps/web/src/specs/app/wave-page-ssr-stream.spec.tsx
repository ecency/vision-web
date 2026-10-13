import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { QueryClientProvider } from "@tanstack/react-query";

// Streams the real wave page through React's server renderer and asserts on the
// HTML a browser would receive: the wave body must be part of the shell, never
// inside a hidden segment that a later swap script reveals (#1783).
//
// progressiveChunkSize is forced tiny so React outlines any completed Suspense
// boundary the way it does in production, where the head and navbar alone
// exceed the 12.8 KB default: a <Suspense> re-introduced anywhere above the
// body shows up here as `<div hidden id="S:n">` around the body and fails the
// test. A route-level loading.tsx cannot be exercised through a component
// render; the structure spec next to this one pins its absence, on the route
// AND on every ancestor segment.

vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined }),
  headers: async () => new Headers({ host: "ecency.com" })
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/waves/alice/hello",
  useParams: () => ({ author: "alice", permlink: "hello" }),
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

vi.mock("next/dynamic", () => ({ default: () => () => null }));

// The global SDK mock stays in place: importing the real SDK here would pull a
// second React copy (vitest has no react-query alias, next.config does), and
// every hook under the page would then throw.
// setup-any-spec stubs EcencyRenderer to null app-wide (it drags the markdown
// pipeline into every container spec). This spec is about the body actually
// being in the shell, so it opts back in to the real renderer.
vi.mock("@/features/post-renderer", async () => ({
  ...(await vi.importActual<typeof import("@/features/post-renderer")>("@/features/post-renderer"))
}));

vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));
vi.mock("@/features/i18n", () => ({ initI18next: async () => undefined }));

vi.mock("@/utils", async () => ({
  ...(await vi.importActual("@/utils")),
  random: vi.fn(),
  getAccessToken: vi.fn(() => "mock-token")
}));

const fixtures = vi.hoisted(() => ({ entry: null as unknown, nsfwFlagged: false }));

// The page asks the API for this wave's image-check verdict on the server. Stubbed
// so the spec makes no network call, and switchable so the cover can be asserted.
vi.mock("@/server/wave-nsfw", () => ({
  isWaveFlaggedNsfw: async () => fixtures.nsfwFlagged
}));

vi.mock("@/core/react-query", async () => {
  const actual = await vi.importActual<typeof import("@/core/react-query")>("@/core/react-query");
  const { mockEntry } = await import("@/specs/test-utils");
  fixtures.entry = mockEntry({
    author: "alice",
    permlink: "hello",
    depth: 1,
    parent_author: "ecency.waves",
    body: "Wave body paragraph that has to reach the browser in the shell.\n\n".repeat(20),
    json_metadata: { tags: ["waves"], app: "ecency/waves" }
  });
  return {
    ...actual,
    prefetchQuery: async (options: { queryKey: readonly unknown[] }) => {
      actual.getQueryClient().setQueryData(options.queryKey, fixtures.entry);
      return fixtures.entry;
    }
  };
});

// Siblings of the body that are not on the LCP path and drag in network,
// editors or lazy chunks. Each is replaced by an inert component; none of them
// may add a boundary above the body, and the page keeps its own tree.
vi.mock("@/app/waves/[author]/[permlink]/_components/wave-view-discussion", () => ({
  WaveViewDiscussion: () => null
}));
vi.mock("@/features/waves/components/wave-actions", () => ({ WaveActions: () => null }));
vi.mock("@/features/waves/components/wave-form", () => ({
  WaveForm: () => null,
  WaveFormLoading: () => null
}));

async function streamPage(): Promise<string> {
  const { renderToReadableStream } = await import("react-dom/server.browser");
  const { getQueryClient } = await import("@/core/react-query");
  const { default: WaveViewPage } = await import("@/app/waves/[author]/[permlink]/page");
  const element = await WaveViewPage({
    params: Promise.resolve({ author: "%40alice", permlink: "hello" })
  });
  const stream = await renderToReadableStream(
    <QueryClientProvider client={getQueryClient()}>{element}</QueryClientProvider>,
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

describe("wave page streamed HTML", () => {
  afterEach(() => {
    fixtures.nsfwFlagged = false;
  });

  it("ships an unflagged wave with no cover", { timeout: 20000 }, async () => {
    expect(await streamPage()).not.toContain("data-nsfw-covered");
  });

  it("covers a flagged wave in the HTML the server sends, not after hydration", { timeout: 20000 }, async () => {
    // The chain entry in this fixture has no nsfw tag and the URL carries no
    // hint: this is a wave opened by a plain link. A cover that only appeared
    // on the client would paint the picture first.
    fixtures.nsfwFlagged = true;
    const html = await streamPage();
    expect(html).toContain("data-nsfw-covered");
    expect(html).toContain("Wave body paragraph that has to reach the browser in the shell.");
  });

  it("ships the wave body in the shell, outside every hidden segment", { timeout: 20000 }, async () => {
    const html = await streamPage();
    const body = html.indexOf("markdown-view");
    expect(body).toBeGreaterThan(-1);
    expect(html).toContain("Wave body paragraph that has to reach the browser in the shell.");

    // Anything outlined by React lands after the shell as a hidden segment.
    const firstHidden = html.indexOf("<div hidden id=");
    if (firstHidden !== -1) {
      expect(body).toBeLessThan(firstHidden);
    }
    // No boundary placeholder (pending or outlined) may precede the body.
    const firstPlaceholder = html.indexOf("<template id=");
    if (firstPlaceholder !== -1) {
      expect(body).toBeLessThan(firstPlaceholder);
    }
  });
});
