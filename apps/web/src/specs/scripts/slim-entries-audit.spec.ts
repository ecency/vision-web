import { describe, expect, it } from "vitest";
import { auditSource } from "../../../../../scripts/slim-entries-audit.mjs";

/**
 * The rule the audit backs up: a single-page builder goes with
 * withSlimPageEntries, an infinite one with withSlimEntries. It used to be one
 * function with an { isolateKey } flag, and every hole found in this audit came
 * from trying to prove a flag was present: a builder passed as a variable, a
 * trailing spread undoing the literal, a computed key. Two names removed that
 * whole class, and what remains is checked here.
 */
const src = (body: string) =>
  `import { withSlimEntries, withSlimPageEntries } from "@/core/entries/slim-entry";\n${body}\n`;

describe("slim-entries audit", () => {
  it("accepts a single-page builder wrapped with the page helper", () => {
    expect(
      auditSource("f.ts", src(`const o = withSlimPageEntries(getPostsRankedQueryOptions("created"));`))
    ).toEqual([]);
  });

  it("accepts an infinite builder wrapped with the shared-key helper", () => {
    expect(
      auditSource("f.ts", src(`const o = withSlimEntries(getPostsRankedInfiniteQueryOptions("trending", ""));`))
    ).toEqual([]);
  });

  it("flags a single-page builder that keeps the shared key", () => {
    const found = auditSource("f.ts", src(`const o = withSlimEntries(getPostsRankedQueryOptions("created"));`));
    expect(found).toHaveLength(1);
    expect(found[0]).toContain("use withSlimPageEntries");
  });

  it("flags a single-page builder passed through a const, the real shape", () => {
    // Both production call sites look like this, and the first version of this
    // audit could not see either of them.
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

  it("accepts that same const shape once it uses the page helper", () => {
    expect(
      auditSource(
        "f.ts",
        src(`function load() {
          const options = getAccountPostsQueryOptions("alice", "posts");
          return withSlimPageEntries(options);
        }`)
      )
    ).toEqual([]);
  });

  it("flags an infinite builder given its own cache identity", () => {
    const found = auditSource(
      "f.ts",
      src(`function build() {
        const options = getAccountPostsInfiniteQueryOptions("alice", "posts");
        return withSlimPageEntries(options);
      }`)
    );
    expect(found).toHaveLength(1);
    expect(found[0]).toContain("use withSlimEntries");
  });

  it("respects shadowing, where the inner declaration is the one that runs", () => {
    expect(
      auditSource(
        "f.ts",
        src(`function build() {
          const options = getPostsRankedQueryOptions("x");
          {
            const options = getPostsRankedInfiniteQueryOptions("y", "");
            return withSlimEntries(options);
          }
        }`)
      )
    ).toEqual([]);
  });

  it("reports rather than guesses when one name has two declarations in scope", () => {
    // Guessing here produced false failures on correct code, and a rule that is
    // sometimes wrong about correct code is one people learn to ignore.
    const found = auditSource(
      "f.ts",
      src(`function build(kind) {
        if (kind) {
          const options = getAccountPostsQueryOptions("a", "posts");
          return withSlimPageEntries(options);
        }
        const options = getAccountPostsInfiniteQueryOptions("a", "posts");
        return withSlimEntries(options);
      }`)
    );
    expect(found.every((f) => f.includes("cannot tell"))).toBe(true);
  });

  it("reports a let, which can hold a different builder by the time it runs", () => {
    const found = auditSource(
      "f.ts",
      src(`function build(k) {
        let options = getAccountPostsQueryOptions("a", "posts");
        if (k) options = getAccountPostsInfiniteQueryOptions("a", "posts");
        return withSlimEntries(options);
      }`)
    );
    expect(found).toHaveLength(1);
    expect(found[0]).toContain("cannot tell");
  });

  it("reports an identifier it cannot trace at all", () => {
    const found = auditSource("f.ts", src(`const o = withSlimEntries(importedOptions);`));
    expect(found).toHaveLength(1);
    expect(found[0]).toContain("cannot tell");
  });

  it("says nothing about a wrapper around something that is not a feed builder", () => {
    // getPromotedPostsQuery is slimmed too and needs no opinion about its key.
    expect(auditSource("f.ts", src(`const o = withSlimEntries(getPromotedPostsQuery());`))).toEqual([]);
  });

  it("says nothing about a query that is not slimmed at all", () => {
    expect(auditSource("f.ts", src(`const o = getPostsRankedQueryOptions("created");`))).toEqual([]);
  });

  // An adversarial sweep of 81 attempts against this audit confirmed these two.
  // Both survived the split into two wrappers, because they are about telling
  // WHICH builder is wrapped rather than about the argument that used to exist.
  it("sees through a builder aliased on its import", () => {
    // Aliasing an @ecency/sdk import is ordinary style in this repo, so the
    // guard was silent on exactly the files most likely to do it.
    const found = auditSource(
      "f.ts",
      `import { withSlimEntries } from "@/core/entries/slim-entry";
       import { getPostsRankedQueryOptions as getRankedPage } from "@ecency/sdk";
       export const o = withSlimEntries(getRankedPage("trending", "", "", 20, "", ""));`
    );
    expect(found).toHaveLength(1);
    expect(found[0]).toContain("use withSlimPageEntries");
  });

  it("sees through an infinite builder aliased on its import", () => {
    const found = auditSource(
      "f.ts",
      `import { withSlimPageEntries } from "@/core/entries/slim-entry";
       import { getPostsRankedInfiniteQueryOptions as rankedInf } from "@ecency/sdk";
       export const o = withSlimPageEntries(rankedInf("trending", ""));`
    );
    expect(found).toHaveLength(1);
    expect(found[0]).toContain("use withSlimEntries");
  });

  it("sees through a builder renamed by a local const", () => {
    const found = auditSource(
      "f.ts",
      src(`const getRankedPage = getPostsRankedQueryOptions;
           const o = withSlimEntries(getRankedPage("trending"));`)
    );
    expect(found).toHaveLength(1);
    expect(found[0]).toContain("use withSlimPageEntries");
  });

  it("does not bind a name to a declaration in a different function", () => {
    // The walk used to climb past arrow functions and search the whole file, so
    // a branchy `let options` bound to an unrelated const elsewhere and the real
    // violation went unreported.
    const found = auditSource(
      "f.ts",
      src(`export function buildFeedQueryOptions(what, tag, limit, observer) {
             const options = getPostsRankedInfiniteQueryOptions(what, tag, limit, observer);
             return withSlimEntries(options);
           }
           export const buildArchiveOptions = (what, tag, limit) => {
             let options;
             if (tag.startsWith("@")) {
               options = getAccountPostsInfiniteQueryOptions(tag, what, limit, "", true);
             } else {
               options = getPostsRankedQueryOptions(what, "", "", limit, tag, "");
             }
             return withSlimEntries(options);
           };`)
    );
    expect(found).toHaveLength(1);
    expect(found[0]).toContain("cannot tell");
  });

  it("does not let a nested alias shadow an import at an outer call site", () => {
    // The alias map used to be file-wide, so this inner `const build` overwrote
    // the import alias and the outer violation disappeared entirely.
    const found = auditSource(
      "f.ts",
      `import { withSlimEntries } from "@/core/entries/slim-entry";
       import { getPostsRankedQueryOptions as build } from "@ecency/sdk";
       export function outer() {
         return withSlimEntries(build("trending", "", "", 20, "", ""));
       }
       export function inner() {
         const build = getPostsRankedInfiniteQueryOptions;
         return withSlimEntries(build("trending", ""));
       }`
    );
    expect(found).toHaveLength(1);
    expect(found[0]).toContain("use withSlimPageEntries");
    expect(found[0]).toContain(":4");
  });

  it("lets a local alias shadow an import where it really does", () => {
    expect(
      auditSource(
        "f.ts",
        `import { getPostsRankedQueryOptions as build } from "@ecency/sdk";
         export function inner() {
           const build = getPostsRankedInfiniteQueryOptions;
           return withSlimEntries(build("trending", ""));
         }`
      )
    ).toEqual([]);
  });

  it("sees a const declared in an enclosing function from a nested arrow", () => {
    const found = auditSource(
      "f.ts",
      src(`export function outer() {
             const options = getPostsRankedQueryOptions("x");
             const go = () => withSlimEntries(options);
             return go();
           }`)
    );
    expect(found).toHaveLength(1);
    expect(found[0]).toContain("use withSlimPageEntries");
  });

  // Scope resolution, the whole model rather than the one shape reported. Both
  // resolvers now share one collector, because they had drifted apart and each
  // descended into child blocks.
  it("does not let a closed if-block shadow a name used after it", () => {
    const found = auditSource(
      "f.ts",
      `import { withSlimEntries } from "@/core/entries/slim-entry";
       import { getPostsRankedQueryOptions as build } from "@ecency/sdk";
       export function f(flag) {
         if (flag) {
           const build = getPostsRankedInfiniteQueryOptions;
           void build;
         }
         return withSlimEntries(build("t", "", "", 20, "", ""));
       }`
    );
    expect(found).toHaveLength(1);
    expect(found[0]).toContain("use withSlimPageEntries");
  });

  it("resolves to the inner const for a call inside that block", () => {
    expect(
      auditSource(
        "f.ts",
        src(`export function h(flag) {
               if (flag) {
                 const options = getPostsRankedInfiniteQueryOptions("t", "");
                 return withSlimEntries(options);
               }
             }`)
      )
    ).toEqual([]);
  });

  it.each([
    [
      "a switch case",
      `export function s(k) {
         switch (k) {
           case 1: {
             const options = getPostsRankedQueryOptions("t");
             return withSlimEntries(options);
           }
           default:
             return null;
         }
       }`
    ],
    [
      "a for loop that has already closed",
      `export function l() {
         for (let i = 0; i < 2; i++) {
           const options = getPostsRankedInfiniteQueryOptions("t", "");
           void options;
         }
         const options = getPostsRankedQueryOptions("t");
         return withSlimEntries(options);
       }`
    ]
  ])("gets the binding right across %s", (_label, body) => {
    const found = auditSource("f.ts", src(body));
    expect(found).toHaveLength(1);
    expect(found[0]).toContain("use withSlimPageEntries");
  });
});
