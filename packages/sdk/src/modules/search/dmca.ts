import { isDmcaCurationPath } from "@/modules/curation/dmca";
import { DMCA_NOTICE_BODY } from "@/modules/posts/utils/filter-dmca-entries";
import type { SearchResponse, SearchResult } from "./types/search-response";

/**
 * Takedown masking for search rows.
 *
 * The search index is not DMCA-aware (the backend and the vision-api proxy
 * pass rows through as indexed), and its rows never pass through
 * `filterDmcaEntry`. Same test as that file and the curation mask: an exact
 * `@author/permlink` match against `CONFIG.dmcaPatterns` or its regexes.
 *
 * A listed row is MASKED, not dropped: `hits` and the scroll cursor stay
 * consistent with what the page shows, and the row still links to the entry
 * page, which renders its own takedown notice. What a row can leak is its
 * title, its body (the list renders a summary and extracts the image from
 * it), the highlighted copies of both and `img_url`, so those are blanked.
 */
export function maskDmcaSearchResult(row: SearchResult): SearchResult {
  if (!row || !isDmcaCurationPath(row.author, row.permlink)) {
    return row;
  }
  return {
    ...row,
    title: "",
    title_marked: null,
    body: DMCA_NOTICE_BODY,
    body_marked: null,
    img_url: "",
  };
}

/** Returns the SAME response when nothing matches. */
export function maskDmcaSearchResponse<T extends SearchResponse>(response: T): T {
  let changed = false;
  const results = response.results.map((row) => {
    const masked = maskDmcaSearchResult(row);
    if (masked !== row) changed = true;
    return masked;
  });
  return changed ? { ...response, results } : response;
}
