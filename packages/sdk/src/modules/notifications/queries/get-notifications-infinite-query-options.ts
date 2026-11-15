import { infiniteQueryOptions } from "@tanstack/react-query";
import { NotificationFilter } from "../enums";
import { CONFIG, QueryKeys } from "@/modules/core";
import { ApiNotification } from "../types";

export function getNotificationsInfiniteQueryOptions(
  activeUsername: string | undefined,
  code: string | undefined,
  filter: NotificationFilter | undefined = undefined
) {
  return infiniteQueryOptions({
    queryKey: QueryKeys.notifications.list(activeUsername, filter),
    queryFn: async ({ pageParam }) => {
      if (!code) {
        return [];
      }
      const data = {
        code,
        filter,
        since: pageParam,
        user: undefined,
      };

      const response = await fetch(
        CONFIG.privateApiHost + "/private-api/notifications",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(data),
        }
      );

      // Throw, do not answer []: an empty page reads as "no notifications" and
      // hides the failure from the consumer's error state and retry (#2080).
      if (!response.ok) {
        throw new Error(`Failed to fetch notifications: ${response.status}`);
      }

      try {
        return (await response.json()) as ApiNotification[];
      } catch {
        return [];
      }
    },
    enabled: !!activeUsername && !!code,
    // No initialData here: an empty seed counts as fresh for the whole staleTime,
    // so consumers that only read `data` would render an empty list with no fetch.
    initialPageParam: "",
    // `undefined` ends the list. Any other value, "" included, counts as a next
    // page, so an empty page must not answer "" (#2080). The server's page size
    // is not part of this contract, so only an empty page ends it; a short last
    // page costs one more request that comes back empty.
    getNextPageParam: (lastPage) => lastPage?.[lastPage.length - 1]?.id ?? undefined,
    refetchOnMount: true,
  });
}
