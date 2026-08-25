import { QueryKeys } from "@/modules/core";
import { queryOptions } from "@tanstack/react-query";
import { getNewsletterIssuesRequest } from "../api";
import type { NewsletterListType } from "../types";

/** Already-sent issues for a creator/community list (sender-only view). */
export function getNewsletterIssuesQueryOptions(
  type: NewsletterListType,
  target: string,
  username: string | undefined,
  code: string | undefined,
) {
  const name = username?.replace("@", "");
  return queryOptions({
    queryKey: QueryKeys.newsletter.issues(type, target, name),
    enabled: !!name && !!code && !!target,
    queryFn: async () => {
      if (!code) {
        throw new Error("[SDK][Newsletter] – missing auth");
      }
      return getNewsletterIssuesRequest(type, target, code);
    },
    staleTime: 60_000,
  });
}
