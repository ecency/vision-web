import { QueryKeys } from "@/modules/core";
import { queryOptions } from "@tanstack/react-query";
import { Entry } from "../types";
import { filterDmcaEntry } from "../utils/filter-dmca-entries";
import { verifyPostOnAlternateNode } from "@/modules/bridge/verify-on-alternate-node";
import { bridgeV2Call, POST_TOP_VOTES } from "@/modules/bridge/requests";
import { normalizeEntry } from "../utils/normalize-entry";

export function getPostQueryOptions(
  author: string,
  permlink?: string,
  observer = "",
  num?: number
) {
  const cleanPermlink = permlink?.trim();
  const entryPath = `/@${author}/${cleanPermlink ?? ""}`;

  return queryOptions({
    queryKey: QueryKeys.posts.entry(entryPath),
    queryFn: async () => {
      if (!cleanPermlink || cleanPermlink === "undefined") {
        return null;
      }

      // hive-tx tries nodes in order; the first healthy node (index 0) handles this call.
      // If it returns null, verifyPostOnAlternateNode skips index 0 and tries others.
      const raw = await bridgeV2Call<Entry | null>("get_post", {
        author,
        permlink: cleanPermlink,
        observer,
        top_votes: POST_TOP_VOTES,
      });
      const response = raw ? normalizeEntry(raw, observer) : raw;

      if (!response) {
        // Primary node returned null — verify on alternate nodes
        // to guard against sync lag returning null for valid posts
        const verified = await verifyPostOnAlternateNode(author, cleanPermlink, observer);
        if (!verified) {
          return null;
        }
        const verifiedEntry = num !== undefined ? { ...verified, num } as Entry : verified as Entry;
        return filterDmcaEntry(verifiedEntry);
      }

      const entry = num !== undefined ? { ...response, num } as Entry : response as Entry;
      return filterDmcaEntry(entry);
    },
    enabled:
      !!author &&
      !!permlink &&
      permlink.trim() !== "" &&
      permlink.trim() !== "undefined",
  });
}
