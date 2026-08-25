import { QueryKeys } from "@/modules/core";
import { queryOptions } from "@tanstack/react-query";
import { getNewsletterSenderRequest } from "../api";
import type { NewsletterListType } from "../types";

/**
 * Sender standing for a creator/community list. View access is the list's
 * owner (creator) or the community team, decided by the relay — enable this
 * only for callers already known to be the sender.
 */
export function getNewsletterSenderQueryOptions(
  type: NewsletterListType,
  target: string,
  username: string | undefined,
  code: string | undefined,
) {
  const name = username?.replace("@", "");
  return queryOptions({
    queryKey: QueryKeys.newsletter.sender(type, target, name),
    enabled: !!name && !!code && !!target,
    queryFn: async () => {
      if (!code) {
        throw new Error("[SDK][Newsletter] – missing auth");
      }
      return getNewsletterSenderRequest(type, target, code);
    },
    staleTime: 5 * 60_000,
  });
}
