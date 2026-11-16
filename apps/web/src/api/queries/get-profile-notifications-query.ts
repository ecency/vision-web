import { getNotifications, getNotificationsInfiniteQueryOptions } from "@ecency/sdk";
import { infiniteQueryOptions } from "@tanstack/react-query";
import { NotificationFilter } from "@/enums";

/**
 * Notifications of the account a profile belongs to (/@username/notifications).
 *
 * The signed-in account's own profile reuses the panel's query, so both share one
 * cache entry. Any other account goes through the same endpoint's `user` field,
 * the way the deck notifications column does: the viewer's code still signs the
 * request, and the API serves only that account's public subset (see
 * SELF_ONLY_NOTIFICATION_CONTENT_TYPES).
 */
export function getProfileNotificationsQueryOptions(
  activeUsername: string | undefined,
  code: string | undefined,
  username: string,
  filter?: NotificationFilter
) {
  const own = getNotificationsInfiniteQueryOptions(activeUsername, code, filter);
  if (activeUsername && username.toLowerCase() === activeUsername.toLowerCase()) {
    return own;
  }

  return infiniteQueryOptions({
    ...own,
    queryKey: [...own.queryKey, "user", username.toLowerCase()],
    queryFn: ({ pageParam }) => getNotifications(code, filter ?? null, pageParam || null, username)
  });
}
