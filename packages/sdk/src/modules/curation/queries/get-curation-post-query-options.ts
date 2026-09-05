import { queryOptions } from "@tanstack/react-query";
import { QueryKeys } from "@/modules/core";
import { fetchCurationPost } from "../requests";

const ACCOUNT_RE = /^[a-z0-9.-]{3,16}$/;
const PERMLINK_RE = /^[a-z0-9-]{1,255}$/;

/**
 * One post's public desk row plus its recommenders (route 5). A viewer finds
 * their own recommendation state by their username in `recommenders`, so no
 * authed read exists. Memoized 15 s at the gateway, which is why a recommender's
 * own row is optimistic and polls this with backoff.
 */
export function getCurationPostQueryOptions(author: string, permlink: string) {
  const valid = ACCOUNT_RE.test(author) && PERMLINK_RE.test(permlink);

  return queryOptions({
    queryKey: QueryKeys.curation.post(author, permlink),
    queryFn: ({ signal }) => {
      // Guarded twice: `enabled` only gates automatic fetching, a prefetch
      // still runs the queryFn.
      if (!valid) {
        throw new Error("[SDK][Curation] invalid author or permlink");
      }
      return fetchCurationPost(author, permlink, signal);
    },
    enabled: valid,
    staleTime: 15_000,
  });
}
