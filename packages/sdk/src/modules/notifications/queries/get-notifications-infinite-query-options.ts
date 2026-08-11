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

      if (!response.ok) {
        return [];
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
    getNextPageParam: (lastPage) => lastPage?.[lastPage.length - 1]?.id ?? "",
    refetchOnMount: true,
  });
}
