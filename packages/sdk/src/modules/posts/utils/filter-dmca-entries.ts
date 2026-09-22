import { CONFIG } from "@/modules/core";
import { Entry } from "../types";

/**
 * Filters and censors entries that match DMCA patterns
 * @param entry - Single entry or array of entries to filter
 * @returns Filtered entry/entries with DMCA content censored.
 *          Note: Can return null/undefined if input is falsy - callers should guard against this.
 */
export function filterDmcaEntry(entry: Entry): Entry | null | undefined;
export function filterDmcaEntry(entries: Entry[]): Entry[];
export function filterDmcaEntry(entryOrEntries: Entry | Entry[] | null | undefined): Entry | Entry[] | null | undefined {
  if (Array.isArray(entryOrEntries)) {
    // Array elements are non-null Entries, so applyFilter never returns nullish here.
    return entryOrEntries.map((entry) => applyFilter(entry)) as Entry[];
  }
  return applyFilter(entryOrEntries);
}

function applyFilter(entry: Entry | null | undefined): Entry | null | undefined {
  if (!entry) return entry;

  const entryPath = `@${entry.author}/${entry.permlink}`;
  const isDmca =
    CONFIG.dmcaPatterns.includes(entryPath) ||
    CONFIG.dmcaPatternRegexes.some((regex) => regex.test(entryPath));

  if (isDmca) {
    return {
      ...entry,
      body: "This post is not available due to a copyright/fraudulent claim.",
      title: "",
      // Blanked with them, because a CARD never reads the body: the summary is
      // `json_metadata.description` when the author set one, and the image is
      // `json_metadata.thumbnails`/`image` before anything the body contains.
      // Clearing body and title alone still served the original summary and
      // cover through /api/oembed and the entry page's own og:/twitter: tags
      // (both via buildEntryCardFields), and the whole metadata object through
      // `.json`. The RSS feeds and the `.md` summary were never affected: both
      // read the body string, and `.md` takes only `tags` and `app` from here.
      // The same three fields the curation mask blanks, for the same reason
      // (modules/curation/dmca.ts).
      json_metadata: {},
      // A cross-post renders what it QUOTES, not its own body: the feed card
      // and the entry page both read `original_entry` and fall back to the
      // wrapper only when it is absent. So a listed cross-post kept serving
      // the quoted post's title, summary, cover and body straight through the
      // takedown. The quoted post is untouched at its own URL; what this
      // removes is the listed path's rendering of it.
      original_entry: undefined,
    };
  }

  return entry;
}
