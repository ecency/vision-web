/**
 * Observer to send on bridge reads when nobody is logged in.
 *
 * The bridge applies this account's mute list to the response and flags muted
 * authors with `stats.gray`, which the UI renders as a dimmed post with a
 * reveal link (`entry-list-item-muted-content.tsx`) or a collapsed comment
 * (`discussion-item.tsx`). Logged-out visitors therefore inherit Ecency's
 * moderation instead of an unfiltered firehose.
 *
 * Three things worth knowing before using this:
 *
 * 1. On the Hive bridge an observer only *marks* content. Muted authors' posts
 *    are still returned, so swapping the observer never shortens a feed or a
 *    comment thread. The waves feed (esync) is the exception: it drops them.
 * 2. Only personalise the observer where the whole list is fetched under it.
 *    Profile and community routes server-render their first page as this
 *    default and their infinite lists then discard their own first page, so
 *    swapping to the logged-in user client-side would filter every page except
 *    the one people actually look at. Feeds personalise instead at the server,
 *    where cache-policy already marks those tiers user-specific.
 * 3. Kept as a plain literal on purpose. This mirrors `CONFIG.defaultObserver`
 *    in @ecency/sdk, but reading it from the SDK would make every module that
 *    touches an observer depend on the SDK being mocked in specs, and several
 *    specs install their own partial `@ecency/sdk` factory.
 */
export const DEFAULT_OBSERVER = "ecency";
