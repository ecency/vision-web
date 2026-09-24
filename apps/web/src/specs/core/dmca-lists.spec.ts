// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import ts from "typescript";
import dmcaAccounts from "../../../public/dmca/dmca-accounts.json";
import dmcaTags from "../../../public/dmca/dmca-tags.json";
import dmcaPosts from "../../../public/dmca/dmca-posts.json";

const { validatePostPath } = createRequire(import.meta.url)(
  "../../../../../packages/sdk/scripts/validate-dmca-patterns.cjs"
) as { validatePostPath: (entry: unknown) => { valid: boolean; errors: string[] } };

const { setDmcaLists } = vi.hoisted(() => ({ setDmcaLists: vi.fn() }));

vi.mock("@ecency/sdk", () => ({ ConfigManager: { setDmcaLists } }));

const webRoot = fileURLToPath(new URL("../../../", import.meta.url));
const source = (path: string) => readFileSync(`${webRoot}${path}`, "utf8");

/**
 * Every entry point that serves post data outside the root layout. A page gets
 * the lists from sdk-init through the layout; these do not, and each one is a
 * surface that served a taken-down post in full before #1862.
 */
const LOADERS = [
  "src/core/sdk-init.ts",
  "src/app/(dynamicPages)/entry/_helpers/agent-readable.ts",
  "src/features/rss/entries-rss-handler.ts",
  "src/app/api/import/route.ts"
];

describe("takedown lists", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("loads the published lists into the SDK config when called", async () => {
    const { loadDmcaLists } = await import("@/core/dmca-lists");

    expect(setDmcaLists).not.toHaveBeenCalled();
    loadDmcaLists();

    expect(setDmcaLists).toHaveBeenCalledTimes(1);
    expect(setDmcaLists).toHaveBeenCalledWith({
      accounts: dmcaAccounts.accounts,
      tags: dmcaTags.tags,
      posts: dmcaPosts.posts
    });
  });

  it("ships a non-empty post list, so the filters below it have something to do", () => {
    // A takedown list that silently emptied would make every filter a no-op
    // and nothing else would notice.
    expect(dmcaPosts.posts.length).toBeGreaterThan(0);
    // Exact `@author/permlink`, the shape the SDK filter compares with
    // Array.includes. The rule lives in the CI validator (#1873) so the list
    // has one definition of a valid entry; this pins the shipped list to it.
    for (const path of dmcaPosts.posts) {
      expect(validatePostPath(path)).toEqual({ valid: true, errors: [] });
    }
    // And the rule is not vacuous: a regex-shaped entry is refused.
    expect(validatePostPath("@author/.*").valid).toBe(false);
  });

  describe("the SDK-free leaf", () => {
    // Its own module because the sitemap writer and the Speak audio proxy use
    // the React-free `@ecency/sdk/hive` entry and must not pull the query
    // barrel in just to ask whether a post is taken down.
    it("matches a listed path and nothing else", async () => {
      const { isTakenDownPost } = await import("@/core/dmca-posts");
      const [author, permlink] = dmcaPosts.posts[0].slice(1).split("/");

      expect(isTakenDownPost(author, permlink)).toBe(true);
      expect(isTakenDownPost(author, `${permlink}-other`)).toBe(false);
      expect(isTakenDownPost("someoneelse", permlink)).toBe(false);
    });

    it("normalises casing, because a URL carries whatever was shared", async () => {
      const { isTakenDownPost } = await import("@/core/dmca-posts");
      const [author, permlink] = dmcaPosts.posts[0].slice(1).split("/");

      expect(isTakenDownPost(author.toUpperCase(), permlink.toUpperCase())).toBe(true);
    });

    it("imports no SDK, so a hive-only route can use it", () => {
      expect(source("src/core/dmca-posts.ts")).not.toMatch(/from\s+"@ecency\/sdk/);
    });
  });

  /**
   * The one failure this file exists to catch, and the one vitest cannot see
   * by running the code: `sideEffects` in package.json is an allowlist, so
   * webpack drops a bare `import "@/core/dmca-lists"` from the production
   * bundle while every test here stays green. Proved on a real `next build`:
   * with the bare import, the module's own data (the only importer of
   * dmca-tags.json) was in 0 output files; through a call, it is there.
   * So assert the shape of the call site, which is what the bundler reads.
   */
  describe("reaches the production bundle", () => {
    it.each(LOADERS)("%s calls the loader unconditionally at module scope", (path) => {
      const text = source(path);
      expect(text).toMatch(
        /import\s*\{[^}]*\bloadDmcaLists\b[^}]*\}\s*from\s*"@\/core\/dmca-lists"/
      );

      // Parsed, not pattern-matched: a regex over the source accepts
      // `if (someCondition)` on the line above and so passes a call that never
      // runs. `statements` is the module body itself, so an `if`, a function
      // body or a lazy branch is not in it.
      const file = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true);
      const callsAtTopLevel = file.statements.some(
        (statement) =>
          ts.isExpressionStatement(statement) &&
          ts.isCallExpression(statement.expression) &&
          ts.isIdentifier(statement.expression.expression) &&
          statement.expression.expression.text === "loadDmcaLists" &&
          statement.expression.arguments.length === 0
      );
      expect(callsAtTopLevel).toBe(true);
    });

    it("has no bare side-effect import of the lists anywhere", () => {
      for (const path of LOADERS) {
        expect(source(path)).not.toMatch(/import\s*"@\/core\/dmca-lists"/);
      }
    });

    it("keeps the module itself free of a module-top call", () => {
      // A call at module scope here would be pruned with the module.
      const text = source("src/core/dmca-lists.ts");
      expect(text).toMatch(/export function loadDmcaLists\(\)/);
      expect(text).not.toMatch(/^ConfigManager\.setDmcaLists\(/m);
    });
  });
});
