"use client";

import React from "react";
import { setProxyBase } from "@ecency/render-helper";
import "./_index.scss";
import defaults from "@/defaults";
import { Account, Community, Entry, FullAccount } from "@/entities";
import { makeEntryPath } from "@/utils";
import { EAGER_THUMB_CARD_COUNT } from "@/features/shared/entry-list-item/thumb-lcp";
import { pinSvg, repeatSvg } from "@ui/svg";
import {
  EcencySourceBadge,
  EntryMenu,
  EntryPayout,
  EntryReblogBtn,
  EntryTipBtn,
  EntryVoteBtn,
  EntryVotes,
  ProfileLink,
  ProfilePopover,
  UserAvatar,
  TimeLabel
} from "@/features/shared";
import { classNameObject } from "@ui/util";
import i18next from "i18next";
import { TagLink } from "@/features/shared/tag";
import { Tooltip } from "@ui/tooltip";
import { EntryListItemCrossPost } from "@/features/shared/entry-list-item/entry-list-item-cross-post";
import { EntryListItemMutedContent } from "@/features/shared/entry-list-item/entry-list-item-muted-content";
import { EntryListItemProvider } from "@/features/shared/entry-list-item/entry-list-item-context";
import { EntryListItemNsfwContent } from "@/features/shared/entry-list-item/entry-list-item-nsfw-content";
import { EntryListItemClientInit } from "@/features/shared/entry-list-item/entry-list-item-client-init";
import { EntryListItemPollIcon } from "@/features/shared/entry-list-item/entry-list-item-poll-icon";
import { HydrateOnVisible } from "@/features/shared/hydrate-on-visible";
import { TranslateChip } from "@/features/shared/entry-translate/translate-chip";
import { UilComment } from "@tooni/iconscout-unicons-react";

setProxyBase(defaults.imageServer);

interface Props {
  entry: Entry;
  community?: Community | null;
  asAuthor?: string;
  promoted?: boolean;
  order: number;
  account?: Account;
  filter?: string;
}

