import { Entry, FullAccount } from "@/entities";
// Imported from its own module, NOT the `@/features/shared` barrel. This is a
// server component, and the barrel reaches `entry-list-content` through an
// `export *`. Once that module became "use client", the star re-export started
// handing server components `undefined` in place of the component: it rendered
// as "Element type is invalid ... but got: undefined" and took the entries
// section off every profile page. Any server component pulling a "use client"
// module needs to reach it directly, the way the feed list already does.
import { EntryListContent } from "@/features/shared/entry-list-content";
import React from "react";
import { getPostsFeedQueryData } from "@/api/queries";
import { getQueryData } from "@/core/react-query";
import { stripActiveVotesFromValue } from "@/core/react-query/strip-active-votes";
import { EcencyEntriesCacheManagement } from "@/core/caches";
import { ProfileEntriesLayout } from "@/app/(dynamicPages)/profile/[username]/_components/profile-entries-layout";
import { ProfileEntriesInfiniteList } from "@/app/(dynamicPages)/profile/[username]/_components/profile-entries-infinite-list";
import { EntryArchivePager } from "@/features/shared/entry-archive-pager";
import {
  ARCHIVE_PAGE_SIZE,
  ARCHIVE_SECTIONS
} from "@/app/(dynamicPages)/profile/[username]/_helpers/author-archive";
import type { InfiniteData } from "@tanstack/react-query";

interface Props {
  section: string;
  account: FullAccount;
  initialFeed?: InfiniteData<Entry[], unknown>;
  currentUser?: string;
}

function shouldShowPinnedEntry(account: FullAccount, section: string) {
  return (
    ["blog", "posts", ""].includes(section) &&
    (((account as FullAccount)?.profile && (account as FullAccount)?.profile?.pinned) ||
      ((account as FullAccount)?.profile && (account as FullAccount)?.profile?.pinned !== "none"))
  );
}

export async function ProfileEntriesList({ section, account, initialFeed, currentUser }: Props) {
  const pinnedEntry = shouldShowPinnedEntry(account, section)
    ? getQueryData<Entry | null>(
        EcencyEntriesCacheManagement.getEntryQueryByPath(account.name, account.profile?.pinned)
      )
    : undefined;

  const prefetchedFeed =
    initialFeed ??
    (getPostsFeedQueryData(section, `@${account.name}`) as InfiniteData<Entry[], unknown> | undefined);

  const feedPages = prefetchedFeed?.pages ?? [];
  // Raw first feed page (before pinned-filtering): its length + last item are the
  // TRUE feed-page-1 boundary, so the "Older" archive link and cursor stay
  // correct even when a pinned post occupies a slot (a full 20-post page whose
  // pinned entry is filtered would otherwise drop to 19 and suppress the link).
  const rawFirstPage = (feedPages[0] as Entry[] | undefined) ?? [];
  const initialPageEntries = rawFirstPage.filter(
    (item: Entry) => item.permlink !== account.profile?.pinned
  );
  const entryList = [...initialPageEntries];
  const lastOfFirstPage = rawFirstPage[rawFirstPage.length - 1];

  if (pinnedEntry) {
    entryList.unshift(pinnedEntry);
  }

  // Strip active_votes from the entries serialized into the (client) EntryListItem
  // props for anonymous requests — covers both the feed entries and the
  // separately-fetched pinned entry. Logged-in keeps the full arrays so the
  // "you voted" highlight works.
  const entries = stripActiveVotesFromValue(entryList, currentUser);

  const initialPageEntriesCount = initialPageEntries.length;
  const initialEntriesCount = entryList.length;
  // The infinite list needs to know which of these the viewer can see before it
  // decides the profile is empty, and only the client holds the mute list.
  const initialEntryAuthors = entryList.map((entry) => entry.author);
  const initialDataLoaded = Boolean(initialFeed) || feedPages.length > 0;

  return (
    <>
      <ProfileEntriesLayout section={section} username={account.name}>
        <EntryListContent
          account={account}
          username={`@${account.name}`}
          loading={!initialDataLoaded && initialEntriesCount === 0}
          entries={entries}
          sectionParam={section}
          isPromoted={false}
          showEmptyPlaceholder={false}
        />
        <ProfileEntriesInfiniteList
          section={section}
          account={account}
          initialEntryAuthors={initialEntryAuthors}
          initialPageEntriesCount={initialPageEntriesCount}
          initialDataLoaded={initialDataLoaded}
        />
        {/* Crawlable entry into the cursor archive: infinite scroll is the JS
            enhancement, this "Older" link is the no-JS/crawler path. The cursor
            is the last post of page 1; shown only when page 1 was full. */}
        {ARCHIVE_SECTIONS.includes(section) &&
          rawFirstPage.length >= ARCHIVE_PAGE_SIZE &&
          lastOfFirstPage && (
            <EntryArchivePager
              basePath={`/@${account.name}/${section}`}
              olderCursor={`${lastOfFirstPage.author}/${lastOfFirstPage.permlink}`}
              showLatest={false}
            />
          )}
      </ProfileEntriesLayout>
    </>
  );
}
