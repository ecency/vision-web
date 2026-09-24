import React, { useMemo } from "react";
import { ListItemSkeleton, SearchListItem } from "../deck-items";
import { Button } from "@ui/button";
import { getPostsRankedInfiniteQueryOptions } from "@ecency/sdk";
import { useInfiniteQuery } from "@tanstack/react-query";
import { arrowLeftSvg } from "@ui/svg";
import { useMounted } from "@/utils/use-mounted";
import { makeEntryPath } from "@/utils";
import { Entry } from "@/entities";
import { openInNewTab } from "@/utils/open-in-new-tab";

interface Props {
  topic: string;
  backTitle?: string;
  onClose: () => void;
}

export const DeckTopicsContentViewer = ({ onClose, backTitle, topic }: Props) => {
  const { data } = useInfiniteQuery(getPostsRankedInfiniteQueryOptions("trending", "", 20, topic));

  const dataFlow = useMemo(
    () => data?.pages?.reduce((acc: Entry[], item: Entry[]) => [...acc, ...item], []) ?? [],
    [data]
  );
  const isMounted = useMounted();

  return (
    <div
      className={
        "deck-post-viewer deck-topic-content-viewer w-full " + (isMounted ? "visible" : "")
      }
    >
      <div className="deck-post-viewer-header">
        <div className="actions flex pt-3 mr-3">
          <Button
            appearance="link"
            onClick={() => {
              setTimeout(() => onClose(), 300);
            }}
            icon={arrowLeftSvg}
            iconPlacement="left"
          >
            {backTitle}
          </Button>
        </div>
        <div className="title p-3 flex">
          <span>#{topic}</span>
        </div>
      </div>
      <div>
        {dataFlow?.map((item: any, index: number) => (
          <div className="virtual-list-item" key={item.post_id}>
            <SearchListItem
              index={index + 1}
              entry={{
                ...item,
                toggleNotNeeded: true
              }}
              {...item}
              onMounted={() => {}}
              onEntryView={() =>
                openInNewTab(makeEntryPath(item.category, item.author, item.permlink))
              }
            ></SearchListItem>
          </div>
        ))}
        {dataFlow.length === 0 && (
          <div className="skeleton-list pt-0">
            {Array.from(Array(20).keys()).map((i) => (
              <div key={i}>
                <ListItemSkeleton />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