export function EntryListItemComponent({
  asAuthor = "",
  entry: entryProp,
  community,
  account,
  promoted = false,
  order,
  filter
}: Props) {
  const pageAccount = account as FullAccount;

  // Keyboard backstop for the deferred action bar: once focus enters this card
  // (its server-rendered title/author/tag links), mount the action controls so a
  // keyboard/screen-reader user reaches them by the time they tab that far.
  const [actionsFocused, setActionsFocused] = React.useState(false);

  const isCrossPost = !!entryProp.original_entry;
  const entry = entryProp.original_entry || entryProp;
  const pinned = entry?.stats?.is_pinned ?? pageAccount?.profile?.pinned;

  const reBlogged =
    entry.reblogged_by?.length > 0
      ? entry.reblogged_by[0]
      : asAuthor && asAuthor !== entry.author && !entry.parent_author
        ? asAuthor
        : undefined;

  return (
    <div
      className={classNameObject({
        "entry-list-item": true,
        "promoted-item": promoted,
        [filter ?? ""]: !!filter
      })}
      id={(entry.author + entry.permlink).replace(/[0-9]/g, "")}
      onFocusCapture={() => setActionsFocused(true)}
    >
      <EntryListItemClientInit />
      <EntryListItemCrossPost entry={entryProp} />
      <div className="item-header">
        <div className="item-header-main">
          <div className="author-part" id={`${entry.author}-${entry.permlink}`}>
            <div className="flex items-center" id={`${entry.author}-${entry.permlink}`}>
              <ProfileLink username={entry.author}>
                <span className="author-avatar block">
                  <UserAvatar username={entry.author} size="small" />
                </span>
              </ProfileLink>

              <ProfilePopover entry={entry} />
            </div>
          </div>
          <TagLink
            type="link"
            tag={
              entry.community && entry.community_title
                ? { name: entry.community, title: entry.community_title }
                : entry.category
            }
          >
            <>{entry.community_title || entry.category}</>
          </TagLink>
          <span className="read-mark ml-2" />
          <TimeLabel created={entry.created} />
          <EcencySourceBadge
            app={entry.json_metadata?.app}
            className="inline-block align-text-bottom ml-1.5"
          />

          <EntryListItemPollIcon entry={entryProp} />
        </div>
        <div className="item-header-features">
          {((community && !!entry.stats?.is_pinned) || entry.permlink === pinned) && (
            <Tooltip content={i18next.t("entry-list-item.pinned")}>
              <span className="pinned [&>svg]:size-4">{pinSvg}</span>
            </Tooltip>
          )}
          {reBlogged && (
            <span className="reblogged [&>svg]:size-4">
              {repeatSvg} {i18next.t("entry-list-item.reblogged", { n: reBlogged })}
            </span>
          )}
          {promoted && (
            <>
              <span className="flex-spacer" />
              <div className="promoted">
                <a href="/faq#how-promotion-work">{i18next.t("entry-list-item.promoted")}</a>
              </div>
            </>
          )}
        </div>
      </div>
      <div className="item-body">
        <EntryListItemNsfwContent entry={entryProp} />
        {/* Eager/high-priority for the two visually-topmost items (the LCP
            candidates). Interleaved promoted items have order=4 so they're
            already excluded; on the /promoted section the top items ARE
            promoted, so don't strip their priority — order alone is correct. */}
        <EntryListItemMutedContent entry={entryProp} isThumbLcp={order < EAGER_THUMB_CARD_COUNT} />
      </div>
      {/* The action bar is the heavy interactive cluster (vote/payout/votes/
          reblog/menu = many query observers + floating-ui popovers). Defer its
          hydration until near-viewport for below-the-fold cards; the top cards
          (order < 2) stay interactive immediately. Title/body/thumbnail, author
          (ProfilePopover), tag and timestamp are OUTSIDE this island, so they
          remain in the server HTML for SEO. The only link inside is the
          duplicate reply-count link (redundant with the body permalink). */}
      <HydrateOnVisible
        disabled={order < 2}
        forceShow={actionsFocused}
        placeholder={
          <div
            className="w-full flex md:w-auto md:inline-flex items-center gap-2 md:gap-3 rounded-xl border border-[--border-color] px-2 py-1 text-sm"
            aria-hidden="true"
          >
            <span className="h-4 w-8 rounded bg-gray-200 dark:bg-dark-200" />
            <span className="h-4 w-10 rounded bg-gray-200 dark:bg-dark-200" />
            <span className="h-4 w-8 rounded bg-gray-200 dark:bg-dark-200" />
            <span className="h-4 w-6 rounded bg-gray-200 dark:bg-dark-200" />
          </div>
        }
      >
        <div className="w-full flex md:w-auto md:inline-flex items-center gap-2 md:gap-3 rounded-xl border border-[--border-color] px-2 py-1 text-sm">
          <EntryVoteBtn isPostSlider={true} entry={entry} account={account} />
          <EntryPayout entry={entry} />
          <div className="border-r border-[--border-color] w-[1px] h-4" />
          <EntryVotes entry={entry} />
          {(entry.children > 0 || entryProp.children > 0) && (
            <a
              title={
                entry.children > 0
                  ? entry.children === 1
                    ? i18next.t("entry-list-item.replies")
                    : i18next.t("entry-list-item.replies-n", { n: entry.children })
                  : i18next.t("entry-list-item.no-replies")
              }
              className="flex items-center gap-1 text-gray-steel hover:text-blue-dark-sky"
              href={makeEntryPath(entry.category, entry.author, entry.permlink)}
            >
              <UilComment className="size-3.5" /> {entry.children}
            </a>
          )}
          <EntryReblogBtn entry={entry} />
          <EntryTipBtn entry={entry} />
          {/* Detection runs only here — inside the near-viewport action island —
              so off-screen cards never load franc or run detection. */}
          <TranslateChip entry={entry} />
          <div className="border-r border-[--border-color] w-[1px] h-4" />
          <EntryMenu alignBottom={order >= 1} entry={entry} />
        </div>
      </HydrateOnVisible>
    </div>
  );
}

export const EntryListItem = React.memo(function EntryListItem(props: Props) {
  return (
    <EntryListItemProvider>
      <EntryListItemComponent {...props} />
    </EntryListItemProvider>
  );
});
