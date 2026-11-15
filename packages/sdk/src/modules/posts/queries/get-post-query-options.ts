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

      // hive-tx picks the healthiest node for this call (or the server read
      // proxy). If its answer is null, verifyPostOnAlternateNode asks the other
      // nodes, and a null from the node that answered here does not count: a
      // node that lags keeps answering null.
      let answeringNode: string | undefined;
      const raw = await bridgeV2Call<Entry | null>(
        "get_post",
        {
          author,
          permlink: cleanPermlink,
          observer,
          top_votes: POST_TOP_VOTES,
        },
        undefined,
        (node) => {
          answeringNode = node;
        }
      );
      const response = raw ? normalizeEntry(raw, observer) : raw;

      if (!response) {
        // Primary node returned null — verify on alternate nodes
        // to guard against sync lag returning null for valid posts
        const verified = await verifyPostOnAlternateNode(
          author,
          cleanPermlink,
          observer,
          answeringNode
        );
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
