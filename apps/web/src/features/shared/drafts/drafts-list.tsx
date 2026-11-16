import React, { useEffect, useMemo, useRef, useState } from "react";
import { LinearProgress } from "@/features/shared";
import { FormControl } from "@ui/input";
import { DraftListItem } from "@/features/shared/drafts/draft-list-item";
import { getDraftsInfiniteQueryOptions } from "@ecency/sdk";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useActiveAccount } from "@/core/hooks/use-active-account";
import i18next from "i18next";
import { useCloneDraft, useDeleteDraft } from "@/api/mutations";
import { usePathname, useRouter } from "next/navigation";
import useMount from "react-use/lib/useMount";
import { getAccessToken } from "@/utils";
import { Button } from "@ui/button";
import type { Draft } from "@/entities";
import { clearAutosavePointer } from "@/app/publish/_utils/autosave-pointer";

// Bounds the automatic page waterfall that skips template-only pages.
const AUTO_FETCH_PAGE_BUDGET = 5;

interface Props {
  onHide: () => void;
  onPick?: (url: string) => void;
}

export function DraftsList({ onHide, onPick }: Props) {
  const innerRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const router = useRouter();
  const pathname = usePathname();
  const { activeUser } = useActiveAccount();

  const [filter, setFilter] = useState("");
  const {
    data,
    isPending,
    refetch,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery(
    getDraftsInfiniteQueryOptions(
      activeUser?.username,
      getAccessToken(activeUser?.username ?? ""),
      10
    )
  );

  const allDrafts = useMemo(
    () =>
      (data?.pages.flatMap((page) => page.data) ?? []).filter(
        (d) => !d.meta?.postTemplate
      ),
    [data]
  );

  const items = useMemo(
    () =>
      allDrafts
        .filter((x) => x.title.toLowerCase().indexOf(filter.toLowerCase()) !== -1)
        .sort((a, b) => (new Date(b.modified).getTime() > new Date(a.modified).getTime() ? 1 : -1)),
    [allDrafts, filter]
  );

  const { mutateAsync: cloneDraft, isPending: isCloning } = useCloneDraft(() => {
    listRef.current?.scrollIntoView(true);
  });
  const { mutateAsync: deleteDraft } = useDeleteDraft((id) => {
    // /publish must not offer to resume a draft that no longer exists.
    if (activeUser?.username) clearAutosavePointer(activeUser.username, id);
    // if user editing the draft, redirect to submit page
    if (pathname === `/draft/${id}`) {
      router.push("/publish");
    }
  });

  useMount(() => {
    refetch();
  });

  useEffect(() => {
    if (allDrafts && allDrafts.length > 0) {
      innerRef.current?.focus();
    }
  }, [allDrafts]);

  const pagesLoaded = data?.pages.length ?? 0;

  // A fetched page can consist entirely of templates; keep fetching so the
  // empty state never hides non-template drafts living on later pages. The
  // page budget bounds the waterfall for users whose drafts are all
  // templates; past it, loading continues on demand below.
  useEffect(() => {
    if (
      hasNextPage &&
      !isFetchingNextPage &&
      allDrafts.length === 0 &&
      pagesLoaded < AUTO_FETCH_PAGE_BUDGET
    ) {
      fetchNextPage();
    }
  }, [allDrafts.length, fetchNextPage, hasNextPage, isFetchingNextPage, pagesLoaded]);

  if (isPending) {
    return <LinearProgress />;
  }

  if (allDrafts.length === 0) {
    if (hasNextPage) {
      if (isFetchingNextPage || pagesLoaded < AUTO_FETCH_PAGE_BUDGET) {
        return <LinearProgress />;
      }
      return (
        <div className="flex justify-center my-4">
          <Button onClick={() => fetchNextPage()}>{i18next.t("g.load-more")}</Button>
        </div>
      );
    }
    return <div className="drafts-list">{i18next.t("g.empty-list")}</div>;
  }

  return (
    <div className="dialog-content">
      <div className="dialog-filter sticky -top-12 sm:top-4 w-full bg-white border-b border-[--border-color] pt-2 pb-4">
        <FormControl
          ref={innerRef}
          type="text"
          placeholder={i18next.t("drafts.filter")}
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
      </div>
      {isCloning && <LinearProgress />}
      {items.length === 0 && <span className="text-gray-600">{i18next.t("g.no-matches")}</span>}

      {items.length > 0 && (
        <div className="drafts-list">
          <div className="flex flex-col gap-4 my-4" ref={listRef}>
            {items.map((item) => (
              <DraftListItem
                key={item._id}
                draft={item}
                editFn={(_, isNewEditor) => {
                  if (isNewEditor) {
                    router.push(`/publish/drafts/${item._id}`);
                  } else {
                    router.push(`/draft/${item._id}`);
                  }
                  onHide();
                }}
                deleteFn={() => deleteDraft({ id: item._id })}
                cloneFn={() => cloneDraft({ item })}
              />
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
    </div>
  );
}
