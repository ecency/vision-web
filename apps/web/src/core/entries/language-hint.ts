import { postBodySummary } from "@ecency/render-helper";
import type { Entry } from "@/entities";
import { MIN_DETECT_CHARS, francToIso1 } from "@/features/shared/entry-translate/iso639";

/**
 * Server-side content-language hint for slim feed rows (#1597).
 *
 * The Translate chip on a card needs the content language. Until now every
 * visitor's browser detected it: one markdown render per card plus the
 * franc-min detector chunk (~47 KB gzipped), all on idle after every feed and
 * post view, for the majority of readers whose language matches the content.
 *
 * The slim step already derives each card's summary on the server, so the
 * server detects the language from that same summary once per fetch and ships
 * the answer as `slim.lang`: an ISO-639-1 code, or `null` when the text is too
 * short or the detector is unsure (which the chip treats as "nothing to
 * offer"). The client gate reads the hint and skips both the render and the
 * chunk. Rows fetched by the browser itself (later pages of an infinite feed)
 * carry no hint and keep the on-idle path; `undefined` means "not checked".
 *
 * Server only: the detector is imported lazily inside the server branch, so it
 * never reaches a client bundle. The summary used is the one the client gate
 * would have used, so the decision is the same one, made earlier and once.
 */
export type LangHint = string | null;

let detector: Promise<((text: string) => string) | null> | null = null;

function loadDetector(): Promise<((text: string) => string) | null> {
  if (!detector) {
    detector = import("franc-min")
      .then((m) => m.franc)
      .catch(() => {
        // Let the next fetch try again rather than pinning "no detector" for
        // the life of the process.
        detector = null;
        return null;
      });
  }
  return detector;
}

// The same bounds the client gate applies before detecting: render the sample
// to plain text (an author-written description can be a bare image link or
// markup, which must count as no text, not as a language) and cap the input.
const RAW_SAMPLE_CHARS = 2000;
const SAMPLE_CHARS = 600;

export function detectionSample(text: string): string {
  return postBodySummary(text.slice(0, RAW_SAMPLE_CHARS), 0).slice(0, SAMPLE_CHARS).trim();
}

export function isServerRuntime(): boolean {
  return typeof window === "undefined";
}

export function hintFor(
  franc: (text: string) => string,
  entry: Pick<Entry, "json_metadata" | "body">
): LangHint {
  try {
    // json_metadata is author-written: description may be missing or not a string.
    const description = entry.json_metadata?.description;
    const raw = entry.body || typeof description !== "string" ? "" : description.trim();
    if (raw.length < MIN_DETECT_CHARS) return null;
    const text = detectionSample(raw);
    if (text.length < MIN_DETECT_CHARS) return null;
    return francToIso1(franc(text));
  } catch {
    return null;
  }
}

/**
 * Merge a freshly polled row over a cached one without losing the hint: rows
 * the browser polls itself carry no `slim.lang`, and a plain spread would
 * replace the server's answer with "not checked".
 */
export function mergePreservingHint<T extends Entry>(item: T, updated: T): T {
  const merged: T = { ...item, ...updated };
  const lang = item.slim?.lang;
  if (lang !== undefined && updated.slim && updated.slim.lang === undefined) {
    merged.slim = { ...updated.slim, lang };
  }
  // A cross-post card reads from its nested original, which the poll replaces
  // wholesale; give it the same treatment.
  if (item.original_entry && updated.original_entry) {
    merged.original_entry = mergePreservingHint(item.original_entry, updated.original_entry);
  }
  return merged;
}

/**
 * Annotate a slim page in place with `slim.lang`. Never throws: a missing or
 * failing detector leaves the rows without a hint and the client detects as
 * before. Not applied on the client (see module comment).
 */
export async function annotateLanguageHints<T>(page: T): Promise<T> {
  if (!isServerRuntime() || !Array.isArray(page)) return page;
  const franc = await loadDetector();
  if (!franc) return page;
  for (const item of page as Entry[]) {
    annotate(franc, item);
  }
  return page;
}

function annotate(franc: (text: string) => string, entry: Entry | null | undefined): void {
  try {
    if (!entry || typeof entry !== "object" || !entry.slim || entry.slim.lang !== undefined) return;
    entry.slim = { ...entry.slim, lang: hintFor(franc, entry) };
    if (entry.original_entry) annotate(franc, entry.original_entry);
  } catch {
    // One malformed row must not cost the page; it simply carries no hint.
  }
}
