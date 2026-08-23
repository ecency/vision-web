/**
 * Observer to send on bridge reads when nobody is logged in.
 *
 * The bridge applies this account's mute list to the response and flags muted
 * authors with `stats.gray`, which the UI renders as a dimmed post with a
 * reveal link (`entry-list-item-muted-content.tsx`) or a collapsed comment
 * (`discussion-item.tsx`). Logged-out visitors therefore inherit Ecency's
 * moderation instead of an unfiltered firehose.
 *
 * Four things worth knowing before using this:
 *
 * 1. On the Hive bridge an observer marks ranked-feed content rather than
 *    removing it: muted authors' posts come back flagged `stats.gray`, so
 *    swapping the observer does not shorten a feed. Comment threads are NOT
 *    like that, despite what this comment used to claim. `bridge.get_discussion`
 *    drops the observer's muted authors outright — the same thread measured
 *    2026-08-23 returns 303 nodes under a neutral observer and 60 under this
 *    one. (An observer that is not a real account returns nothing at all, so
 *    never pass an unvalidated name here.) The waves feed (esync) also drops
 *    them, and applies Ecency's moderation list besides — see 3.
 * 2. Only personalise the observer where the whole list is fetched under it.
 *    Profile and community routes server-render their first page as this
 *    default and their infinite lists then discard their own first page, so
 *    swapping to the logged-in user client-side would filter every page except
 *    the one people actually look at. Feeds personalise instead at the server,
 *    where cache-policy already marks those tiers user-specific.
 * 3. This is NOT how Ecency's moderation mutes reach the waves feed, and the
 *    waves feed no longer sends this default at all. An observer only ever
 *    carries the mute list of whoever is viewing, so before esync applied the
 *    moderation list itself, signed-in users (who send their own name) got none
 *    of it. esync now ANDs `@ecency`'s on-chain mutes into every waves query on
 *    top of the observer's, so muting an account there is what takes it out of
 *    the feed for everyone, and the waves views pass `undefined` when logged
 *    out so the request stays on the shared response cache. Bridge reads still
 *    behave as described above.
 * 4. Kept as a plain literal on purpose. This mirrors `CONFIG.defaultObserver`
 *    in @ecency/sdk, but reading it from the SDK would make every module that
 *    touches an observer depend on the SDK being mocked in specs, and several
 *    specs install their own partial `@ecency/sdk` factory.
 */
export const DEFAULT_OBSERVER = "ecency";
