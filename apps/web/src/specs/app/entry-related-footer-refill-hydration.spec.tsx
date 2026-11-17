import React from "react";
import { act } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { hydrateRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";

// #1881 review: the refill is a client component, so it hydrates. A page held
// at the edge for days must hydrate cleanly when the reader's clock and
// language differ from the render's: no recoverable error, so React keeps the
// footer's server HTML instead of rebuilding it.
const lang = vi.hoisted(() => ({ current: "en" }));
vi.mock("i18next", () => ({
  default: { t: (key: string) => `${lang.current}:${key}` }
}));
vi.mock("@ecency/sdk", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("@ecency/sdk");
  const never = (name: string) => ({ queryKey: [name], queryFn: () => new Promise(() => {}) });
  return {
    ...actual,
    getPostsRankedQueryOptions: () => never("ranked"),
    getAccountPostsQueryOptions: () => never("account"),
    getSimilarEntriesQueryOptions: () => never("similar")
  };
});
vi.mock("next/link", () => ({
  default: ({ href, children }: React.PropsWithChildren<{ href: string }>) => <a href={href}>{children}</a>
}));
vi.mock("next/image", () => ({
  default: ({ src, alt }: { src: string; alt: string }) => <img src={src} alt={alt} />
}));

import { EntryRelatedFooterRefill } from "@/app/(dynamicPages)/entry/[category]/[author]/[permlink]/_components/entry-related-footer-refill";

const item = (permlink: string) => ({
  author: "bob",
  permlink,
  title: `T ${permlink}`,
  category: "photography",
  created: "2026-11-16T00:00:00"
});

function tree() {
  return (
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <EntryRelatedFooterRefill
        author="alice"
        permlink="the-post"
        source={{ tag: "photography", section: "#photography" }}
        titles={{ similar: "Read next", author: "From @alice", community: "In #photography" }}
        failed={{ similar: true, author: false, community: false }}
        initial={{ similar: [], author: [item("a1"), item("a2")], community: [item("c1"), item("c2")] }}
        similarInput={{ title: "The post", body: "words", tags: ["photography"] }}
      />
    </QueryClientProvider>
  );
}

afterEach(() => {
  vi.useRealTimers();
  lang.current = "en";
});

describe("EntryRelatedFooterRefill hydration", () => {
  it("hydrates a days-old render in another language without a mismatch", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-17T00:00:00Z"));
    const html = renderToString(tree());
    expect(html).toContain("T a1");

    vi.setSystemTime(new Date("2026-12-01T00:00:00Z"));
    lang.current = "de";
    const container = document.createElement("div");
    container.innerHTML = html;
    document.body.appendChild(container);
    const recoverable = vi.fn();
    await act(async () => {
      hydrateRoot(container, tree(), { onRecoverableError: recoverable });
    });

    expect(recoverable).not.toHaveBeenCalled();
    container.remove();
  });
});
