import type { Entry } from "@/entities";
import { truncate } from "./truncate";
import { postBodySummarySafely } from "@/core/entries/post-body-summary-safely";

/**
 * Non-empty display title for an entry. Microblog-style root posts (e.g.
 * D.Buzz) legitimately carry an empty on-chain title; every title surface
 * (page <title>, og/twitter cards, BlogPosting headline, BreadcrumbList item
 * names) falls back to a short body summary, then to a generic byline —
 * Google rejects structured data whose breadcrumb name is empty.
 *
 * The body summary goes through the safe wrapper: all three callers (the entry
 * page's metadata, the BlogPosting JSON-LD and the breadcrumbs) run during SSR
 * of the entry route with no boundary above them, so a body that breaks the
 * markdown pipeline would take the document rather than cost a title. The
 * byline fallback below is exactly what such a post should get.
 */
export function entryDisplayTitle(entry: Pick<Entry, "title" | "body" | "author">): string {
  return (
    (entry.title ?? "").trim() ||
    truncate(postBodySummarySafely(entry.body, 67), 67) ||
    `Post by @${entry.author}`
  );
}
