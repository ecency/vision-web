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

function pickThumbnail(entry: Entry): string | undefined {
  const meta = entry.json_metadata;
  // json_metadata is author-written: `image` is typed as an array but really does
  // arrive as a bare string too, which is why catchPostImage handles both. Read it
  // as unknown so the same runtime tolerance survives the narrower type.
  const image: unknown = meta?.image;

  // Order requested for cards: an explicit thumbnail wins over the cover image,
  // since `thumbnails` is published for exactly this purpose (3Speak, Liketu).
  //
  // Worth knowing if this order is ever extended: render-helper memoizes
  // catchPostImage per author/permlink/update AND size, process-wide, so a card
  // (600x500) and the entry page's LCP preload (same size) share one cache slot.
  // They agree today because every sampled post that carries both fields sets
  // them to the same URL (44 of 44 across trending/hot/created, tags and
  // communities), so the value cached from a feed row is the value the post page
  // would have computed. A publisher that set them to DIFFERENT urls would hand
  // the post page a preload that its body does not render, and the LCP image
  // would download twice.
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

/** Slim a page of feed results, leaving a non-array response shape untouched. */
export function slimEntryPage<T>(page: T): T {
  if (Array.isArray(page)) {
    return page.map((item) => slimEntry(item as Entry)) as unknown as T;
  }
  return page;
}

type WithQueryFn = { queryFn?: unknown; queryKey?: unknown };

interface SlimOptions {
  /**
   * Cache the slim pages under their own key instead of the SDK's.
   *
   * Needed wherever the SDK key is ALSO read by something that needs whole posts.
   * The single-page keys (`postsRankedPage` / `accountPostsPage`) are shared with
   * the deck columns, which fetch the same sort/cursor/limit and then render
   * `entry.body` in their post viewer: a slim page cached under that key would be
   * handed straight to a deck within the 60s staleTime, and the viewer would show
   * an empty post. The feed's own infinite keys need no marker, since the server
   * prefetch, the cache read and the client hook are the only readers and all
   * three build their options through one slimmed builder.
   */
  isolateKey?: boolean;
}

/**
 * Wrap feed query options so their pages arrive slim.
 *
 * Applied to the queryFn rather than `select` on purpose: `select` runs after the
 * data is cached, so the bodies would still be dehydrated into the SSR payload and
 * still sit in the client cache. Wrapping the fetch means one slim copy exists,
 * server and client alike, and React Flight can dedupe it by reference.
 *
 * Every other option is passed through untouched, so this cannot split a cache
 * entry away from the one a page already renders.
 */
export function withSlimEntries<T extends WithQueryFn>(
  options: T,
  { isolateKey = false }: SlimOptions = {}
): T {
  const queryFn = options.queryFn;
  if (typeof queryFn !== "function") {
    return options;
  }

  const queryKey =
    isolateKey && Array.isArray(options.queryKey)
      ? [...options.queryKey, SLIM_KEY_MARKER]
      : options.queryKey;

  return {
    ...options,
    queryKey,
    queryFn: async (...args: unknown[]) =>
      slimEntryPage(await (queryFn as (...a: unknown[]) => Promise<unknown>)(...args))
  } as T;
}

/** Appended to a query key that holds slim pages. See SlimOptions.isolateKey. */
export const SLIM_KEY_MARKER = "slim";
