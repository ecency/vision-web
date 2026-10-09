interface SortableChannel {
  id: string;
  is_favorite?: boolean;
  is_muted?: boolean;
  last_post_at?: number;
  last_viewed_at?: number;
}

/**
 * The latest moment anything happened in a channel for this viewer: the last
 * message in it, or the last time they opened it, whichever is newer.
 */
export function getChannelActivityAt(channel: SortableChannel): number {
  return Math.max(Number(channel.last_post_at) || 0, Number(channel.last_viewed_at) || 0);
}

/**
 * One list for every kind of conversation, as the mobile app shows it:
 * favorites, then unread, then the rest, then muted, each with the most
 * recently active first. Ties keep the server's order.
 */
export function sortChannelsByActivity<T extends SortableChannel>(
  channels: T[],
  getUnreadCount: (channel: T) => number,
  serverOrder?: Map<string, number>
): T[] {
  const bucket = (channel: T) => {
    if (channel.is_muted) return 3;
    if (channel.is_favorite) return 0;
    if (getUnreadCount(channel) > 0) return 1;
    return 2;
  };
  const fallback = Number.MAX_SAFE_INTEGER;

  return channels
    .map((channel) => ({
      channel,
      bucket: bucket(channel),
      activityAt: getChannelActivityAt(channel),
      order: serverOrder?.get(channel.id) ?? fallback
    }))
    .sort(
      (a, b) => a.bucket - b.bucket || b.activityAt - a.activityAt || a.order - b.order
    )
    .map((item) => item.channel);
}
