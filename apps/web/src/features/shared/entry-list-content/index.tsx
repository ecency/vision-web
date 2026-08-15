"use client";

import React from "react";
import "./_index.scss";
import { Account, Community, Entry } from "@/entities";
import { EntryListItem } from "@/features/shared";
import { useVisibleEntries } from "@/features/shared/entry-list-item/use-muted-authors";
import { EntryListContentNoData } from "./entry-list-content-no-data";

interface Props {
  loading: boolean;
  entries: Entry[];
  sectionParam: string;
  isPromoted: boolean;
  promotedEntries?: Entry[];
  username: string;
  showEmptyPlaceholder?: boolean;
  account?: Account;
  community?: Community;
}

export function EntryListContent({
  sectionParam: section,
  entries,
  isPromoted,
  promotedEntries = [],
  loading,
  username,
  showEmptyPlaceholder = true,
  account,
  community
}: Props) {
  // Filter here rather than inside the card, so a card never drops itself and
  // leaves this component's wrapper and branch behind.
  const dataToRender = useVisibleEntries(entries);
  const promotedToRender = useVisibleEntries(promotedEntries);

  return (
    <>
      {/* The placeholder answers "did this list have anything at all", so it is
          keyed on the raw entries. This component is often ONE slice of a
          paginated list (a server-rendered page 1 with an infinite list under
          it), and a slice whose every author is muted must not announce that
          the whole feed is empty. Whoever owns the total count owns that call:
          see useVisibleEntries in feed-list, the profile infinite list and the
          bookmarks list. */}
      {entries.length > 0
        ? dataToRender.map((e, i) => {
            const l = [];

            if (isPromoted && i % 4 === 0 && i > 0) {
              const ix = i / 4 - 1;

              if (promotedToRender?.[ix]) {
                const p = promotedToRender[ix];
                if (!dataToRender.find((x) => x.author === p.author && x.permlink === p.permlink)) {
                  l.push(
                    <EntryListItem
                      key={`${p.author}-${p.permlink}`}
                      entry={p}
                      promoted={true}
                      order={4}
                      community={community}
                    />
                  );
                }
              }
            }

            if (section === "promoted") {
              l.push(
                <EntryListItem
                  promoted={true}
                  account={account}
                  key={`${e.author}-${e.permlink}`}
                  entry={e}
                  order={i}
                  community={community}
                />
              );
            } else {
              l.push(
                <EntryListItem
                  account={account}
                  key={`${e.author}-${e.permlink}`}
                  entry={e}
                  order={i}
                  community={community}
                />
              );
            }
            return [...l];
          })
        : showEmptyPlaceholder && (
            <EntryListContentNoData username={username} loading={loading} section={section} />
          )}
    </>
  );
}

export * from "./entry-list-content-loading";
export * from "./entry-list-content-no-data";
