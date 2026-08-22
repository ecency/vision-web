import { describe, expect, it } from "vitest";
import { normalizeFeedTag } from "@/app/(dynamicPages)/feed/[...sections]/_helpers";

/**
 * The expectations below are hivemind's own answers, probed against a node on
 * 2026-08-22 with `bridge.get_ranked_posts`: everything marked unqueryable
 * came back ``Assert Exception:invalid tag `X` ``, and everything marked
 * queryable either returned rows or failed on existence ("Tag X does not
 * exist"), which is a legitimate answer rather than a rejected request.
 */
describe("normalizeFeedTag", () => {
  it("lowercases a real tag typed with capitals", () => {
    expect(normalizeFeedTag("Flipkart")).toEqual({ tag: "flipkart", queryable: true });
    expect(normalizeFeedTag("dtube-Sinking")).toEqual({ tag: "dtube-sinking", queryable: true });
  });

  it("maps the global feed to the tagless query", () => {
    expect(normalizeFeedTag("global")).toEqual({ tag: "", queryable: true });
    expect(normalizeFeedTag("")).toEqual({ tag: "", queryable: true });
  });

  it.each(["photography", "hive-125", "a-b_c", "web3"])("keeps %s queryable", (raw) => {
    expect(normalizeFeedTag(raw)).toEqual({ tag: raw, queryable: true });
  });

  it.each([
    ["a space", "luxury villas"],
    ["an apostrophe", "shepherd's"],
    ["punctuation", "playingtogether!"],
    ["a dot", "daily.prompt"],
    ["non-ASCII", "tëst"],
    ["a slash from a stray path", "lifeesteem/rss.xml"]
  ])("refuses to query a tag with %s", (_label, raw) => {
    const { queryable } = normalizeFeedTag(raw);
    expect(queryable).toBe(false);
  });

  it("still queries @account feeds, which use a different method and its own rules", () => {
    expect(normalizeFeedTag("@Someone")).toEqual({ tag: "@someone", queryable: true });
    expect(normalizeFeedTag("%40Someone")).toEqual({ tag: "%40someone", queryable: true });
  });

  it("lowercasing alone does not make an invalid shape queryable", () => {
    expect(normalizeFeedTag("Luxury Villas")).toEqual({ tag: "luxury villas", queryable: false });
  });
});
