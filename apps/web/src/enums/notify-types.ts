// Values are enotify's ACTIVITY_MAIN_TYPE_* ints and are validated server-side at
// device registration, so they must match enotify constants.py exactly. Note payouts
// is 19: the original 16 is commented out upstream and must not be reused.
export enum NotifyTypes {
  VOTE = 1,
  MENTION = 2,
  FOLLOW = 3,
  COMMENT = 4,
  RE_BLOG = 5,
  TRANSFERS = 6,
  DELEGATIONS = 10,
  FAVORITES = 13,
  BOOKMARKS = 15,
  PAYOUTS = 19,
  ACCOUNT_UPDATE = 20,
  WEEKLY_EARNINGS = 21,
  SCHEDULED_PUBLISHED = 22,
  TAGS = 23,
  ALLOW_NOTIFY = "ALLOW_NOTIFY"
}

export const ALL_NOTIFY_TYPES = [
  NotifyTypes.VOTE,
  NotifyTypes.MENTION,
  NotifyTypes.FOLLOW,
  NotifyTypes.COMMENT,
  NotifyTypes.RE_BLOG,
  NotifyTypes.TRANSFERS,
  NotifyTypes.DELEGATIONS,
  NotifyTypes.FAVORITES,
  NotifyTypes.BOOKMARKS,
  NotifyTypes.PAYOUTS,
  NotifyTypes.ACCOUNT_UPDATE,
  NotifyTypes.WEEKLY_EARNINGS,
  NotifyTypes.SCHEDULED_PUBLISHED,
  NotifyTypes.TAGS
] as const;

export enum NotificationViewType {
  ALL = "All",
  UNREAD = "Unread",
  READ = "Read"
}
