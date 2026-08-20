import { Entry } from "@/entities";
import { fetchQuery } from "@/core/react-query";
import { withCardOnlyPageEntries } from "@/core/entries/slim-entry";
import {
  getAccountPostsQueryOptions,
  getPostsRankedQueryOptions,
  getSimilarEntriesQueryOptions
} from "@ecency/sdk";
import { initI18next } from "@/features/i18n";
import i18next from "i18next";
import { EntryRelatedRow } from "./entry-related-row";
import {
  RelatedColumn,
  SimilarRow,
  relatedItemFromEntry,
  relatedItemFromSimilar,
  selectRelatedColumns
} from "./entry-related-item";
import { resolveRelatedSource, isLinkableRelated } from "./entry-related-source";

const FETCH_LIMIT = 12; // over-fetch so filtering still leaves 4
const PER_COLUMN = 4;
const MIN_COLUMN = 2; // a lone link looks sparse — hide the column below this

interface Props {
  entry: Entry;
}

/**
 * Compact 3-column related footer: "Read next" | "From @author" |
 * "In {community/tag}", up to 4 rows each. Async server component: all three
 * feeds are fetched in parallel (each SSR-timeout-bounded) and rendered as
 * server HTML, so every link is crawlable. Wrapped in <Suspense> by the page so
 * it never gates the post body. Renders nothing for comments or when empty.
 */
export async function EntryRelatedFooter({ entry }: Props) {
  if (entry.parent_author) {
    return null;
  }

  const source = resolveRelatedSource(entry);

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
      })
    ),
    // A row is an author, a permlink, a title and a thumbnail. There is no vote
    // button, payout or count anywhere in this footer, so both feeds are fetched
    // card-only: no bodies and no voter records, which together are the bulk of
    // what these two pages would otherwise retain (#1559). The similar-entries
    // query above already answers with narrow rows.
    fetchQuery(
      withCardOnlyPageEntries(getAccountPostsQueryOptions(entry.author, "posts", "", "", FETCH_LIMIT))
    ),
    source
      ? fetchQuery(
          withCardOnlyPageEntries(
            getPostsRankedQueryOptions("created", "", "", FETCH_LIMIT, source.tag)
          )
        )
      : Promise.resolve(undefined)
  ]);

  // SDK/web Entry split is deliberately deferred — cross the boundary once here.
  const similar = (similarRaw as SimilarRow[] | undefined) ?? [];
  const authorPosts = (authorRaw as unknown as Entry[] | undefined) ?? [];
  const communityPosts = (communityRaw as unknown as Entry[] | undefined) ?? [];

  await i18nReady;

  // Ordered candidate sources (each pre-filtered). selectRelatedColumns dedups
  // across them, caps each at PER_COLUMN, and DROPS any column with < MIN_COLUMN
  // items — so e.g. a brand-new author's "From @author" simply doesn't render
  // and the grid collapses to the columns that do have content.
  // The similar backend already excludes the source author, spam and nsfw.
  const sources: RelatedColumn[] = [
    {
      title: i18next.t("similar-entries.title"),
      items: similar.map(relatedItemFromSimilar).filter((x): x is NonNullable<typeof x> => x !== null)
    },
    {
      title: i18next.t("related-posts.more-from-author", { username: entry.author }),
      items: authorPosts
        .filter((p) => p.author === entry.author && isLinkableRelated(p))
        .map(relatedItemFromEntry)
    }
  ];
  if (source) {
    sources.push({
      title: i18next.t("related-posts.more-in", { section: source.section }),
      items: communityPosts
        .filter((p) => p.author !== entry.author && isLinkableRelated(p))
        .map(relatedItemFromEntry)
    });
  }

  const columns = selectRelatedColumns(sources, {
    perColumn: PER_COLUMN,
    minColumn: MIN_COLUMN,
    excludeKey: `${entry.author}/${entry.permlink}`
  });

  if (columns.length === 0) {
    return null;
  }

  // Static class strings (Tailwind can't see interpolated ones).
  const colsClass =
    columns.length === 1
      ? "md:grid-cols-1"
      : columns.length === 2
        ? "md:grid-cols-2"
        : "md:grid-cols-3";

  return (
    <div className="entry-related-footer mt-6 pt-4 border-t border-[--border-color]">
      <div className={`grid grid-cols-1 ${colsClass} gap-x-8 gap-y-4`}>
        {columns.map((col) => (
          <div key={col.title} className="min-w-0">
            <div className="text-[15px] font-semibold text-gray-800 dark:text-gray-200 mb-2 pb-1.5 border-b border-[--border-color]">
              {col.title}
            </div>
            <div>
              {col.items.map((it) => (
                <EntryRelatedRow key={`${it.author}/${it.permlink}`} item={it} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
