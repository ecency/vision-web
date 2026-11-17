import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// #1869: a takedown has to drop every cached address of a post, not only the
// page. `--post` expands one post into all of them, and `--dry-run` prints the
// list without credentials or a request, so the expansion can be checked.

const here = dirname(fileURLToPath(import.meta.url));
const script = resolve(here, "../../../../../scripts/purge-cache.sh");

function run(...args: string[]) {
  return spawnSync("bash", [script, ...args], {
    encoding: "utf8",
    env: { PATH: process.env.PATH ?? "" }
  });
}

const urls = (stdout: string) => stdout.split("\n").filter((l) => l.startsWith("https://"));

describe("purge-cache.sh --post", () => {
  it("expands a post into the page, its machine-readable forms and its oEmbed", () => {
    const r = run("--dry-run", "--post", "@alice/bad-post");
    expect(r.status).toBe(0);
    expect(urls(r.stdout)).toEqual([
      "https://ecency.com/@alice/bad-post",
      "https://ecency.com/@alice/bad-post.md",
      "https://ecency.com/@alice/bad-post.json",
      "https://ecency.com/@alice/bad-post.discussion.json",
      "https://ecency.com/api/oembed?url=https%3A%2F%2Fecency.com%2F%40alice%2Fbad-post&format=json"
    ]);
  });

  it("adds the category form of the page when given", () => {
    const r = run("--dry-run", "--post", "hive-123456/@alice/bad-post");
    expect(r.status).toBe(0);
    expect(urls(r.stdout)).toContain("https://ecency.com/hive-123456/@alice/bad-post");
    expect(urls(r.stdout)).toContain("https://ecency.com/@alice/bad-post.json");
    // Link cards request oEmbed for the link as written, category form included.
    expect(urls(r.stdout)).toContain(
      "https://ecency.com/api/oembed?url=https%3A%2F%2Fecency.com%2Fhive-123456%2F%40alice%2Fbad-post&format=json"
    );
  });

  it("takes several posts and plain URLs together", () => {
    const r = run("--dry-run", "--post", "@alice/one", "--post", "@bob/two", "https://ecency.com/@carol");
    expect(r.status).toBe(0);
    const list = urls(r.stdout);
    expect(list).toHaveLength(11);
    expect(list).toContain("https://ecency.com/@bob/two.discussion.json");
    expect(list).toContain("https://ecency.com/@carol");
  });

  it("refuses a malformed post path", () => {
    for (const bad of ["alice/bad-post", "@alice", "@alice/", "@alice/a b", "@alice/bad-post.md"]) {
      const r = run("--dry-run", "--post", bad);
      expect(r.status, bad).not.toBe(0);
      expect(r.stderr).toMatch(/@author\/permlink/);
    }
  });

  it("does not need credentials for a dry run", () => {
    const r = run("--dry-run", "https://ecency.com/@alice");
    expect(r.status).toBe(0);
  });

  it("still needs credentials for a real purge", () => {
    const r = run("--post", "@alice/bad-post");
    expect(r.status).not.toBe(0);
    expect(r.stderr).toMatch(/CF_ZONE_ID and CF_API_TOKEN/);
  });

  it("refuses an unknown flag instead of purging it as a URL", () => {
    const r = run("--dryrun", "--post", "@alice/bad-post");
    expect(r.status).not.toBe(0);
    expect(r.stderr).toMatch(/unknown option --dryrun/);
  });

  it("lists the origin SSR cache files of each URL, for both cache namespaces", () => {
    const r = run("--origin-files", "--post", "@alice/bad-post");
    expect(r.status).toBe(0);
    const files = r.stdout.split("\n").filter((l) => l.startsWith("/"));
    // Five URLs, each cached once for browsers and once for limited-HTML bots.
    expect(files).toHaveLength(10);
    const md5 = (s: string) => createHash("md5").update(s).digest("hex");
    const browser = md5("/@alice/bad-post");
    const bot = md5("/@alice/bad-post|htmlbot");
    // levels=1:2: the last hex digit, then the two before it.
    expect(files).toContain(`/var/cache/nginx/ssr/${browser.slice(-1)}/${browser.slice(-3, -1)}/${browser}`);
    expect(files).toContain(`/var/cache/nginx/ssr/${bot.slice(-1)}/${bot.slice(-3, -1)}/${bot}`);
  });

  it("keys a URL with no path as the site root", () => {
    const r = run("--origin-files", "https://ecency.com");
    const md5 = createHash("md5").update("/").digest("hex");
    expect(r.stdout).toContain(`/${md5.slice(-1)}/${md5.slice(-3, -1)}/${md5}`);
  });

  it("also purges the lowercased oEmbed key link cards use for a mixed-case link", () => {
    const r = run("--dry-run", "--post", "Hive-123/@alice/Old_Post");
    expect(urls(r.stdout)).toContain(
      "https://ecency.com/api/oembed?url=https%3A%2F%2Fecency.com%2Fhive-123%2F%40alice%2Fold_post&format=json"
    );
    expect(urls(r.stdout)).toContain(
      "https://ecency.com/api/oembed?url=https%3A%2F%2Fecency.com%2FHive-123%2F%40alice%2FOld_Post&format=json"
    );
  });

  it("ignores a URL fragment, which never reaches a cache", () => {
    const withFragment = run("--origin-files", "https://ecency.com/@alice/bad-post#comments");
    const without = run("--origin-files", "https://ecency.com/@alice/bad-post");
    expect(withFragment.stdout).toBe(without.stdout);
    const dry = run("--dry-run", "https://ecency.com/@alice/bad-post#comments");
    expect(urls(dry.stdout)).toEqual(["https://ecency.com/@alice/bad-post"]);
  });
});
