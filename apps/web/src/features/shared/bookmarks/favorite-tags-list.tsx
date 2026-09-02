import { useActiveAccount } from "@/core/hooks/use-active-account";
import { LinearProgress } from "@/features/shared";
import { FavoriteTagItem } from "@/features/shared/bookmarks/favorite-tag-item";
import { getFavoriteTagsInfiniteQueryOptions } from "@ecency/sdk";
import { useInfiniteQuery } from "@tanstack/react-query";
import i18next from "i18next";
import { getAccessToken } from "@/utils";
import { Button } from "@ui/button";
import { useMemo } from "react";

interface Props {
  onHide: () => void;
}

export function FavoriteTagsList({ onHide }: Props) {
  const { activeUser } = useActiveAccount();
  const username = activeUser?.username;
  const accessToken = useMemo(
    () => (username ? getAccessToken(username) : undefined),
    [username]
  );

  const {
    data,
    isPending: isLoading,
    isError,
    refetch,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage
  } = useInfiniteQuery(getFavoriteTagsInfiniteQueryOptions(username, accessToken, 20));

  const items = useMemo(() => data?.pages.flatMap((page) => page.data) ?? [], [data]);

  return (
    <div className="dialog-content">
      {isLoading && <LinearProgress />}
      {!isLoading && items.length > 0 && (
        <p className="text-sm text-gray-500 dark:text-gray-400 px-3 pt-3 pb-1">
          {i18next.t("favorite-tags.hint")}
        </p>
      )}
      {items.length > 0 && (
        <div className="dialog-list">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {items.map((item, i) => (
              <FavoriteTagItem i={i} key={item._id} item={item} onHide={onHide} />
            ))}
          </div>
          {hasNextPage && (
            <div className="flex justify-center my-4 col-span-full">
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
      {!isLoading && isError && (
        // A failed request is not an empty list; say so and offer to try again.
        <div className="dialog-list flex flex-col items-start gap-2">
          <span className="text-red">{i18next.t("g.server-error")}</span>
          <Button size="sm" appearance="gray" onClick={() => refetch()}>
            {i18next.t("g.retry", { defaultValue: "Retry" })}
          </Button>
        </div>
      )}
      {!isLoading && !isError && items.length === 0 && (
        <div className="dialog-list">{i18next.t("g.empty-list")}</div>
      )}
    </div>
  );
}
