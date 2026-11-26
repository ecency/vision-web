import { Entry } from "@/entities";
import { fetchQuery } from "@/core/react-query";
import { withCardOnlyPageEntries } from "@/core/entries/slim-entry";
import {
  getAccountPostsQueryOptions,
  getPostsRankedQueryOptions,
  getSimilarEntriesQueryOptions,
  similarEntriesExcerpt
} from "@ecency/sdk";
import { initI18next } from "@/features/i18n";
import { SimilarRow } from "./entry-related-item";
import { resolveRelatedSource } from "./entry-related-source";
import {
  RELATED_FETCH_LIMIT,
  authorItems,
  communityItems,
  relatedTitles,
  selectFooterColumns,
  similarItems
} from "./entry-related-columns";
import { EntryRelatedFooterView } from "./entry-related-footer-view";
import { EntryRelatedFooterRefill } from "./entry-related-footer-refill";

interface Props {
  entry: Entry;
}

/**
 * Compact 3-column related footer: "Read next" | "From @author" |
 * "In {community/tag}", up to 4 rows each. Async server component: all three
 * feeds are fetched in parallel (each SSR-timeout-bounded) and rendered as
 * server HTML, so every link is crawlable. Wrapped in <Suspense> by the page so
 * it never gates the post body. Renders nothing for comments or when empty.
 *
 * It streams after the page head, so a failed feed can no longer keep the page
 * out of the cache: the feeds do not mark the response degraded (that only
 * counted it as `late`, #1881). A failed column is fetched again in the browser
 * instead (EntryRelatedFooterRefill).
 */
export async function EntryRelatedFooter({ entry }: Props) {
  if (entry.parent_author) {
    return null;
  }

  const source = resolveRelatedSource(entry);
  const noMark = { mark: false };

  // i18n init is independent of the feeds — kick it off alongside them so its
  // cost isn't tacked onto the critical path after the network round-trip.
  const i18nReady = initI18next();

  const [similarRaw, authorRaw, communityRaw] = await Promise.all([
    fetchQuery(
      getSimilarEntriesQueryOptions({
        author: entry.author,
        permlink: entry.permlink,
        title: entry.title,
        body: entry.body,
        json_metadata: { tags: entry.json_metadata?.tags }
      }),
      noMark
    ),
    // A row is an author, a permlink, a title and a thumbnail. There is no vote
    // button, payout or count anywhere in this footer, so both feeds are fetched
    // card-only: no bodies and no voter records, which together are the bulk of
    // what these two pages would otherwise retain (#1559). The similar-entries
    // query above already answers with narrow rows. A row is also all a link
    // shows, so a cross-post in either list is not resolved to its original
    // (that is one more post read per cross-post, for a nested entry no link
    // here reads).
    fetchQuery(
      withCardOnlyPageEntries(
        getAccountPostsQueryOptions(entry.author, "posts", "", "", RELATED_FETCH_LIMIT, "", true, {
          resolvePosts: false
        })
      ),
      noMark
    ),
    source
      ? fetchQuery(
          withCardOnlyPageEntries(
            getPostsRankedQueryOptions("created", "", "", RELATED_FETCH_LIMIT, source.tag, "", true, {
              resolvePosts: false
            })
          ),
          noMark
        )
      : Promise.resolve(undefined)
  ]);

  // SDK/web Entry split is deliberately deferred — cross the boundary once here.
  // fetchQuery answers undefined only when the feed failed or timed out. Rows
  // are reduced to the six fields a link needs before anything reaches the
  // browser refill.
  const items = {
    similar: similarItems((similarRaw as SimilarRow[] | undefined) ?? []),
    author: authorItems(entry, (authorRaw as unknown as Entry[] | undefined) ?? []),
    community: communityItems(entry, (communityRaw as unknown as Entry[] | undefined) ?? [])
  };
  const failed = {
    similar: similarRaw === undefined,
    author: authorRaw === undefined,
    community: !!source && communityRaw === undefined
  };

  await i18nReady;
  const titles = relatedTitles(entry, source);

  if (failed.similar || failed.author || failed.community) {
    const tags = entry.json_metadata?.tags;
    return (
      <EntryRelatedFooterRefill
        author={entry.author}
        permlink={entry.permlink}
        source={source}
        titles={titles}
        failed={failed}
        initial={items}
        similarInput={
          failed.similar
            ? {
                title: entry.title ?? "",
                // The excerpt the similar query sends: the browser asks with the
                // text the server did, and gets no more of the body than that.
                body: similarEntriesExcerpt(entry.body ?? ""),
                tags: Array.isArray(tags) ? tags.filter((t): t is string => typeof t === "string") : []
              }
            : undefined
        }
      />
    );
  }

  return <EntryRelatedFooterView columns={selectFooterColumns(entry, titles, items)} />;
}
