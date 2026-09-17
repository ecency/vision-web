import { CONFIG, QueryKeys } from "@/modules/core";
import { queryOptions } from "@tanstack/react-query";

export function getNotificationsUnreadCountQueryOptions(
  activeUsername: string | undefined,
  code: string | undefined
) {
  return queryOptions({
    queryKey: QueryKeys.notifications.unreadCount(activeUsername),
    queryFn: async () => {
      // fetchQuery and refetch() ignore `enabled`, so a synthetic 0 returned here would be
      // cached as a real count. Same as the settings query: no code, no result.
      if (!code) {
        throw new Error("Missing access token");
      }
      const response = await fetch(
        `${CONFIG.privateApiHost}/private-api/notifications/unread`,
        {
          method: "POST",
          body: JSON.stringify({ code }),
          headers: {
            "Content-Type": "application/json",
          },
        }
      );
      const data = (await response.json()) as { count: number };
      return data.count;
    },
    enabled: !!activeUsername && !!code,
    // Placeholder, not initialData: initial data is stamped as fetched at creation,
    // so under a non-zero staleTime it counted as a fresh 0. fetchQuery returned it
    // without a request and observers skipped the fetch on mount until the next
    // refetchInterval. A placeholder still gives observers a number while loading.
    placeholderData: 0,
    refetchInterval: 60000,
  });
}
