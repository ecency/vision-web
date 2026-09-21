import { describe, expect, it } from "vitest";
import type { Entry } from "@/entities";
import {
  renderEntryMarkdown,
  selfUrl
} from "@/app/(dynamicPages)/entry/_helpers/entry-agent-format";

function makeEntry(overrides: Partial<Entry> = {}): Entry {
  return {
    author: "alice",
    permlink: "my-post",
    title: "Hello World",
    body: "This is the **raw** on-chain body.\n\n![img](https://x/y.png)",
    category: "hive-101010",
    community: "hive-101010",
    community_title: "Photography",
    created: "2026-06-03T19:31:27",
    updated: "2026-06-03T20:00:00",
    payout: 12.34,
    json_metadata: { tags: ["hive", "photography"], app: "ecency/4.0" },
    ...overrides
  } as unknown as Entry;
}

describe("renderEntryMarkdown", () => {
  it("emits YAML front matter, an H1 heading, then the raw body verbatim", () => {
    const md = renderEntryMarkdown(makeEntry());

    expect(md.startsWith("---\n")).toBe(true);
    expect(md).toContain('title: "Hello World"');
    expect(md).toContain('author: "@alice"');
    expect(md).toContain('permlink: "my-post"');
    expect(md).toContain('type: "post"');
    expect(md).toContain('community: "hive-101010"');
    expect(md).toContain('tags: ["hive","photography"]');
    expect(md).toContain('app: "ecency/4.0"');
    expect(md).toContain('canonical_url: "https://ecency.com/@alice/my-post"');
    // Heading + the body passed through untouched (not re-rendered to HTML).
    expect(md).toContain("\n# Hello World\n\n");
    expect(md).toContain("This is the **raw** on-chain body.");
    expect(md).toContain("![img](https://x/y.png)");
  });

  it("marks comments as type comment and omits the heading when there is no title", () => {
    const md = renderEntryMarkdown(
      makeEntry({ title: "", parent_author: "someone", parent_permlink: "root" })
    );
    expect(md).toContain('type: "comment"');
    expect(md).not.toMatch(/^title:/m);
    expect(md).not.toContain("\n# ");
  });

  it("skips empty/missing front-matter fields", () => {
    const md = renderEntryMarkdown(
      makeEntry({ community: "", community_title: "", json_metadata: { tags: [] } })
    );
    expect(md).not.toContain("community:");
    expect(md).not.toContain("community_title:");
    expect(md).not.toContain("tags:");
    expect(md).not.toContain("app:");
  });

  it("collapses newlines in the H1 heading (front matter stays escaped)", () => {
    const md = renderEntryMarkdown(makeEntry({ title: "Line one\nLine two" }));
    expect(md).toContain("# Line one Line two\n\n");
    expect(md).not.toContain("# Line one\nLine two");
    // front matter keeps the title as a single escaped scalar
    expect(md).toContain('title: "Line one\\nLine two"');
  });

  // These endpoints are served from an entry fetched through condenser_api,
  // which hands back json_metadata as a raw string, so both lines were absent
  // from every document a crawler or model read.
  it("emits tags and app when json_metadata arrived as a string", () => {
    const md = renderEntryMarkdown(
      makeEntry({
        json_metadata: JSON.stringify({
          tags: ["hive", "photography"],
          app: "scrobble.life/1.0"
        }) as any
      })
    );
    expect(md).toContain('tags: ["hive","photography"]');
    expect(md).toContain('app: "scrobble.life/1.0"');
  });

  it("emits a tag the post declared as a bare string", () => {
    const md = renderEntryMarkdown(makeEntry({ json_metadata: { tags: "photography" } as any }));
    expect(md).toContain('tags: ["photography"]');
  });

  it("drops non-string entries from a tag list", () => {
    const md = renderEntryMarkdown(
      makeEntry({ json_metadata: { tags: ["hive", 7, null, "", "art"] } as any })
    );
    // The empty string belongs in the fixture: without it, dropping the
    // length check from the filter leaves this test green while the front
    // matter ships `tags: ["hive","","art"]`.
    expect(md).toContain('tags: ["hive","art"]');
  });

  it("extracts the app name when json_metadata.app is an object", () => {
    const md = renderEntryMarkdown(
      makeEntry({ json_metadata: { app: { name: "ecency", version: "4.0" } } as any })
    );
    expect(md).toContain('app: "ecency"');
  });

  it("selfUrl builds the bare canonical post URL", () => {
    expect(selfUrl({ author: "alice", permlink: "my-post" })).toBe(
      "https://ecency.com/@alice/my-post"
    );
  });
});
