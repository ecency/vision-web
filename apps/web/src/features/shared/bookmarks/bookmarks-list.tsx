import { useActiveAccount } from "@/core/hooks/use-active-account";
import { LinearProgress } from "@/features/shared";
import { getBookmarksInfiniteQueryOptions } from "@ecency/sdk";
import { useInfiniteQuery } from "@tanstack/react-query";
import i18next from "i18next";
import { BookmarkItem } from "./bookmark-item";
import { useVisibleEntries } from "../entry-list-item/use-muted-authors";
import { getAccessToken } from "@/utils";
import { Button } from "@ui/button";
import { useMemo } from "react";

interface Props {
  onHide: () => void;
}

export function BookmarksList({ onHide }: Props) {
  const { activeUser } = useActiveAccount();

  const {
    data,
    isPending: isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery(
    getBookmarksInfiniteQueryOptions(
      activeUser?.username,
      getAccessToken(activeUser?.username ?? ""),
      10
    )
  );

  const allBookmarks = useMemo(
    () => data?.pages.flatMap((page) => page.data) ?? [],
    [data]
  );

  const sorted = useMemo(
    () => allBookmarks.sort((a, b) => (b.timestamp > a.timestamp ? 1 : -1)),
    [allBookmarks]
  );

  // Bookmarks of muted authors are dropped like any other list, so the count
  // behind the empty state has to be the visible one: otherwise a page of
  // nothing but muted authors renders as an empty grid instead of saying so.
  const items = useVisibleEntries(sorted);

  return (
    <div className="dialog-content ">
      <p className="text-sm text-gray-500 dark:text-gray-400 px-3 pt-3 pb-1">
        {i18next.t("bookmarks.hint")}
      </p>
      {isLoading && <LinearProgress />}
      {items && items.length > 0 && (
        <div className="dialog-list">
          <div className="grid grid-cols-1 gap-4">
            {items.map((item, i) => (
              <BookmarkItem i={i} key={item._id} author={item.author} permlink={item.permlink} />
            ))}
          </div>
          {hasNextPage && (
            <div className="flex justify-center my-4">
              <Button
                onClick={() => fetchNextPage()}
                disabled={isFetchingNextPage}
                isLoading={isFetchingNextPage}
              >
                {isFetchingNextPage ? i18next.t("g.loading") : i18next.t("g.load-more")}
              </Button>
            </div>
          )}
        </div>
      )}
      {!isLoading && items.length === 0 && (
        <div className="dialog-list">{i18next.t("g.empty-list")}</div>
      )}
    </div>
  );
}
