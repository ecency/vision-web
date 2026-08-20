import "@testing-library/jest-dom";
import React from "react";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SLIM_KEY_MARKER } from "@/core/entries/slim-entry";
import { mockEntry } from "@/specs/test-utils";
import type { Entry } from "@/entities";

interface Seen {
  queryKey: unknown[];
  result: unknown;
}

const seen = vi.hoisted(() => [] as Seen[]);
const answers = vi.hoisted(() => new Map<string, unknown>());

// Both server components reach the network through these two helpers. Running
// the options they are handed, rather than stubbing the result, is the point:
// what is under test is the queryFn the wrapper installed.
vi.mock("@/core/react-query", () => {
  const run = async (options: {
    queryKey: unknown[];
    queryFn: (ctx: unknown) => Promise<unknown>;
  }) => {
    const result = await options.queryFn({
      queryKey: options.queryKey,
      signal: new AbortController().signal
    });
    seen.push({ queryKey: options.queryKey, result });
    return result;
  };
  return { prefetchQuery: run, fetchQuery: run };
});

vi.mock("@ecency/sdk", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("@ecency/sdk");
  const answer = (name: string) => ({
    queryKey: [name],
    queryFn: async () => answers.get(name) ?? []
  });
  return {
    ...actual,
    getPostsRankedQueryOptions: () => answer("ranked"),
    getAccountPostsQueryOptions: () => answer("account"),
    getSimilarEntriesQueryOptions: () => answer("similar")
  };
});

vi.mock("@/features/i18n", () => ({ initI18next: async () => undefined }));

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: any) => (
    <a href={href} {...rest}>
      {children}
    </a>
  )
}));
vi.mock("next/image", () => ({
  default: ({ src, alt }: any) => <img src={src} alt={alt} />
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
    ...overrides
  });
}

function slimmed(): Entry[] {
  return seen.flatMap((s) => (Array.isArray(s.result) ? (s.result as Entry[]) : []));
}

describe("server renders that never read a body fetch slim pages", () => {
  beforeEach(() => {
    seen.length = 0;
    answers.clear();
  });

  it("keeps the landing strip's titles and thumbnails without its bodies", async () => {
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
    expect(slimmed().map((e) => e.body)).toEqual(["", ""]);
  });

  it("keeps the related footer's rows without their bodies", async () => {
    const authorRows = [fullRow(), fullRow()];
    const communityRows = [fullRow({ author: "bob" }), fullRow({ author: "carol" })];
    answers.set("account", authorRows);
    answers.set("ranked", communityRows);

    const entry = fullRow({ permlink: "the-post-being-read" });
    render((await EntryRelatedFooter({ entry })) as React.ReactElement);

    for (const row of [...authorRows, ...communityRows]) {
      expect(screen.getByText(row.title)).toBeInTheDocument();
    }
    expect(slimmed()).toHaveLength(4);
    expect(slimmed().every((e) => e.body === "")).toBe(true);
  });

  it("answers under a key of its own, never the one deck columns read", async () => {
    // A slim page cached under the SDK's own page key is issue #1556: a deck
    // column reads it inside the staleTime and renders an empty article.
    answers.set("ranked", [fullRow()]);
    answers.set("account", [fullRow()]);

    render(await LandingTrending());
    render((await EntryRelatedFooter({ entry: fullRow() })) as React.ReactElement);

    const entryKeys = seen.filter((s) => s.queryKey[0] !== "similar");
    expect(entryKeys.length).toBe(3);
    for (const { queryKey } of entryKeys) {
      expect(queryKey.at(-1)).toBe(SLIM_KEY_MARKER);
    }
  });
});
