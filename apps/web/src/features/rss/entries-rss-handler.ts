import { RssHandler } from "@/features/rss/rss-handler";
import { Entry } from "@/entities";
import RSS from "rss";
import { postBodySummary } from "@ecency/render-helper";
import { catchPostImageSafely } from "@/core/entries/catch-post-image-safely";
import { makeEntryPath } from "@/utils";
import { loadDmcaLists } from "@/core/dmca-lists";
import { isTakenDownPost } from "@/core/dmca-posts";

// The six RSS routes are route handlers too, so like the agent endpoints they
// never execute the root layout and would filter against an empty list
// (#1862): a cold worker served a full <item> for a taken-down post, a feed
// for an account `getAccountPosts` exists to refuse, and a listed tag. One
// call on the shared base class covers profile, feed and community, both the
// `/rss` and `/rss.xml` spellings. A call, not a bare import: see
// core/dmca-lists.
loadDmcaLists();

export abstract class EntriesRssHandler extends RssHandler<Entry> {
  protected includeItem(entry: Entry): boolean {
    // A takedown drops the post from the feed rather than shipping an item
    // with an empty title and the notice as its description. Same reason the
    // agent endpoints 404 it: a machine has no use for the notice a reader is
    // shown (#1862).
    return !isTakenDownPost(entry.author, entry.permlink);
  }

  protected convertItem(entry: Entry, base: string): RSS.ItemOptions {
    const path = makeEntryPath(entry.category, entry.author, entry.permlink);
    const url = path === "#" ? base : `${base}${path}`;

    return {
      title: entry.title,
      description: postBodySummary(entry.body, 200),
      url,
      categories: [entry.category],
      author: entry.author,
      date: entry.created,
      enclosure: { url: catchPostImageSafely(entry.body) || "" }
    };
  }
}
