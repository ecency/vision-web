import defaults from "@/defaults";
import type { Entry } from "@/entities";
import { parseJsonMetadata } from "@/utils/posting";

/**
 * Pure formatters for the agent-readable post endpoints. Deliberately free of
 * data-fetching / Redis imports so the output contract is trivially unit-tested.
 */

export function selfUrl(entry: Pick<Entry, "author" | "permlink">): string {
  return `${defaults.base}/@${entry.author}/${entry.permlink}`;
}

// YAML scalars/sequences via JSON: YAML is a superset of JSON for these, so a
// JSON-encoded value is always a valid (and correctly escaped) YAML node.
function yamlLine(key: string, value: unknown): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (Array.isArray(value)) {
    if (value.length === 0) return null;
    return `${key}: ${JSON.stringify(value)}`;
  }
  return `${key}: ${JSON.stringify(value)}`;
}

function appName(app: unknown): string | undefined {
  if (typeof app === "string") return app;
  if (app && typeof app === "object") {
    const name = (app as { name?: unknown }).name;
    if (typeof name === "string") return name;
  }
  return undefined;
}

/**
 * The post as a self-contained Markdown document: YAML front matter + the raw
 * on-chain body. The body is intentionally NOT re-rendered to HTML — raw Hive
 * markdown is the most token-efficient form for LLMs to process.
 */
export function renderEntryMarkdown(entry: Entry): string {
  // Parsed, not read off the value: these endpoints are served from an entry
  // fetched through condenser_api, which returns json_metadata as a raw string,
  // so both lines below were silently absent from every document.
  const meta = parseJsonMetadata(entry.json_metadata);
  const rawTags = meta?.tags;
  const tags = Array.isArray(rawTags)
    ? rawTags.filter((tag): tag is string => typeof tag === "string" && tag.length > 0)
    : undefined;
  const isComment = !!entry.parent_author;

  const front = [
    yamlLine("title", entry.title || undefined),
    yamlLine("author", `@${entry.author}`),
    yamlLine("permlink", entry.permlink),
    yamlLine("type", isComment ? "comment" : "post"),
    yamlLine("community", entry.community || undefined),
    yamlLine("community_title", entry.community_title || undefined),
    yamlLine("category", entry.category || undefined),
    yamlLine("tags", tags),
    yamlLine("app", appName(meta?.app)),
    yamlLine("created", entry.created),
    yamlLine("updated", entry.updated || entry.last_update || undefined),
    yamlLine("payout", entry.payout),
    yamlLine("canonical_url", selfUrl(entry))
  ].filter(Boolean);

  // Collapse any newlines in the title so the H1 stays a single line (on-chain
  // titles can contain raw line breaks). The front-matter copy is JSON-escaped.
  const heading = entry.title ? `# ${entry.title.replace(/[\r\n]+/g, " ")}\n\n` : "";
  return `---\n${front.join("\n")}\n---\n\n${heading}${entry.body}\n`;
}
