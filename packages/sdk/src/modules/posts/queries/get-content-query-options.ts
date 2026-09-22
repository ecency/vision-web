import { QueryKeys } from "@/modules/core";
import { queryOptions } from "@tanstack/react-query";
import { Entry } from "../types";
import { callRPC } from "@/modules/core/hive-tx";
import { filterDmcaEntry } from "../utils/filter-dmca-entries";

export function getContentQueryOptions(author: string, permlink: string) {
  return queryOptions({
    queryKey: QueryKeys.posts.content(author, permlink),
    enabled: !!author && !!permlink,
    queryFn: async (): Promise<Entry> => {
      const entry = (await callRPC("condenser_api.get_content", [
        author,
        permlink,
      ])) as Entry;

      // A takedown applies wherever a post is served, not only on the path the
      // entry page happens to read. getPostQueryOptions (bridge) has always
      // filtered; this query had not, and it is the one the agent endpoints,
      // the oEmbed provider and the decks columns read, so a listed post came
      // back in full from /@author/permlink.md and .json (#1862).
      return filterDmcaEntry(entry) as Entry;
    },
  });
}
