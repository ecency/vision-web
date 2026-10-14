import React from "react";
import { describe, expect, it, vi } from "vitest";
import { QueryClientProvider } from "@tanstack/react-query";

// Streams the real entry page through React's server renderer and asserts on
// the HTML a browser would receive: the post body must be part of the shell,
// never inside a hidden segment that a later swap script reveals.
//
// progressiveChunkSize is forced tiny so that React outlines any completed
// Suspense boundary the way it does in production, where the head and navbar
// alone exceed the 12.8 KB default: a <Suspense> re-introduced anywhere above
// the body (page.tsx, a child component, an aliased import) shows up here as
// `<div hidden id="S:n">` around #post-body and fails the test. The route-level
// loading.tsx cannot be exercised through a component render; the structure
// spec next to this one pins its absence.

vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined }),
  headers: async () => new Headers({ host: "ecency.com" })
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/@alice/hello",
  useParams: () => ({ author: "@alice", permlink: "hello", category: "hive-1" }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
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
vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));
vi.mock("@/features/i18n", () => ({ initI18next: async () => undefined }));
vi.mock("@/utils/server-app-base", () => ({ getServerAppBase: async () => "https://ecency.com" }));

vi.mock("@/utils", async () => ({
  ...(await vi.importActual("@/utils")),
  random: vi.fn(),
  getAccessToken: vi.fn(() => "mock-token")
}));

const fixtures = vi.hoisted(() => ({ entry: null as unknown, account: null as unknown }));

vi.mock("@/core/react-query", async () => {
  const actual = await vi.importActual<typeof import("@/core/react-query")>("@/core/react-query");
  const { mockEntry, mockFullAccount } = await import("@/specs/test-utils");
  fixtures.entry = mockEntry({
    author: "alice",
    permlink: "hello",
    category: "hive-1",
    title: "Hello",
    body: "First paragraph of the post.\n\n".repeat(40),
    json_metadata: { tags: ["test"] }
  });
  fixtures.account = mockFullAccount({ name: "alice" });
  return {
    ...actual,
    prefetchQuery: async (options: { queryKey: readonly unknown[] }) => {
      const data = JSON.stringify(options.queryKey).includes("account")
        ? fixtures.account
        : fixtures.entry;
      actual.getQueryClient().setQueryData(options.queryKey, data);
      return data;
    }
  };
});

// Siblings of the body that are not on the LCP path and drag in network,
// modals or lazy chunks. Each is replaced by an inert component; none of
// them may add a boundary above the body, and the page keeps its own tree.
vi.mock("@/app/(dynamicPages)/entry/[category]/[author]/[permlink]/_components/entry-related-footer", () => ({ EntryRelatedFooter: () => null }));
vi.mock("@/app/(dynamicPages)/entry/[category]/[author]/[permlink]/_components/entry-page-discussions-wrapper", () => ({
  EntryPageDiscussionsWrapper: () => null
}));
vi.mock("@/app/(dynamicPages)/entry/[category]/[author]/[permlink]/_components/entry-page-content-client", () => ({
  EntryPageContentClient: () => null
}));
vi.mock("@/app/(dynamicPages)/entry/[category]/[author]/[permlink]/_components/entry-page-edit-history", () => ({ EntryPageEditHistory: () => null }));
vi.mock("@/app/(dynamicPages)/entry/[category]/[author]/[permlink]/_components/entry-page-cross-post-header", () => ({
  EntryPageCrossPostHeader: () => null
}));
vi.mock("@/app/(dynamicPages)/entry/[category]/[author]/[permlink]/_components/entry-footer-controls", () => ({ EntryFooterControls: () => null }));
vi.mock("@/app/(dynamicPages)/entry/[category]/[author]/[permlink]/_components/entry-page-main-info-menu", () => ({
  EntryPageMainInfoMenu: () => null
}));
vi.mock("@/app/(dynamicPages)/entry/[category]/[author]/[permlink]/_components/md-handler", () => ({ MdHandler: () => null }));
vi.mock("@/app/(dynamicPages)/entry/[category]/[author]/[permlink]/_components/entry-page-warnings", () => ({ EntryPageWarnings: () => null }));
vi.mock("@/app/(dynamicPages)/entry/[category]/[author]/[permlink]/_components/entry-page-main-info", () => ({
  EntryPageMainInfo: () => <h1>Hello</h1>
}));
vi.mock("@/app/(dynamicPages)/entry/[category]/[author]/[permlink]/_components/entry-page-listen", () => ({ EntryPageListen: () => null }));
vi.mock("@/app/(dynamicPages)/entry/[category]/[author]/[permlink]/_components/entry-tags", () => ({ EntryTags: () => null }));
vi.mock("@/app/(dynamicPages)/entry/[category]/[author]/[permlink]/_components/entry-footer-info", () => ({ EntryFooterInfo: () => null }));
vi.mock("@/features/listen", () => ({ ListenPlayer: () => null }));
vi.mock("@/features/newsletter/runtime", () => ({ NewsletterGate: () => null }));
vi.mock("@/features/newsletter/post-subscribe-prompt", () => ({ PostSubscribePrompt: () => null }));
vi.mock("@/features/shared/entry-translate/entry-translate-inline", () => ({
  EntryTranslateInline: () => null
}));

async function streamPage(): Promise<string> {
  const { renderToReadableStream } = await import("react-dom/server.browser");
  const { getQueryClient } = await import("@/core/react-query");
  const { default: EntryPage } = await import("@/app/(dynamicPages)/entry/[category]/[author]/[permlink]/page");
  const element = await EntryPage({
    params: Promise.resolve({ author: "%40alice", permlink: "hello", category: "hive-1" }),
    searchParams: Promise.resolve({})
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

describe("entry page streamed HTML", () => {
  it("ships #post-body in the shell, outside every hidden segment", { timeout: 20000 }, async () => {
    const html = await streamPage();
    const body = html.indexOf('id="post-body"');
    expect(body).toBeGreaterThan(-1);
    expect(html.slice(body, body + 400)).toContain("First paragraph of the post.");

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
