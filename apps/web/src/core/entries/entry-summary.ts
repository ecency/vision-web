import type { Entry } from "@/entities";
import { postBodyTextSafely } from "./post-body-text-safely";

/** Length every feed card passes to postBodySummary. */
export const ENTRY_SUMMARY_LENGTH = 200;

/**
 * Plain-text excerpt of an author-written string, capped at `length` characters.
 *
 * postBodySummary truncates on spaces and drops a first "word" longer than the
 * cap, so text without spaces (CJK prose, a long hashtag) summarises to "". When
 * that happens, take the untruncated plain text and cut it by code point instead,
 * so such a description still yields a bounded excerpt.
 */
export function summarizeText(text: string, length: number = ENTRY_SUMMARY_LENGTH): string {
  const summary = postBodyTextSafely(text, length).trim();
  if (summary) {
    return summary;
  }
  const plain = postBodyTextSafely(text, 0).trim();
  return plain ? Array.from(plain).slice(0, length).join("") : "";
}

/**
 * The plain-text summary a feed card shows under the title.
 *
 * An author-set `json_metadata.description` wins over the generated body
 * summary, but json_metadata is untrusted on-chain data: some publishing clients
 * write the whole markdown body into `description`, others a non-string. The card
 * used to render that value verbatim, so one such post became a wall of raw
 * markdown of unbounded height in the list. Both sources now go through the same
 * summary function, so the card always gets plain text capped at `length`. A
 * description that strips to nothing (an image-only one) falls back to the body.
 *
 * A slim feed row (`entry.slim`, body blanked by core/entries/slim-entry.ts)
 * already carries the finished card text in `description`, derived through this
 * very function. It is returned as is: parsing plain text as markdown a second
 * time eats characters the first pass kept literal (`\*` becomes `*` becomes
 * emphasis, `&lt;div&gt;` becomes a tag to strip), and the row's blank body
 * would make the fallback depend on whether render-helper's cache still holds
 * the full entry's summary, a hydration mismatch waiting to happen.
 *
 * Both markdown passes go through post-body-summary-safely, because this runs
 * during the SSR render of routes that no longer have a boundary above their
 * cards. A description that breaks the renderer costs the card nothing: the
 * empty result falls through to the body below, which is a different input and
 * usually renders fine. A body that breaks it too leaves the card with a title
 * and no summary line, leaving the slimmer to fall back to the title.
 */
export function entrySummary(entry: Entry, length: number = ENTRY_SUMMARY_LENGTH): string {
  const declared = entry.json_metadata?.description;
  if (entry.slim && !entry.body) {
    return typeof declared === "string" ? declared : "";
  }
  if (typeof declared === "string" && declared.trim().length > 0) {
    const summary = summarizeText(declared.trim(), length);
    if (summary) {
      return summary;
    }
  }
  return postBodyTextSafely(entry, length).trim();
}
