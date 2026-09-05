import type { InfiniteData } from "@tanstack/react-query";
import { CONFIG } from "@/modules/core";

/**
 * Takedown masking for desk payloads.
 *
 * The desk serves rows the bridge never touched, so they never pass through
 * `filterDmcaEntry`. The test is the same one that file runs (`CONFIG`
 * patterns plus regexes against `@author/permlink`); what a row can leak is
 * its title, its summary and its thumbnail, so those are what the mask blanks.
 */

interface MaskableCurationRow {
  author: string;
  permlink: string;
  title: string;
  summary?: string | null;
  first_image?: string | null;
}

export function isDmcaCurationPath(author: string, permlink: string): boolean {
  const path = `@${author}/${permlink}`;
  return (
    CONFIG.dmcaPatterns.includes(path) || CONFIG.dmcaPatternRegexes.some((regex) => regex.test(path))
  );
}

/** Returns the SAME object when nothing matches, so memoized rows keep identity. */
export function maskDmcaCurationRow<T extends MaskableCurationRow>(row: T): T {
  if (!row || !isDmcaCurationPath(row.author, row.permlink)) {
    return row;
  }
  const masked = { ...row, title: "" } as MaskableCurationRow & Record<string, unknown>;
  if ("summary" in masked) masked.summary = null;
  if ("first_image" in masked) masked.first_image = null;
  return masked as T;
}

/** Masks every page item; untouched pages keep their identity. */
export function maskDmcaCurationPages<TPage extends { items: MaskableCurationRow[] }>(
  data: InfiniteData<TPage, unknown>
): InfiniteData<TPage, unknown> {
  let changed = false;
  const pages = data.pages.map((page) => {
    let pageChanged = false;
    const items = page.items.map((item) => {
      const masked = maskDmcaCurationRow(item);
      if (masked !== item) pageChanged = true;
      return masked;
    });
    if (!pageChanged) return page;
    changed = true;
    return { ...page, items };
  });
  return changed ? { ...data, pages } : data;
}
