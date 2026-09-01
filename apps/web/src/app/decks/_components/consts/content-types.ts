import i18next from "i18next";

export const COMMUNITY_CONTENT_TYPES = [
  { title: i18next.t("decks.columns.trending"), type: "trending" },
  { title: i18next.t("decks.columns.hot"), type: "hot" },
  {
    title: i18next.t("decks.columns.new"),
    type: "created"
  },
  {
    title: i18next.t("decks.columns.payouts"),
    type: "payout"
  },
  {
    title: i18next.t("decks.columns.muted"),
    type: "muted"
  }
];

export const USER_CONTENT_TYPES = [
  { title: i18next.t("decks.columns.feeds"), type: "feed" },
  { title: i18next.t("decks.columns.blogs"), type: "blog" },
  { title: i18next.t("decks.columns.posts"), type: "posts" },
  {
    title: i18next.t("decks.columns.comments"),
    type: "comments"
  },
  {
    title: i18next.t("decks.columns.replies"),
    type: "replies"
  }
];

export const WALLET_CONTENT_TYPES = [
  { title: i18next.t("decks.columns.balance"), type: "balance" },
  { title: i18next.t("decks.columns.all-history"), type: "all" },
  { title: i18next.t("decks.columns.transfers"), type: "transfers" },
  {
    title: i18next.t("decks.columns.market-orders"),
    type: "market-orders"
  },
  {
    title: i18next.t("decks.columns.interests"),
    type: "interests"
  },
  {
    title: i18next.t("decks.columns.stake-operations"),
    type: "stake-operations"
  },
  {
    title: i18next.t("decks.columns.rewards"),
    type: "rewards"
  }
];

export const NOTIFICATION_CONTENT_TYPES = [
  { title: i18next.t("decks.columns.all"), type: "all" },
  { title: i18next.t("decks.columns.votes"), type: "rvotes" },
  {
    title: i18next.t("decks.columns.mentions"),
    type: "mentions"
  },
  {
    title: i18next.t("decks.columns.favourites"),
    type: "nfavorites"
  },
  {
    title: i18next.t("decks.columns.bookmarks"),
    type: "nbookmarks"
  },
  {
    title: i18next.t("decks.columns.follows"),
    type: "follows"
  },
  {
    title: i18next.t("decks.columns.replies"),
    type: "replies"
  },
  {
    title: i18next.t("decks.columns.reblogs"),
    type: "reblogs"
  },
  {
    title: i18next.t("decks.columns.payouts"),
    type: "payouts"
  },
  {
    title: i18next.t("decks.columns.transfers"),
    type: "transfers"
  },
  {
    title: i18next.t("decks.columns.delegations"),
    type: "delegations"
  },
  {
    title: i18next.t("decks.columns.scheduled-published"),
    type: "scheduled_published"
  }
];

/**
 * Notification content types that are Ecency-only rather than chain-derived, so they are
 * served solely to the account they belong to.
 *
 * nfavorites and nbookmarks reveal who a user has favorited and what they saved, and
 * scheduled_published is Ecency scheduling metadata. vision-api downgrades a request for
 * another account's notifications to scope=public, which makes enotify withhold these, so
 * a column built for someone else with one of these types would render permanently empty.
 * They are hidden in the picker instead.
 *
 * `all` and `transfers` stay available: they still return their chain-derived subset.
 */
export const SELF_ONLY_NOTIFICATION_CONTENT_TYPES = [
  "nfavorites",
  "nbookmarks",
  "scheduled_published"
];

/**
 * The notification content types offered for a given column target.
 *
 * Used by BOTH the add-column picker and the settings of an existing column. Filtering
 * only the picker left the settings able to switch a cross-account column onto a
 * restricted type, which recreated the empty-column problem the filtering exists to
 * prevent.
 */
export function notificationContentTypesFor(
  targetUsername: string | undefined,
  activeUsername: string | undefined
) {
  const isSelf =
    !!activeUsername &&
    !!targetUsername &&
    targetUsername.toLowerCase() === activeUsername.toLowerCase();

  return isSelf
    ? NOTIFICATION_CONTENT_TYPES
    : NOTIFICATION_CONTENT_TYPES.filter(
        ({ type }) => !SELF_ONLY_NOTIFICATION_CONTENT_TYPES.includes(type)
      );
}

/**
 * The content type a column should actually use, falling back to "all" when the stored
 * one is not available for its target.
 *
 * A column persists its contentType, so one created before its target became
 * cross-account, or created while signed in as a different account, can still hold a
 * self-only type. Filtering the selector does not change a stored value, so without this
 * the column keeps fetching a filter that returns nothing and sits permanently empty
 * with its own current value missing from the selector.
 */
export function effectiveNotificationContentType(
  contentType: string,
  targetUsername: string | undefined,
  activeUsername: string | undefined
) {
  const allowed = notificationContentTypesFor(targetUsername, activeUsername);
  return allowed.some(({ type }) => type === contentType) ? contentType : "all";
}

/**
 * Whether a column's stored contentType should be corrected on disk.
 *
 * Separate from effectiveNotificationContentType because the two answer different
 * questions. What to FETCH is safe to decide immediately, and "all" is the right
 * temporary answer while signed out. What to PERSIST is not: the global store starts
 * with no active user and ClientInit restores it after mount, so during that first
 * render every column looks cross-account. Writing then would erase a valid self-only
 * filter on an ordinary page reload.
 *
 * So: never persist until the active account is known.
 */
export function shouldPersistContentTypeCorrection(
  contentType: string,
  targetUsername: string | undefined,
  activeUsername: string | undefined
) {
  if (!activeUsername) {
    return false;
  }

  return (
    effectiveNotificationContentType(contentType, targetUsername, activeUsername) !== contentType
  );
}
