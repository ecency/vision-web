import { getEntryImageRawUrl, postBodySummary } from "@ecency/render-helper";
import { hasExternalLink } from "@ecency/sdk";
import { Entry } from "@/entities";
import { parseEntryLocationFromBody } from "./entry-location";

/**
 * Feed cards render a ~200 character summary and a thumbnail, but the bridge
 * feeds (`get_ranked_posts` / `get_account_posts`) hand back every post's full
 * markdown body. On an anonymous `/trending` load those bodies measured 211 KB of
 * a 350 KB RSC payload, and they cost again on the client: every page fetched
 * while scrolling parks another 20 bodies in the query cache.
 *
 * `slimEntry` runs where the body is still in hand — inside the feed queryFn, so
 * SSR and client fetches produce identical entries — derives everything a card
 * needs into `json_metadata`, then blanks the body. Cards, the LCP thumbnail
 * preload and the location chip keep working unchanged, and because both sides
 * of hydration see the same object there is no text/src mismatch.
 *
 * Not for comment/reply lists: their cards have no title or metadata to fall back
 * on, so the body IS their content. Callers pick, via `slimEntries`' call sites.
 */

/** Same length the card passes to postBodySummary, so the text is unchanged. */
export const SLIM_SUMMARY_LENGTH = 200;

function pickThumbnail(entry: Entry): string | undefined {
  const meta = entry.json_metadata;
  // json_metadata is author-written: `image` is typed as an array but really does
  // arrive as a bare string too, which is why catchPostImage handles both. Read it
  // as unknown so the same runtime tolerance survives the narrower type.
  const image: unknown = meta?.image;

  // Order requested for cards: an explicit thumbnail wins over the cover image,
  // since `thumbnails` is published for exactly this purpose (3Speak, Liketu).
  const thumbnail = meta?.thumbnails?.find((url) => typeof url === "string" && url.length > 0);
  if (thumbnail) {
    return thumbnail;
  }

  if (typeof image === "string" && image.length > 0) {
    return image;
  }
  if (Array.isArray(image)) {
    const first = image.find(
      (url): url is string => typeof url === "string" && url.length > 0
    );
    if (first) {
      return first;
    }
  }

  // Nothing in metadata: fall back to the post's first body image, which is what
  // catchPostImage would have found on the full entry. Free here (the body is
  // right there) and it keeps the thumbnail — and the LCP preload that reads it —
  // for the ~20% of posts that carry no metadata image at all.
  return getEntryImageRawUrl(entry) ?? undefined;
}

function pickDescription(entry: Entry): string {
  const existing = entry.json_metadata?.description;
  if (typeof existing === "string" && existing.trim().length > 0) {
    return existing.trim();
  }

  // Same call the card makes, so posts keep the summary they show today.
  const summary = postBodySummary(entry, SLIM_SUMMARY_LENGTH)?.trim();
  if (summary) {
    return summary;
  }

  // Image-only and title-only posts would otherwise render an empty summary line
  // and a ragged list; the title keeps every card the same shape.
  return entry.title?.trim() ?? "";
}

/**
 * One entry with its body dropped and everything a card reads derived first.
 * Entries that already have no body (search results, waves, an entry slimmed
 * twice) pass through untouched.
 */
export function slimEntry<T extends Entry>(entry: T): T {
  if (!entry || typeof entry !== "object" || typeof entry.body !== "string" || entry.body === "") {
    return entry;
  }

  const meta = entry.json_metadata ?? {};
  const thumbnail = pickThumbnail(entry);
  // The body marker yields string coordinates while the publish flow writes
  // numbers (see ParsedEntryLocation). Both render the same, and the readers that
  // do arithmetic already coerce, so the parsed form is stored as-is.
  const location = (meta.location ??
    parseEntryLocationFromBody(entry.body)) as typeof meta.location;

  const slimmed = {
    ...entry,
    body: "",
    json_metadata: {
      ...meta,
      description: pickDescription(entry),
      ...(thumbnail ? { image: [thumbnail] } : {}),
      ...(location ? { location } : {})
    },
    // The SDK's low-trust rule looks for an outbound link in the body. Recording
    // the answer here keeps that rule (and its precedence) in the SDK rather than
    // forking it into the web app — see core/entries/entry-moderation.ts.
    slim: { ext_link: hasExternalLink(entry.body) }
  } as T;

  // A cross-post card reads its summary and thumbnail from the nested original,
  // so the same treatment has to reach it or those cards lose both.
  if (entry.original_entry) {
    (slimmed as Entry).original_entry = slimEntry(entry.original_entry);
  }

  return slimmed;
}

/** Slim a page of feed results, leaving a non-array response shape untouched. */
export function slimEntryPage<T>(page: T): T {
  if (Array.isArray(page)) {
    return page.map((item) => slimEntry(item as Entry)) as unknown as T;
  }
  return page;
}

type WithQueryFn = { queryFn?: unknown };

/**
 * Wrap feed query options so their pages arrive slim.
 *
 * Applied to the queryFn rather than `select` on purpose: `select` runs after the
 * data is cached, so the bodies would still be dehydrated into the SSR payload and
 * still sit in the client cache. Wrapping the fetch means one slim copy exists,
 * server and client alike, and React Flight can dedupe it by reference.
 *
 * The query key and every other option are passed through untouched, so this
 * cannot split a cache entry away from the one a page already renders.
 */
export function withSlimEntries<T extends WithQueryFn>(options: T): T {
  const queryFn = options.queryFn;
  if (typeof queryFn !== "function") {
    return options;
  }

  return {
    ...options,
    queryFn: async (...args: unknown[]) =>
      slimEntryPage(await (queryFn as (...a: unknown[]) => Promise<unknown>)(...args))
  } as T;
}
