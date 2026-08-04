import React, { Fragment, useCallback, useMemo, useState } from "react";
import numeral from "numeral";
import dayjs, { Dayjs } from "@/utils/dayjs";
import "./_index.scss";
import { DetectBottom, LinearProgress, SearchListItem } from "@/features/shared";
import i18next from "i18next";
import { SearchAdvancedForm } from "@/app/search/_components/search-advanced-form";
import { getSearchApiInfiniteQueryOptions } from "@ecency/sdk";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { SearchResult } from "@/entities";
import { Button } from "@/features/ui";
import { DateOpt } from "@/enums";
import { SearchSort } from "@/app/decks/_components/consts";
import { useBottomPagination } from "@/core/hooks";

interface Props {
  disableResults?: boolean;
}

export function SearchComment({ disableResults }: Props) {
  const params = useSearchParams();

  // The advanced form writes adv=1 when it applies filters, so a reloaded or
  // shared advanced-search URL has to show the panel the active filters belong
  // to. The URL only seeds it - once the user toggles, that choice wins.
  const [advancedToggle, setAdvancedToggle] = useState<boolean>();
  const advanced = advancedToggle ?? params?.get("adv") === "1";

  const q = params?.get("q") ?? "";

  const since = useMemo(() => {
    let sinceDate: Dayjs | undefined;
    // Default search path is all-time on purpose. Only honor an explicit date
    // from the URL (set by the advanced form) — not a stale localStorage value,
    // which would otherwise pin existing users to the old "last year" default.
    const dateOpt = params?.get("date") ?? DateOpt.A;
    switch (dateOpt) {
      case DateOpt.W:
        sinceDate = dayjs().subtract(1, "week");
        break;
      case DateOpt.M:
        sinceDate = dayjs().subtract(1, "month");
        break;
      case DateOpt.Y:
        sinceDate = dayjs().subtract(1, "year");
        break;
      default:
        sinceDate = undefined;
    }

    return sinceDate?.format("YYYY-MM-DDTHH:mm:ss");
  }, [params]);

  const {
    data: resultsPages,
    dataUpdatedAt,
    isError,
    isFetching,
    fetchNextPage,
    hasNextPage
  } = useInfiniteQuery({
    ...getSearchApiInfiniteQueryOptions(
      q,
      params?.get("sort") ?? SearchSort.RELEVANCE,
      params?.get("hd") !== "0",
      since,
      undefined,
      params?.get("nsfw") === "1" || undefined
    )
    // No `initialData` here on purpose. Seeding it made `state.data` defined,
    // which is exactly what shouldLoadOnMount checks, so React Query never
    // fetched page 1 and the bottom sentinel was the only thing that could
    // start it (refetchOnMount is false app-wide). That held only while the
    // sentinel was near the top of a short card: with the advanced panel open
    // from adv=1, on a phone the sentinel starts below the fold and page 1 was
    // never requested at all. The sentinel now does what it says, pagination.
  });
  const results = useMemo(
    () =>
      resultsPages?.pages?.reduce<SearchResult[]>((acc, page) => [...acc, ...page.results], []) ??
      [],
    [resultsPages]
  );

  // Read the doc comment on this hook before changing anything around it.
  const loadMore = useBottomPagination({
    data: resultsPages,
    dataUpdatedAt,
    hasNextPage,
    isFetching,
    fetchNextPage
  });
  // fetchNextPage does not consult `enabled`, so on /search with no q the
  // sentinel would still post an empty query and collect a 400. The identity
  // changes with q, which is what re-runs the sentinel's effect once a query
  // does arrive.
  const onBottom = useCallback(() => {
    if (q) {
      loadMore();
    }
  }, [loadMore, q]);
  const hits = useMemo(
    () => resultsPages?.pages?.[resultsPages?.pages?.length - 1]?.hits ?? 0,
    [resultsPages?.pages]
  );

  // There is a first page coming whenever a query is set and none has landed
  // yet, which covers the gap between mount and the fetch resolving. Derived
  // from the pages rather than isLoading so it stays true across the whole gap,
  // and gates the empty message only - never the sentinel.
  const isFirstPagePending = !!q && !isError && (resultsPages?.pages?.length ?? 0) === 0;

  return (
    <div className="border dark:border-dark-400 overflow-hidden bg-white rounded search-comment">
      <div className="bg-gray-100 dark:bg-dark-200 border-b dark:border-dark-400 p-3 flex justify-between items-center">
        <div>
          <strong>{i18next.t("search-comment.title")}</strong>
          {(() => {
            if (hits === 1) {
              return (
                <span className="matches">{i18next.t("search-comment.matches-singular")}</span>
              );
            }

            if (hits > 1) {
              const strHits = numeral(hits).format("0,0");
              return (
                <span className="text-sm text-gray-600 pl-3">
                  {i18next.t("search-comment.matches", { n: strHits })}
                </span>
              );
            }

            return null;
          })()}
        </div>
        <a
          href="#"
          onClick={(e) => {
            e.preventDefault();
            setAdvancedToggle(!advanced);
          }}
        >
          {advanced ? i18next.t("g.close") : i18next.t("search-comment.advanced")}
        </a>
      </div>
      <div className="p-4">
        {advanced && <SearchAdvancedForm />}
        {(() => {
          if (results.length > 0 && !disableResults) {
            return (
              <div className="search-list">
                {results.map((res: SearchResult) => (
                  <Fragment key={`${res.author}-${res.permlink}`}>
                    <SearchListItem res={res} />
                  </Fragment>
                ))}

                {hasNextPage && (
                  <div className="flex justify-center capitalize">
                    <Button outline={true} disabled={isFetching} onClick={onBottom}>
                      {i18next.t("search-comment.show-more")}
                    </Button>
                  </div>
                )}
              </div>
            );
          }

          // Checked after the results branch: a failed "show more" must not
          // replace the pages the user is already reading with an error.
          // Gated on q for the same reason isFirstPagePending is: with no query
          // there is nothing the user asked for to have failed. The backend
          // explains the rejection in the response body, but that text is
          // English only and lives in another repo, so it stays on the error
          // object for Sentry rather than being rendered.
          if (isError && q) {
            return (
              <div role="alert">
                <span className="text-red-500">{i18next.t("search-comment.error-failed")}</span>
              </div>
            );
          }

          if (isFirstPagePending) {
            return null;
          }

          return <span>{i18next.t("g.no-matches")}</span>;
        })()}

        {!disableResults && isFirstPagePending && <LinearProgress />}
      </div>
      <DetectBottom onBottom={onBottom} />
    </div>
  );
}
