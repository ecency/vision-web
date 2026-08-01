import { InfiniteData, infiniteQueryOptions } from "@tanstack/react-query";
import { QueryKeys } from "@/modules/core";
import { AccountNotification } from "../types";
import { callRPC } from "@/modules/core/hive-tx";

type NotifPage = AccountNotification[];
type NotifCursor = number | null;

/**
 * Get account notifications for a community (bridge API)
 *
 * @param account - The account/community name
 * @param limit - Number of notifications per page
 */
export function getAccountNotificationsInfiniteQueryOptions(
  account: string,
  limit: number
) {
  return infiniteQueryOptions<
    NotifPage,
    Error,
    InfiniteData<NotifPage, NotifCursor>,
    (string | number)[],
    NotifCursor
  >({
    queryKey: QueryKeys.communities.accountNotifications(account, limit),
    initialPageParam: null as NotifCursor,

    // Errors are deliberately not caught. Returning [] on failure made an RPC
    // outage indistinguishable from an empty log: `isError` never became true,
    // so consumers rendered "no activity" for a failed request, and a failed
    // page produced no cursor and silently ended pagination. Let React Query
    // own the error so `isError` and retry behave normally.
    queryFn: async ({ pageParam }: { pageParam: NotifCursor }) => {
      const response = await callRPC("bridge.account_notifications", {
        account,
        limit,
        last_id: pageParam ?? undefined,
      });
      return (response as AccountNotification[] | null) ?? [];
    },

    // A short page is the end of the log. Keying on "empty" alone would also
    // treat a truncated page as the end.
    getNextPageParam: (lastPage: NotifPage): NotifCursor =>
      lastPage?.length >= limit ? lastPage[lastPage.length - 1].id : null,
  });
}
