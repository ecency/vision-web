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
  `import { withSlimEntries, withSlimPageEntries, withCardOnlyPageEntries } from "@/core/entries/slim-entry";\n${body}\n`;

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

  it("accepts a single-page builder wrapped card-only, which also isolates its key", () => {
    expect(
      auditSource(
        "f.ts",
        src(`const o = withCardOnlyPageEntries(getAccountPostsQueryOptions("alice", "posts"));`)
      )
    ).toEqual([]);
  });

  it("flags an infinite builder wrapped card-only, since a feed does show vote state", () => {
    const found = auditSource(
      "f.ts",
      src(`const o = withCardOnlyPageEntries(getPostsRankedInfiniteQueryOptions("trending", ""));`)
    );
    expect(found).toHaveLength(1);
    expect(found[0]).toContain("infinite builder");
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

  it("resolves each branch to its own const, because that is what runs", () => {
    // This used to report "cannot tell" twice: the walk searched a whole
    // function at once and saw two declarations of `options`. Each block is its
    // own scope, both calls are correct, and correct code should be silent.
    expect(
      auditSource(
        "f.ts",
        src(`function build(kind) {
          if (kind) {
            const options = getAccountPostsQueryOptions("a", "posts");
            return withSlimPageEntries(options);
          }
          const options = getAccountPostsInfiniteQueryOptions("a", "posts");
          return withSlimEntries(options);
        }`)
      )
    ).toEqual([]);
  });

  it("reports rather than guesses when one scope declares a name twice", () => {
    const found = auditSource(
      "f.ts",
      src(`function build() {
        const options = getAccountPostsQueryOptions("a", "posts");
        const options = getAccountPostsInfiniteQueryOptions("a", "posts");
        return withSlimEntries(options);
      }`)
    );
    expect(found).toHaveLength(1);
    expect(found[0]).toContain("cannot tell");
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

  // A name can be bound by something this cannot read, and such a binding still
  // SHADOWS the outer one. Ignoring it meant resolving to an import the code
  // never calls and reporting correct code as a mismatch.
  it.each([
    [
      "a parameter shadowing the wrapper itself",
      `import { withSlimEntries } from "@/core/entries/slim-entry";
       import { getPostsRankedQueryOptions } from "@ecency/sdk";
       export function harness(withSlimEntries) {
         return withSlimEntries(getPostsRankedQueryOptions("trending"));
       }`
    ],
    [
      "a parameter shadowing the builder",
      `import { getPostsRankedQueryOptions } from "@ecency/sdk";
       export function f(getPostsRankedQueryOptions) {
         return withSlimEntries(getPostsRankedQueryOptions("x"));
       }`
    ],
    [
      "a function declaration of the same name",
      `import { getPostsRankedQueryOptions } from "@ecency/sdk";
       export function g() {
         function getPostsRankedQueryOptions() { return {}; }
         return withSlimEntries(getPostsRankedQueryOptions());
       }`
    ],
    [
      "a destructured property",
      `export function outer() {
         const options = getPostsRankedQueryOptions("x");
         return function inner(props) {
           const { options } = props;
           return withSlimEntries(options);
         };
       }`
    ],
    [
      "a caught error",
      `export function c() {
         try {
           return null;
         } catch (options) {
           return withSlimEntries(options);
         }
       }`
    ]
  ])("does not report correct code because of %s", (_label, body) => {
    const found = auditSource("f.ts", body);
    expect(found.every((f) => f.includes("cannot tell"))).toBe(true);
  });

  it("still reports the genuine violation next to such a binding", () => {
    const found = auditSource(
      "f.ts",
      `import { withSlimEntries } from "@/core/entries/slim-entry";
       import { getPostsRankedQueryOptions } from "@ecency/sdk";
       export const o = withSlimEntries(getPostsRankedQueryOptions("trending"));`
    );
    expect(found).toHaveLength(1);
    expect(found[0]).toContain("use withSlimPageEntries");
  });

  it("does not mistake a named function expression's own name for the wrapper", () => {
    // The name of a named function expression is bound inside its own body, so
    // this recursive call is not our wrapper at all.
    expect(
      auditSource(
        "f.ts",
        `import { withSlimEntries } from "@/core/entries/slim-entry";
         import { getPostsRankedQueryOptions } from "@ecency/sdk";
         export const f = function withSlimEntries(o) {
           return withSlimEntries(getPostsRankedQueryOptions("x"));
         };`
      )
    ).toEqual([]);
  });

  it("treats a named class expression's own name the same way", () => {
    const found = auditSource(
      "f.ts",
      `import { getPostsRankedQueryOptions } from "@ecency/sdk";
       export const C = class getPostsRankedQueryOptions {
         m() { return withSlimEntries(getPostsRankedQueryOptions()); }
       };`
    );
    expect(found.every((f) => f.includes("cannot tell"))).toBe(true);
    expect(found).toHaveLength(1);
  });

  it("still reports a genuine violation inside a class method", () => {
    const found = auditSource(
      "f.ts",
      src(`export class Column {
             load() { return withSlimEntries(getPostsRankedQueryOptions("t")); }
           }`)
    );
    expect(found).toHaveLength(1);
    expect(found[0]).toContain("use withSlimPageEntries");
  });

  it("stops at a self-binding reached through an identifier argument", () => {
    // The identifier path resolves through resolveBuilder rather than the
    // callee's own canonicalisation, so it needs its own case: without the
    // self-binding check it climbed past the function and blamed the outer const.
    const found = auditSource(
      "f.ts",
      `import { withSlimEntries } from "@/core/entries/slim-entry";
       const options = getPostsRankedQueryOptions("x");
       export const f = function options() { return withSlimEntries(options); };`
    );
    expect(found).toHaveLength(1);
    expect(found[0]).toContain("cannot tell");
  });

  it.each([
    ["at module scope", `export class getPostsRankedQueryOptions { m() { return withSlimEntries(getPostsRankedQueryOptions()); } }`],
    ["inside a function", `export function o() { class getPostsRankedQueryOptions { m() { return withSlimEntries(getPostsRankedQueryOptions()); } } }`],
    ["inside a block", `export function o() { { class getPostsRankedQueryOptions { m() { return withSlimEntries(getPostsRankedQueryOptions()); } } } }`]
  ])("does not attribute a class declaration's own name to an import, %s", (_label, body) => {
    // Declarations bind in the scope AROUND them, which the child-level check
    // already covers, so these are pinned here rather than in bindsOwnName.
    const found = auditSource(
      "f.ts",
      `import { getPostsRankedQueryOptions } from "@ecency/sdk";\n${body}`
    );
    expect(found.every((f) => f.includes("cannot tell"))).toBe(true);
    expect(found.length).toBeGreaterThan(0);
  });
});
