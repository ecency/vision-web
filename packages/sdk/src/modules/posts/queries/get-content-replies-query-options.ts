import { QueryKeys } from "@/modules/core";
import { queryOptions } from "@tanstack/react-query";
import { Entry } from "../types";
import { callRPC } from "@/modules/core/hive-tx";
import { filterDmcaEntry } from "../utils/filter-dmca-entries";
import { normalizeEntry } from "../utils/normalize-entry";

export function getContentRepliesQueryOptions(author: string, permlink: string) {
  return queryOptions({
    queryKey: QueryKeys.posts.contentReplies(author, permlink),
    enabled: !!author && !!permlink,
    // Filtered like its sibling getContentQueryOptions: this is the other raw
    // condenser post query, and a takedown covers a reply the same way it
    // covers the post it hangs under (#1862). Nothing in the apps reads it
    // today, but it is a published export.
    queryFn: async (): Promise<Entry[]> => {
      const replies = (await callRPC("condenser_api.get_content_replies", {
        author,
        permlink,
      })) as Entry[] | null;

      // Condenser rows carry the whole voter list: normalize them like every
      // other source (no observer: the vote is stated as unknown).
      return filterDmcaEntry((replies ?? []).map((r) => normalizeEntry(r, ""))) as Entry[];
    },
  });
}
