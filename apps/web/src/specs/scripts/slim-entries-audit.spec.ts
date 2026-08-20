import { describe, expect, it } from "vitest";
import { auditSource } from "../../../../../scripts/slim-entries-audit.mjs";

/**
 * The audit's first version only matched a builder written inline, so both real
 * call sites, which pass the options through a local const, slipped past it: the
 * guard reported "no findings" while the exact regressions it exists to prevent
 * were present. These fixtures pin the shapes that actually appear in the app.
 */
const src = (body: string) => `import { withSlimEntries } from "@/core/entries/slim-entry";\n${body}\n`;

describe("slim-entries audit", () => {
  it("accepts a single-page builder that isolates its key", () => {
    expect(
      auditSource("f.ts", src(`const o = withSlimEntries(getPostsRankedQueryOptions("created"), { isolateKey: true });`))
    ).toEqual([]);
  });

  it("flags a single-page builder written inline without isolateKey", () => {
    const found = auditSource("f.ts", src(`const o = withSlimEntries(getPostsRankedQueryOptions("created"));`));
    expect(found).toHaveLength(1);
    expect(found[0]).toContain("needs { isolateKey: true }");
  });

  it("flags a single-page builder passed through a variable, the real shape", () => {
    const found = auditSource(
      "f.ts",
      src(`function load() {
        const options = getAccountPostsQueryOptions("alice", "posts");
        return withSlimEntries(options);
      }`)
    );
    expect(found).toHaveLength(1);
    expect(found[0]).toContain("getAccountPostsQueryOptions");
  });

  it("accepts that same variable shape once it isolates the key", () => {
    expect(
      auditSource(
        "f.ts",
        src(`function load() {
          const options = getAccountPostsQueryOptions("alice", "posts");
          return withSlimEntries(options, { isolateKey: true });
        }`)
      )
    ).toEqual([]);
  });

  it("flags an infinite builder that isolates its key, through a variable", () => {
    const found = auditSource(
      "f.ts",
      src(`function build() {
        const options = getAccountPostsInfiniteQueryOptions("alice", "posts");
        return withSlimEntries(options, { isolateKey: true });
      }`)
    );
    expect(found).toHaveLength(1);
    expect(found[0]).toContain("must NOT set isolateKey");
  });

  it("accepts an infinite builder with no options", () => {
    expect(
      auditSource("f.ts", src(`const o = withSlimEntries(getPostsRankedInfiniteQueryOptions("trending", ""));`))
    ).toEqual([]);
  });

  it("reports an identifier it cannot trace rather than passing it", () => {
    // A guard that silently ignores what it cannot read is not a guard: that is
    // precisely how the variable shape went unchecked. An options value from
    // outside the function cannot be classified, so it is reported.
    const found = auditSource("f.ts", src(`const o = withSlimEntries(importedOptions);`));
    expect(found).toHaveLength(1);
    expect(found[0]).toContain("cannot tell which builder is wrapped");
  });

  it("ignores a wrapper around something that is not a feed builder", () => {
    // getPromotedPostsQuery is slimmed too and needs no key opinion.
    expect(auditSource("f.ts", src(`const o = withSlimEntries(getPromotedPostsQuery());`))).toEqual([]);
  });

  it("reports options it cannot read literally", () => {
    const found = auditSource(
      "f.ts",
      src(`const o = withSlimEntries(getPostsRankedQueryOptions("created"), opts);`)
    );
    expect(found).toHaveLength(1);
    expect(found[0]).toContain("cannot read");
  });

  it("says nothing about queries that are not slimmed", () => {
    expect(auditSource("f.ts", src(`const o = getPostsRankedQueryOptions("created");`))).toEqual([]);
  });
});
