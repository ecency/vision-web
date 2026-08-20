import { catchPostImage, getEntryImageRawUrl, postBodySummary } from "@ecency/render-helper";
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

/**
 * The first usable URL in an author-written metadata field.
 *
 * Neither `image` nor `thumbnails` can be trusted to hold the type it is declared
 * with: json_metadata is whatever the publishing client wrote. `image` really does
 * arrive as a bare string, which is why catchPostImage handles both, and a
 * `thumbnails` that is not an array used to throw straight out of the queryFn,
 * failing the whole page rather than one card.
 */
function firstUrl(value: unknown): string | undefined {
  if (typeof value === "string" && value.length > 0) {
    return value;
  }
  if (Array.isArray(value)) {
    return value.find((url): url is string => typeof url === "string" && url.length > 0);
  }
  return undefined;
}

function pickThumbnail(entry: Entry): string | undefined {
  const meta = entry.json_metadata;

  // Order requested for cards: an explicit thumbnail wins over the cover image,
  // since `thumbnails` is published for exactly this purpose (3Speak, Liketu).
  //
  // Worth knowing if this order is ever extended: render-helper memoizes
  // catchPostImage per author/permlink/update AND size, process-wide, so a card
  // (600x500) and the entry page's LCP preload (same size) share one cache slot.
  // They agree today because every sampled post that carries both fields sets
  // them to the same URL (70 of 70, out of 461 live rows across trending, hot,
  // created, promoted, tags and communities), so the value cached from a feed row
  // is the value the post page would have computed. A publisher that set them to DIFFERENT urls would hand
  // the post page a preload that its body does not render, and the LCP image
  // would download twice.
  const thumbnail = firstUrl(meta?.thumbnails) ?? firstUrl(meta?.image);
  if (thumbnail) {
    return thumbnail;
  }

  // Nothing in metadata: recover what catchPostImage would have found on the full
  // entry, while the body is still here to look at.
  //
  // Two steps, because they find different things. getEntryImageRawUrl is the
  // regex fast path over raw markdown. catchPostImage falls back to a full
  // markdown2Html plus DOM parse, and THAT is where a video post's poster
  // (3Speak/YouTube render as <img class="no-replace video-thumbnail">) and
  // <center>-wrapped bare image URLs are discovered. Stopping at the fast path
  // dropped those cards to /assets/noimage.png: measured on live posts, 4 of 29
  // rows that carry no metadata image, concentrated in the video communities.
  //
  // The second call only runs when the fast path found nothing, and it is work
  // the card itself already did before this step existed. catchPostImage(0, 0)
  // returns the proxied /p/ URL, and re-proxying it at card size reuses the same
  // hash rather than nesting, so the card src stays byte-identical to what it was
  // before slimming.
  return getEntryImageRawUrl(entry) ?? catchPostImage(entry, 0, 0, "match") ?? undefined;
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
  const location = meta.location ?? parseEntryLocationFromBody(entry.body);

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

/**
 * Slim one entry, or hand back exactly what arrived if that is not possible.
 *
 * This step only ever saves memory, so it must not be able to cost a page. It
 * runs inside the queryFn, where a throw rejects the whole query: on the server
 * prefetchQuery then returns undefined and the strip or the related row vanishes,
 * and on the client the feed shows its error state. All of that from one field in
 * one author-written json_metadata. The guards in pickThumbnail are the fix for
 * the shape that did it; this is the backstop for the shape nobody thought of.
 * An entry that comes back untouched still renders, it just keeps its body.
 */
function slimEntrySafely(entry: Entry): Entry {
  try {
    return slimEntry(entry);
  } catch {
    return entry;
  }
}

/** Slim a page of feed results, leaving a non-array response shape untouched. */
export function slimEntryPage<T>(page: T): T {
  if (Array.isArray(page)) {
    return page.map((item) => slimEntrySafely(item as Entry)) as unknown as T;
  }
  return page;
}

type WithQueryFn = { queryFn?: unknown; queryKey?: unknown };

function wrapQueryFn<T extends WithQueryFn>(
  options: T,
  queryKey: unknown,
  transform: <P>(page: P) => P
): T {
  const queryFn = options.queryFn;
  if (typeof queryFn !== "function") {
    return options;
  }
  return {
    ...options,
    queryKey,
    queryFn: async (...args: unknown[]) =>
      transform(await (queryFn as (...a: unknown[]) => Promise<unknown>)(...args))
  } as T;
}

/**
 * Wrap feed query options so their pages arrive slim, keeping the SDK's key.
 *
 * For queries whose key is only ever read by slimmed readers: the feed's infinite
 * keys, where the server prefetch, the cache read and the client hook all build
 * their options through one builder, and the promoted feed. The feed poll also
 * hand-builds the infinite key for its setQueryData merge, so that key must stay
 * exactly what the SDK produced.
 *
 * Applied to the queryFn rather than `select` on purpose: `select` runs after the
 * data is cached, so the bodies would still be dehydrated into the SSR payload and
 * still sit in the client cache. Wrapping the fetch means one slim copy exists,
 * server and client alike, and React Flight can dedupe it by reference.
 *
 * Every other option is passed through untouched.
 */
export function withSlimEntries<T extends WithQueryFn>(options: T): T {
  return wrapQueryFn(options, options.queryKey, slimEntryPage);
}

/**
 * The same, for a SINGLE-PAGE builder, whose key gets its own identity.
 *
 * `postsRankedPage` and `accountPostsPage` are read by the deck columns too, and
 * decks render `entry.body` from what they find there. A slim page cached under
 * the SDK's own key is handed straight to a deck inside the staleTime and its
 * post viewer renders an empty article, which is what issue #1556 was.
 *
 * This exists as a separate function rather than a flag on the one above because
 * a flag can be forgotten, and forgetting it is exactly that bug. There is no
 * argument here to get wrong: choosing the function names the intent, and an
 * audit checks that the choice matches the builder.
 */
export function withSlimPageEntries<T extends WithQueryFn>(options: T): T {
  const queryKey = Array.isArray(options.queryKey)
    ? [...options.queryKey, SLIM_KEY_MARKER]
    : options.queryKey;
  return wrapQueryFn(options, queryKey, slimEntryPage);
}

/** Appended to a query key that holds slim pages, so nothing else reads them. */
export const SLIM_KEY_MARKER = "slim";

/** The same, for pages that have had their votes dropped as well. */
export const CARD_ONLY_KEY_MARKER = "card-only";

/**
 * One entry reduced to what a link and a thumbnail need: no body, no votes.
 *
 * Measured on entries sampled from live traffic, `active_votes` is 54-71% of
 * what a cached page retains, several times what the body was, because every
 * `{voter, rshares}` record becomes an object. A render that shows no vote
 * state has no use for any of it.
 *
 * The count invariant is the one `strip-active-votes.ts` already keeps: the
 * records go only when a COUNT survives elsewhere, so nothing that reads a
 * number ever reads zero. An entry that carries no count keeps its votes.
 */
function cardOnlyEntry<T extends Entry>(entry: T): T {
  const slim = slimEntry(entry);
  const hasCount =
    typeof slim.stats?.total_votes === "number" || typeof slim.total_votes === "number";
  const votes = slim.active_votes;

  let next = slim;
  if (hasCount && Array.isArray(votes) && votes.length > 0) {
    next = { ...slim, active_votes: [] } as T;
  }
  // A cross-post card reads the nested original, which carries its own voters.
  if (next.original_entry) {
    const original = cardOnlyEntry(next.original_entry);
    if (original !== next.original_entry) {
      next = { ...next, original_entry: original } as T;
    }
  }
  return next;
}

/** Card-only a page of results, with the same backstop slimEntryPage has. */
function cardOnlyEntryPage<T>(page: T): T {
  if (!Array.isArray(page)) {
    return page;
  }
  return page.map((item) => {
    try {
      return cardOnlyEntry(item as Entry);
    } catch {
      return item;
    }
  }) as unknown as T;
}

/**
 * For a single-page builder feeding a render that displays NO vote state.
 *
 * Today that is the landing page's trending strip and the entry page's related
 * footer: both render a title, an author and a thumbnail, and neither has a
 * vote button, a payout or a vote count anywhere in it. Under
 * `withSlimPageEntries` they still hold every voter record of every row they
 * list, for the whole gc window, to draw a list of links.
 *
 * Its own key marker, not the slim one. A slim reader expects an entry that
 * still knows who voted on it, and handing it one that does not is the same
 * class of bug as #1556. Nothing may read this key but the render that wrote it.
 */
export function withCardOnlyPageEntries<T extends WithQueryFn>(options: T): T {
  const queryKey = Array.isArray(options.queryKey)
    ? [...options.queryKey, CARD_ONLY_KEY_MARKER]
    : options.queryKey;
  return wrapQueryFn(options, queryKey, cardOnlyEntryPage);
}
