import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const script = resolve(__dirname, "../scripts/validate-dmca-patterns.cjs");
const { validatePostPath } = createRequire(import.meta.url)(script) as {
  validatePostPath: (entry: unknown) => { valid: boolean; errors: string[] };
};
const lists = resolve(__dirname, "../../../apps/web/public/dmca");

const run = (tags: string, posts: string) =>
  spawnSync(process.execPath, [script, tags, posts], { encoding: "utf8" });

/**
 * The posts list is compared with `Array.includes`, never compiled (#1873), so
 * an entry that reads like a regex passes a regex screen and then matches
 * nothing. The validator is the one place that shape is decided; the web spec
 * pins the shipped list with the same rule.
 */
describe("validate-dmca-patterns: posts are exact match only", () => {
  it("accepts a real listed path", () => {
    expect(validatePostPath("@jundi1443/--r0jhik").valid).toBe(true);
    expect(validatePostPath("@abc.def/some-post_1.2").valid).toBe(true);
    expect(validatePostPath("@abcdefghijklmnop/x").valid).toBe(true);
  });

  it.each([
    ["@author/.*"],
    ["@author/post-.+"],
    ["@author/(post|other)"],
    ["@author/post?"],
    ["@author/[a-z]+"],
    ["@author/post "],
    ["@Author/post"],
    ["@author/Post"],
    ["author/post"],
    ["@author/post/"],
    ["@author/"],
    ["@ab/post"],
    ["@author-/post"],
    ["@ab.cde/post"],
    ["@toolongaccountname/post"],
    ["@abcdefghijklmnopq/x"],
    [`@author/${"a".repeat(256)}`],
  ])("rejects %s", (entry) => {
    const result = validatePostPath(entry);
    expect(result.valid).toBe(false);
    expect(result.errors.join(" ")).toMatch(
      /exact string equality, never as a regex/,
    );
  });

  it("accepts a permlink at the chain's 255 character limit", () => {
    expect(validatePostPath(`@author/${"a".repeat(255)}`).valid).toBe(true);
  });

  it("passes the shipped lists", () => {
    const result = run(
      join(lists, "dmca-tags.json"),
      join(lists, "dmca-posts.json"),
    );
    expect(result.stdout).toMatch(/Validation PASSED/);
    expect(result.status).toBe(0);
  });

  it("fails the CLI on a regex-shaped post entry", () => {
    const dir = mkdtempSync(join(tmpdir(), "dmca-"));
    try {
      const posts = join(dir, "posts.json");
      writeFileSync(
        posts,
        JSON.stringify({ posts: ["@jundi1443/--r0jhik", "@author/.*", 7] }),
      );
      const result = run(join(lists, "dmca-tags.json"), posts);
      expect(result.status).toBe(1);
      expect(result.stderr).toMatch(/"@author\/\.\*"/);
      expect(result.stderr).toMatch(/2\/3 post patterns failed/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
