import defaults from "@/defaults";
import { LinearProgress, UserAvatar } from "@/features/shared";
import { formattedNumber, makePath, truncate } from "@/utils";
import { SearchQuery } from "@/utils/search-query";
import { getCommunitiesQueryOptions } from "@ecency/sdk";
import { useQuery } from "@tanstack/react-query";
import i18next from "i18next";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMemo } from "react";
import "./_index.scss";

interface Props {
  history: History;
  location: Location;
  global: Global;
}

export function SearchCommunities() {
  const params = useSearchParams();

  const q = useMemo(
    () => new SearchQuery(params?.get("q") ?? "").search.split(" ")[0]?.replace("@", "") ?? "",
    [params]
  );
  // Disabled without a term, like the sibling panels. Left enabled it falls
  // back to listing the global top communities by rank, which a filter-only
  // search ("author:demo") then presents as if those four matched the query.
  const { isLoading, isError, data } = useQuery(
    getCommunitiesQueryOptions("rank", q, 4, undefined, !!q)
  );

  return (
    <div className="border border-[--border-color] bg-white rounded search-communities">
      <div className="bg-gray-100 dark:bg-dark-default border-b border-[--border-color] p-3">
        <strong>{i18next.t("search-communities.title")}</strong>
      </div>
      <div className="p-3">
        {(() => {
          if (isLoading) {
            return <LinearProgress />;
          }

          // A failed lookup leaves data undefined with isLoading false, the
          // same shape as an empty result. Saying "no matches" for a dropped
          // RPC is the failure/empty conflation the results list just lost.
          if (isError) {
            return <span className="text-gray-600">{i18next.t("search-comment.error-failed")}</span>;
          }

          // Without this the panel renders as an empty box on an empty result,
          // hitting neither the spinner nor the empty state.
          if (!data || data.length === 0) {
            return <span className="text-gray-600">{i18next.t("g.no-matches")}</span>;
          }

          return (
            <div className="community-list">
              {data?.map((community) => {
                const link = makePath(defaults.filter, community.name);

                const nOpts = { fractionDigits: 0 };
                const subscribers = formattedNumber(community.subscribers, nOpts);

                return (
                  <div key={community.name} className="list-item">
                    <div className="item-header">
                      <Link href={link}>
                        <UserAvatar username={community.name} size="medium" />
                      </Link>
                      <div className="item-title">
                        <Link href={link}>{community.title}</Link>

                        <div className="item-sub-title">
                          {i18next.t("communities.n-subscribers", { n: subscribers })}
                        </div>
                      </div>
                    </div>
                    <div className="item-about">{truncate(community.about, 120)}</div>
                  </div>
                );
              })}
            </div>
          );
        })()}
      </div>
    </div>
  );
}
