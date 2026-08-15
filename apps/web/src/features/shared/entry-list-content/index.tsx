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
      {/* `showEmptyPlaceholder` means "this component owns the list's empty
          state", so the decision is made on what the viewer can actually see: a
          list of nothing but muted authors is empty to them. Anything rendering
          ONE SLICE of a longer list (a server-rendered page 1 with an infinite
          list under it) must pass false and let the sibling that knows the
          total decide, or an all-muted first page will announce that the whole
          feed is empty above pages that are not. */}
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
