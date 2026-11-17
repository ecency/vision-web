import { Entry } from "@/entities";
import i18next from "i18next";
import {
  RelatedColumn,
  SimilarRow,
  relatedItemFromEntry,
  relatedItemFromSimilar,
  selectRelatedColumns
} from "./entry-related-item";
import { RelatedSource, isLinkableRelated } from "./entry-related-source";

export const RELATED_FETCH_LIMIT = 12; // over-fetch so filtering still leaves 4
const PER_COLUMN = 4;
const MIN_COLUMN = 2; // a lone link looks sparse — hide the column below this

export interface RelatedFeeds {
  similar: SimilarRow[];
  authorPosts: Entry[];
  communityPosts: Entry[];
}

/**
 * The footer's columns from its three feeds, the same on the server render and
 * in the browser refill (entry-related-footer-refill.tsx).
 *
 * Ordered candidate sources (each pre-filtered). selectRelatedColumns dedups
 * across them, caps each at PER_COLUMN, and DROPS any column with < MIN_COLUMN
 * items — so e.g. a brand-new author's "From @author" simply doesn't render
 * and the grid collapses to the columns that do have content.
 * The similar backend already excludes the source author, spam and nsfw.
 */
export function buildRelatedColumns(
  post: { author: string; permlink: string },
  source: RelatedSource | null | undefined,
  feeds: RelatedFeeds
): RelatedColumn[] {
  const sources: RelatedColumn[] = [
    {
      title: i18next.t("similar-entries.title"),
      items: feeds.similar
        .map(relatedItemFromSimilar)
        .filter((x): x is NonNullable<typeof x> => x !== null)
    },
    {
      title: i18next.t("related-posts.more-from-author", { username: post.author }),
      items: feeds.authorPosts
        .filter((p) => p.author === post.author && isLinkableRelated(p))
        .map(relatedItemFromEntry)
    }
  ];
  if (source) {
    sources.push({
      title: i18next.t("related-posts.more-in", { section: source.section }),
      items: feeds.communityPosts
        .filter((p) => p.author !== post.author && isLinkableRelated(p))
        .map(relatedItemFromEntry)
    });
  }

  return selectRelatedColumns(sources, {
    perColumn: PER_COLUMN,
    minColumn: MIN_COLUMN,
    excludeKey: `${post.author}/${post.permlink}`
  });
}
