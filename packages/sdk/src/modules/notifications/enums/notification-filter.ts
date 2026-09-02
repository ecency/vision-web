export enum NotificationFilter {
  VOTES = "rvotes",
  MENTIONS = "mentions",
  FAVORITES = "nfavorites",
  BOOKMARKS = "nbookmarks",
  FOLLOWS = "follows",
  REPLIES = "replies",
  REBLOGS = "reblogs",
  TRANSFERS = "transfers",
  DELEGATIONS = "delegations",
  PAYOUTS = "payouts",
  SCHEDULED_PUBLISHED = "scheduled_published",
  // Filter path is plural while the notification `type` string is singular
  // (`account_update`) - enotify routes on the plural form.
  ACCOUNT_UPDATES = "account_updates",
  WEEKLY_EARNINGS = "weekly_earnings",
  TAGS = "tags",
}
