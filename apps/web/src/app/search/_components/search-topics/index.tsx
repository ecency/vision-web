import React, { useMemo } from "react";
import defaults from "@/defaults";
import "./_index.scss";
import Link from "next/link";
import { makePath } from "@/utils";
import { LinearProgress } from "@/features/shared";
import i18next from "i18next";
import { useSearchParams } from "next/navigation";
import { SearchQuery } from "@/utils/search-query";
import { getSearchTopicsQueryOptions } from "@ecency/sdk";
import { useQuery } from "@tanstack/react-query";

export function SearchTopics() {
  const params = useSearchParams();

  const q = useMemo(
    () =>
      (new SearchQuery(params?.get("q") ?? "").search.split(" ")[0]?.replace("@", "") ?? "").toLowerCase(),
    [params]
  );

  const { data, isLoading, isError } = useQuery(getSearchTopicsQueryOptions(q, 10));

  return (
    <div className="border border-[--border-color] bg-white rounded  search-topics">
      <div className="bg-gray-100 dark:bg-dark-default border-b border-[--border-color] p-3">
        <strong>{i18next.t("search-topics.title")}</strong>
      </div>
      <div className="p-3">
        {(() => {
          if (isLoading) {
            return <LinearProgress />;
          }

          // A failed lookup also leaves data undefined with isLoading false, so
          // it has to be told apart from an empty one or the panel reports "no
          // such topic" for a request that never came back.
          if (isError) {
            return <span className="text-gray-600">{i18next.t("search-comment.error-failed")}</span>;
          }

          // With no term to look up the query is disabled, so isLoading is
          // false and data is undefined - without this the panel renders as an
          // empty box, hitting neither the spinner nor the empty state.
          if (!data || data.length === 0) {
            return <span className="text-gray-600">{i18next.t("g.no-matches")}</span>;
          }

          return (
            <div className="topic-list">
              {data?.map((tag) => (
                  <Link href={makePath(defaults.filter, tag)} className="list-item" key={tag}>
                    {tag}
                  </Link>
              ))}
            </div>
          );
        })()}
      </div>
    </div>
  );
}
