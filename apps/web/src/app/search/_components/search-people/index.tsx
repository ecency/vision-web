import React, { useMemo } from "react";
import "./_index.scss";
import { LinearProgress, ProfileLink, UserAvatar } from "@/features/shared";
import i18next from "i18next";
import { useSearchParams } from "next/navigation";
import { getSearchAccountQueryOptions } from "@ecency/sdk";
import { useQuery } from "@tanstack/react-query";
import { SearchQuery } from "@ecency/sdk";
import { ProBadge } from "@/features/pro";
import { truncate } from "@/utils";

export function SearchPeople() {
  const params = useSearchParams();

  const q = useMemo(
    () =>
      (new SearchQuery(params?.get("q") ?? "").search.split(" ")[0]?.replace("@", "") ?? "").toLowerCase(),
    [params]
  );
  const { data: results, isLoading, isError } = useQuery(getSearchAccountQueryOptions(q));

  return (
    <div className="border border-[--border-color] bg-white rounded  search-people">
      <div className="bg-gray-100 dark:bg-dark-default border-b border-[--border-color] p-3">
        <strong>{i18next.t("search-people.title")}</strong>
      </div>
      <div className="p-3">
        {(() => {
          if (isLoading) {
            return <LinearProgress />;
          }

          // A failed lookup also leaves data undefined with isLoading false, so
          // it has to be told apart from an empty one or the panel reports "no
          // such account" for a request that never came back.
          if (isError) {
            return <span className="text-gray-600">{i18next.t("search-comment.error-failed")}</span>;
          }

          // With no term to look up the query is disabled, so isLoading is
          // false and data is undefined - without this the panel renders as an
          // empty box, hitting neither the spinner nor the empty state.
          if (!results || results.length === 0) {
            return <span className="text-gray-600">{i18next.t("g.no-matches")}</span>;
          }

          return (
            <div className="people-list">
              <div className="list-body">
                {results?.map((i) => {
                  const username = i.name;
                  const fullName = i.metadata?.profile?.name ?? "";
                  const about = i.metadata?.profile?.about ?? "";
                  return (
                    <div className="list-item" key={username}>
                      <div className="item-header">
                        <ProfileLink username={username}>
                          <UserAvatar username={username} size="medium" />
                        </ProfileLink>
                        <div className="item-title">
                          <ProfileLink username={username}>
                            <span className="item-name notranslate">{fullName}</span>
                          </ProfileLink>
                          <span className="item-sub-title">
                            {"@"}
                            {username}
                            <ProBadge username={username} className="ml-1" />
                          </span>
                        </div>
                      </div>
                      <div className="item-about">{truncate(about, 120)}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })()}
      </div>
    </div>
  );
}
