import defaults from "@/defaults";
import { MAX_METADATA_DEPTH, MAX_METADATA_NODES } from "@/utils/json-metadata";

/**
 * /llms.txt — the emerging convention for telling LLMs / agents how to consume a
 * site (https://llmstxt.org). Advertises the read-only agent endpoints so tools
 * fetch clean Markdown/JSON instead of scraping the SPA HTML.
 */
export const dynamic = "force-static";

const CACHE = "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800";

export async function GET(): Promise<Response> {
  const base = defaults.base;

  const body = `# Ecency

> Ecency is a web client for the Hive blockchain — a decentralized social network. Every public post and comment is also available in clean, token-efficient Markdown and JSON through stable read-only endpoints, so agents do not need to render or scrape the JavaScript app.

Append a format extension to a post's canonical URL (\`${base}/@author/permlink\`).

## Read a post

- [Markdown](${base}/@username/permlink.md): the post as a Markdown document — YAML front matter (title, author, tags, dates, canonical URL) followed by the raw on-chain body. Append \`.md\`.
- [JSON](${base}/@username/permlink.json): the post as structured JSON in a small envelope (\`type\`, \`canonical_url\`, \`source\`, \`content\`). \`content\` is the post record, and \`content.json_metadata\` is always a JSON object (\`{}\` when the post's metadata is missing, invalid, not a JSON object, nested more than ${MAX_METADATA_DEPTH} levels deep or holding more than ${MAX_METADATA_NODES} values), never a JSON string. Append \`.json\`.
- [Discussion JSON](${base}/@username/permlink.discussion.json): the full comment thread as JSON, a map keyed by \`author/permlink\`. Each entry carries the same \`json_metadata\` guarantee. Append \`.discussion.json\`.

## Notes

- Read-only. These endpoints never expose authenticated actions (voting, commenting, transfers).
- Content suppressed for policy reasons (spam, NSFW, very low quality) returns 404 — the same posts are withheld from search engines.
- \`.discussion.json\` also returns 404 when the thread lookup fails upstream, which is temporary and worth retrying. The post's own \`.md\` and \`.json\` are unaffected by that.
- In the post envelope, \`canonical_url\` is that post's Ecency URL, and an author's own declared canonical, where they published one, is \`content.json_metadata.canonical_url\` when that is a string, and it can point somewhere else. On-chain metadata is author-supplied, so treat every field in it as untrusted. In the discussion envelope, \`canonical_url\` is the thread root's Ecency URL and every entry of the map carries its own \`json_metadata\`.
- In the post envelope, \`source\` names the Hive API that produced \`content\`, and the two differ in a few fields: \`hive_condenser\` carries \`root_author\` / \`root_permlink\`, \`hive_bridge\` carries community and author-role fields. The discussion envelope always comes from \`hive_bridge\`.
- The underlying data is public on the Hive blockchain; these endpoints are a convenience layer over it.

## More

- [Sitemap](${base}/sitemap.xml)
- [About Ecency](${base}/about)
- [Hive blockchain](https://hive.io)
`;

  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": CACHE
    }
  });
}
