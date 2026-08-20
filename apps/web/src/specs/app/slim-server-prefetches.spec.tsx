import "@testing-library/jest-dom";
import React from "react";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getQueryClient } from "@/core/react-query";
import { CARD_ONLY_KEY_MARKER } from "@/core/entries/slim-entry";
import { mockEntry } from "@/specs/test-utils";
import type { Entry } from "@/entities";

const answers = vi.hoisted(() => new Map<string, unknown>());

// Only the bridge is stubbed. The components reach it through the real
// prefetchQuery/fetchQuery and the real request-scoped query client, which is
// what makes the cache assertions below mean anything: they read what a server
// render would actually be holding.
vi.mock("@ecency/sdk", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("@ecency/sdk");
  const answer = (name: string, ...key: unknown[]) => ({
    queryKey: [name, ...key],
    queryFn: async () => answers.get(name) ?? []
  });
  return {
    ...actual,
    getPostsRankedQueryOptions: (sort: string, tag: string) => answer("ranked", sort, tag),
    getAccountPostsQueryOptions: (username: string) => answer("account", username),
    getSimilarEntriesQueryOptions: () => answer("similar")
  };
});

vi.mock("@/features/i18n", () => ({ initI18next: async () => undefined }));

vi.mock("next/link", () => ({
  default: ({ href, children }: React.PropsWithChildren<{ href: string }>) => (
    <a href={href}>{children}</a>
  )
}));
vi.mock("next/image", () => ({
  default: ({ src, alt }: { src: string; alt: string }) => <img src={src} alt={alt} />
}));

import { LandingTrending } from "@/app/_components/landing-page/landing-trending";
import { EntryRelatedFooter } from "@/app/(dynamicPages)/entry/[category]/[author]/[permlink]/_components/entry-related-footer";

// render-helper memoizes per author/permlink/update, so every fixture needs its
// own permlink or one case reads another's cached image.
let seq = 0;

/** A bridge row as it really arrives: whole body, no image in the metadata. */
function fullRow(overrides: Partial<Entry> = {}): Entry {
  const permlink = `prefetch-fixture-${++seq}`;
  return mockEntry({
    author: "alice",
    permlink,
    title: `Title ${permlink}`,
    category: "photography",
    body: `Some words and a cover ![cover](https://example.com/${permlink}.jpg) then more words.`,
    json_metadata: { tags: ["photography"] },
    active_votes: Array.from({ length: 300 }, (_, i) => ({ voter: `v${i}`, rshares: 1 })) as never,
    stats: { total_votes: 300, flag_weight: 0, gray: false, hide: false },
    ...overrides
  });
}

/** Every entry the render left behind in the request-scoped cache. */
function cachedEntries(): Entry[] {
  return getQueryClient()
    .getQueryCache()
    .getAll()
    .flatMap((query) => (Array.isArray(query.state.data) ? (query.state.data as Entry[]) : []));
}

function cachedEntryKeys(): unknown[][] {
  return getQueryClient()
    .getQueryCache()
    .getAll()
    .filter((query) => Array.isArray(query.state.data) && query.state.data.length > 0)
    .map((query) => [...query.queryKey]);
}

describe("server renders that read no body and no votes fetch card-only pages", () => {
  beforeEach(() => {
    getQueryClient().clear();
    answers.clear();
  });

  it("keeps the landing strip's titles and thumbnails without its bodies or voters", async () => {
    // The strip reads a title, an author and a thumbnail. The bodies behind it
    // are hundreds of KB the render holds for the request's gc window (#1559).
    const rows = [fullRow(), fullRow()];
    answers.set("ranked", rows);

    const { container } = render(await LandingTrending());

    for (const row of rows) {
      expect(screen.getByText(row.title)).toBeInTheDocument();
    }
    // The cover lived only in the body, and the card still shows it: the
    // thumbnail is derived before the body goes, not lost with it.
    // Decorative, so alt is empty and the img carries no accessible role.
    const images = [...container.querySelectorAll("img")];
    expect(images).toHaveLength(2);
    for (const img of images) {
      expect(img.getAttribute("src")).toMatch(
        /^https:\/\/i\.ecency\.com\/p\/.+width=320&height=180$/
      );
    }
    expect(cachedEntries().map((e) => e.body)).toEqual(["", ""]);
    // The strip has no vote button, payout or count in it, and voter records are
    // the larger half of what a cached row costs.
    expect(cachedEntries().map((e) => e.active_votes)).toEqual([[], []]);
    expect(cachedEntries().map((e) => e.stats?.total_votes)).toEqual([300, 300]);
  });

  it("keeps the related footer's rows without their bodies or voters", async () => {
    const authorRows = [fullRow(), fullRow()];
    const communityRows = [fullRow({ author: "bob" }), fullRow({ author: "carol" })];
    answers.set("account", authorRows);
    answers.set("ranked", communityRows);

    const entry = fullRow({ permlink: "the-post-being-read" });
    render((await EntryRelatedFooter({ entry })) as React.ReactElement);

    for (const row of [...authorRows, ...communityRows]) {
      expect(screen.getByText(row.title)).toBeInTheDocument();
    }
    expect(cachedEntries()).toHaveLength(4);
    expect(cachedEntries().every((e) => e.body === "")).toBe(true);
    expect(cachedEntries().every((e) => e.active_votes?.length === 0)).toBe(true);
  });

  it("answers under a key of its own, never the one deck columns read", async () => {
    // A slim page cached under the SDK's own page key is issue #1556: a deck
    // column reads it inside the staleTime and renders an empty article.
    answers.set("ranked", [fullRow()]);
    answers.set("account", [fullRow()]);

    render(await LandingTrending());
    render((await EntryRelatedFooter({ entry: fullRow() })) as React.ReactElement);

    const keys = cachedEntryKeys();
    expect(keys.length).toBe(3);
    for (const key of keys) {
      expect(key.at(-1)).toBe(CARD_ONLY_KEY_MARKER);
    }
  });

  it("still renders when a row's metadata cannot be read", async () => {
    // json_metadata is author-written. Before the guards in slimEntry, one row
    // with a non-array `thumbnails` threw inside the queryFn, prefetchQuery
    // swallowed it and the entire strip disappeared.
    const hostile = fullRow({
      json_metadata: { thumbnails: "https://example.com/not-an-array.jpg" } as never
    });
    const ordinary = fullRow();
    answers.set("ranked", [hostile, ordinary]);

    render(await LandingTrending());

    expect(screen.getByText(hostile.title)).toBeInTheDocument();
    expect(screen.getByText(ordinary.title)).toBeInTheDocument();
  });
});
