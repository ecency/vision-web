import { Entry } from "@/entities";
import i18next from "i18next";
import {
  RelatedColumn,
  RelatedItem,
  SimilarRow,
  relatedItemFromEntry,
  relatedItemFromSimilar,
  selectRelatedColumns
} from "./entry-related-item";
import { RelatedSource, isLinkableRelated } from "./entry-related-source";

export const RELATED_FETCH_LIMIT = 12; // over-fetch so filtering still leaves 4
const PER_COLUMN = 4;
const MIN_COLUMN = 2; // a lone link looks sparse — hide the column below this

type Post = { author: string; permlink: string };

/** Each feed's rows, already filtered for this post. */
export interface RelatedItems {
  similar: RelatedItem[];
  author: RelatedItem[];
  community: RelatedItem[];
}

export interface RelatedTitles {
  similar: string;
  author: string;
  /** Absent when the post has no community or tag to link. */
  community?: string;
}

// The similar backend already excludes the source author, spam and nsfw.
export const similarItems = (rows: SimilarRow[]): RelatedItem[] =>
  rows.map(relatedItemFromSimilar).filter((x): x is NonNullable<typeof x> => x !== null);

export const authorItems = (post: Post, entries: Entry[]): RelatedItem[] =>
  entries.filter((p) => p.author === post.author && isLinkableRelated(p)).map(relatedItemFromEntry);

export const communityItems = (post: Post, entries: Entry[]): RelatedItem[] =>
  entries.filter((p) => p.author !== post.author && isLinkableRelated(p)).map(relatedItemFromEntry);

/**
 * Column headings, translated on the server. The browser refill takes them as
 * props rather than translating again: its first render must match the server
 * HTML, and the reader's language can differ from the render's.
 */
export function relatedTitles(post: Post, source: RelatedSource | null | undefined): RelatedTitles {
  return {
    similar: i18next.t("similar-entries.title"),
    author: i18next.t("related-posts.more-from-author", { username: post.author }),
    community: source ? i18next.t("related-posts.more-in", { section: source.section }) : undefined
  };
}

/**
 * The footer's columns, the same on the server render and in the browser refill
 * (entry-related-footer-refill.tsx). selectRelatedColumns dedups across the
 * ordered sources, caps each at PER_COLUMN, and DROPS any column with
 * < MIN_COLUMN items — so e.g. a brand-new author's "From @author" simply
 * doesn't render and the grid collapses to the columns that do have content.
 */
export function selectFooterColumns(post: Post, titles: RelatedTitles, items: RelatedItems): RelatedColumn[] {
  const sources: RelatedColumn[] = [
    { title: titles.similar, items: items.similar },
    { title: titles.author, items: items.author }
  ];
  if (titles.community !== undefined) {
    sources.push({ title: titles.community, items: items.community });
  }
  return selectRelatedColumns(sources, {
    perColumn: PER_COLUMN,
    minColumn: MIN_COLUMN,
    excludeKey: `${post.author}/${post.permlink}`
  });
}
