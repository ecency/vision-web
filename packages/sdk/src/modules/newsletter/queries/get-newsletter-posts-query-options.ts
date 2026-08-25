import { QueryKeys } from "@/modules/core";
import { queryOptions } from "@tanstack/react-query";
import { getNewsletterPostsRequest } from "../api";
import type { NewsletterListType } from "../types";

/** Candidate posts for composing a digest issue (send-gated by the relay). */
export function getNewsletterPostsQueryOptions(
  type: NewsletterListType,
  target: string,
  username: string | undefined,
  code: string | undefined,
  limit = 20,
) {
  const name = username?.replace("@", "");
  return queryOptions({
    queryKey: QueryKeys.newsletter.posts(type, target, name, limit),
    enabled: !!name && !!code && !!target,
    queryFn: async () => {
      if (!code) {
        throw new Error("[SDK][Newsletter] – missing auth");
      }
      return getNewsletterPostsRequest(type, target, code, limit);
    },
    staleTime: 60_000,
  });
}
