import "@testing-library/jest-dom";
import React from "react";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockEntry } from "@/specs/test-utils";

// #1881: columns whose feed failed during the server render are fetched again
// in the browser; the columns that loaded render at once from the server data.
const answers = vi.hoisted(() => new Map<string, unknown>());
const calls = vi.hoisted(() => [] as string[]);

vi.mock("@ecency/sdk", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("@ecency/sdk");
  const answer = (name: string, ...key: unknown[]) => ({
    queryKey: [name, ...key],
    queryFn: async () => {
      calls.push(name);
      return answers.get(name) ?? [];
    }
  });
  return {
    ...actual,
    getPostsRankedQueryOptions: (sort: string, tag: string) => answer("ranked", sort, tag),
    getAccountPostsQueryOptions: (username: string) => answer("account", username),
    getSimilarEntriesQueryOptions: () => answer("similar")
  };
});
vi.mock("next/link", () => ({
  default: ({ href, children }: React.PropsWithChildren<{ href: string }>) => <a href={href}>{children}</a>
}));
vi.mock("next/image", () => ({
  default: ({ src, alt }: { src: string; alt: string }) => <img src={src} alt={alt} />
}));

import { EntryRelatedFooterRefill } from "@/app/(dynamicPages)/entry/[category]/[author]/[permlink]/_components/entry-related-footer-refill";

const row = (author: string, permlink: string) =>
  mockEntry({ author, permlink, title: `T ${permlink}`, category: "photography", json_metadata: { tags: ["photography"] } });

function renderRefill(props: Partial<React.ComponentProps<typeof EntryRelatedFooterRefill>>) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <EntryRelatedFooterRefill
        author="alice"
        permlink="the-post"
        source={{ tag: "photography", section: "#photography" }}
        failed={{ similar: false, author: false, community: false }}
        initial={{ similar: [], authorPosts: [], communityPosts: [] }}
        {...props}
      />
    </QueryClientProvider>
  );
}

describe("EntryRelatedFooterRefill", () => {
  beforeEach(() => {
    answers.clear();
    calls.length = 0;
  });

  it("shows the server's columns at once and fetches only the failed one", async () => {
    answers.set("account", [row("alice", "a1"), row("alice", "a2")]);
    renderRefill({
      failed: { similar: false, author: true, community: false },
      initial: { similar: [], authorPosts: [], communityPosts: [row("bob", "c1"), row("carol", "c2")] }
    });

    expect(screen.getByText("T c1")).toBeInTheDocument();
    expect(await screen.findByText("T a1")).toBeInTheDocument();
    expect(screen.getByText("T a2")).toBeInTheDocument();
    expect(calls).toEqual(["account"]);
  });

  it("fetches the similar column again from the post's title and excerpt", async () => {
    answers.set("similar", [
      { author: "dan", permlink: "s1", title: "Similar one", category: "photography", img_url: "", created_at: "2026-11-01T00:00:00" },
      { author: "erin", permlink: "s2", title: "Similar two", category: "photography", img_url: "", created_at: "2026-11-01T00:00:00" }
    ]);
    renderRefill({
      failed: { similar: true, author: false, community: false },
      similarInput: { title: "The post", body: "words", tags: ["photography"] }
    });

    expect(await screen.findByText("Similar one")).toBeInTheDocument();
    expect(calls).toEqual(["similar"]);
  });
});
