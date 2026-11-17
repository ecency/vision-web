// @vitest-environment node
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockEntry } from "@/specs/test-utils";
import { getQueryClient } from "@/core/react-query";

// #1881: the related footer streams after the post page's head is sent, so a
// failed feed can no longer keep the page out of the cache. It must not mark the
// response degraded (that only counts it as `late`), and the footer hands the
// failed columns to the browser to fetch again instead of dropping them.
const answers = vi.hoisted(() => new Map<string, unknown>());
const failing = vi.hoisted(() => new Set<string>());

vi.mock("@ecency/sdk", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("@ecency/sdk");
  const answer = (name: string, ...key: unknown[]) => ({
    queryKey: [name, ...key],
    queryFn: async () => {
      if (failing.has(name)) throw new Error(`${name} 503`);
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
vi.mock("@/features/i18n", () => ({ initI18next: async () => undefined }));

const { EntryRelatedFooter } = await import(
  "@/app/(dynamicPages)/entry/[category]/[author]/[permlink]/_components/entry-related-footer"
);
const { EntryRelatedFooterRefill } = await import(
  "@/app/(dynamicPages)/entry/[category]/[author]/[permlink]/_components/entry-related-footer-refill"
);

type DegradedGlobal = { __ecencySsrDegraded?: { mark: (reason: string) => void } };

const row = (author: string, permlink: string) =>
  mockEntry({ author, permlink, title: `T ${permlink}`, category: "photography", json_metadata: { tags: ["photography"] } });

const post = () =>
  mockEntry({
    author: "alice",
    permlink: "the-post",
    title: "The post",
    body: "x".repeat(10_000),
    category: "photography",
    json_metadata: { tags: ["photography"] }
  });

describe("related footer when a feed fails", () => {
  const mark = vi.fn();

  beforeEach(() => {
    getQueryClient().clear();
    answers.clear();
    failing.clear();
    mark.mockReset();
    (globalThis as DegradedGlobal).__ecencySsrDegraded = { mark };
    answers.set("account", [row("alice", "a1"), row("alice", "a2")]);
    answers.set("ranked", [row("bob", "c1"), row("carol", "c2")]);
  });

  it("does not mark the page degraded", async () => {
    failing.add("similar");
    await EntryRelatedFooter({ entry: post() });
    expect(mark).not.toHaveBeenCalled();
  });

  it("hands the failed column to the browser and keeps the loaded ones", async () => {
    failing.add("similar");
    const el = (await EntryRelatedFooter({ entry: post() })) as React.ReactElement<any>;

    expect(el.type).toBe(EntryRelatedFooterRefill);
    expect(el.props.failed).toEqual({ similar: true, author: false, community: false });
    expect(el.props.initial.author.map((e: { permlink: string }) => e.permlink)).toEqual(["a1", "a2"]);
    expect(el.props.initial.community.map((e: { permlink: string }) => e.permlink)).toEqual(["c1", "c2"]);
    // Only what a row shows crosses to the browser, never whole entries.
    expect(Object.keys(el.props.initial.author[0]).sort()).toEqual(
      ["author", "category", "created", "image", "permlink", "title"].filter((k) => k in el.props.initial.author[0]).sort()
    );
    expect(el.props.initial.author[0]).not.toHaveProperty("body");
    expect(el.props.initial.author[0]).not.toHaveProperty("json_metadata");
    expect(el.props.titles.community).toBeDefined();
    // What the browser needs to ask again, and no more of the body than that.
    expect(el.props.similarInput.title).toBe("The post");
    expect(el.props.similarInput.body.length).toBeLessThanOrEqual(6000);
  });

  it("renders on the server alone when every feed answered", async () => {
    answers.set("similar", []);
    const el = (await EntryRelatedFooter({ entry: post() })) as React.ReactElement<any>;
    expect(el.type).not.toBe(EntryRelatedFooterRefill);
    expect(mark).not.toHaveBeenCalled();
  });
});
