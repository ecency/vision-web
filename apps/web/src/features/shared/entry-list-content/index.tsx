"use client";

import React, { useMemo } from "react";
import "./_index.scss";
import { Account, Community, Entry } from "@/entities";
import { EntryListItem } from "@/features/shared";
import { useMutedAuthors } from "@/features/shared/entry-list-item/use-muted-authors";
import { isAuthorMuted } from "@ecency/sdk";
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
  const mutedAuthors = useMutedAuthors();

  // Filter here rather than inside the card: the list is what knows whether it
  // has anything left to show, and dropping a card from within itself would
  // leave this component on its populated branch with nothing under it.
  const dataToRender = useMemo(
    () => entries.filter((e) => !isAuthorMuted(e.author, mutedAuthors)),
    [entries, mutedAuthors]
  );
  const promotedToRender = useMemo(
    () => promotedEntries.filter((e) => !isAuthorMuted(e.author, mutedAuthors)),
    [promotedEntries, mutedAuthors]
  );

  return (
    <>
      {dataToRender.length > 0
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
