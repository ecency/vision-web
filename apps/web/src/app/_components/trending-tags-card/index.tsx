"use client";

import { useActiveAccount } from "@/core/hooks/use-active-account";

import { FollowTagChipToggle } from "@/features/shared/follow-tag-btn";
import { TagLink } from "@/features/shared/tag";
import { getAccessToken } from "@/utils";
import { Button } from "@ui/button";
import { getFavoriteTagsQueryOptions, getTrendingTagsQueryOptions } from "@ecency/sdk";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { UilMultiply } from "@tooni/iconscout-unicons-react";
import i18next from "i18next";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Fragment, useCallback, useMemo } from "react";
import "./_index.scss";

export function TrendingTagsCard() {
  const router = useRouter();
  const params = useParams<{ sections: string[] }>();
  let filter = "hot";
  let tag = "";

  if (params && params.sections) {
    [filter = "hot", tag = ""] = params.sections;
  }

  const { activeUser } = useActiveAccount();
  const username = activeUser?.username;
  const accessToken = useMemo(
    () => (username ? getAccessToken(username) : undefined),
    [username]
  );

  const { data: trendingTagsPages } = useInfiniteQuery(getTrendingTagsQueryOptions(250));
  // The user's followed tags come first, then the trending list without them,
  // so a followed topic is one click away and never listed twice.
  const { data: favoriteTags } = useQuery(getFavoriteTagsQueryOptions(username, accessToken));
  const pinnedTags = useMemo(() => favoriteTags?.map((f) => f.tag) ?? [], [favoriteTags]);
  const trendingTags = useMemo(() => {
    const first = trendingTagsPages?.pages[0];
    if (!first) {
      return first;
    }
    const pinned = new Set(pinnedTags);
    return [...pinnedTags, ...first.filter((t) => !pinned.has(t))];
  }, [pinnedTags, trendingTagsPages?.pages]);

  const handleUnselection = useCallback(() => {
    router.push("/" + filter + ((activeUser && activeUser.username && "/my") || ""));
  }, [activeUser, filter, router]);

  return (
    <div className="trending-tags-card">
      <h2 className="list-header">{i18next.t("trending-tags.title")}</h2>

      <div className="flex flex-wrap gap-2">
        {trendingTags?.slice(0, 30).map((t) => (
          <Fragment key={t}>
            <div className="flex">
              <TagLink tag={t} type="link">
                <>
                  {t}
                  {activeUser && <FollowTagChipToggle tag={t} />}
                  {tag === t && (
                    <div
                      className="text-gray-600 flex dark:text-gray-400 ml-1 cursor-pointer"
                      role="button"
                      tabIndex={0}
                      aria-label={i18next.t("g.dismiss", { defaultValue: "Dismiss" })}
                      onClick={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        handleUnselection();
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.stopPropagation();
                          e.preventDefault();
                          handleUnselection();
                        }
                      }}
                    >
                      <UilMultiply className="size-3.5" />
                    </div>
                  )}
                </>
              </TagLink>
            </div>
          </Fragment>
        ))}
        {trendingTags?.length === 0 &&
          Array.from(new Array(30).keys()).map((i) => (
            <div
              className="animate-pulse rounded-full h-[22px] bg-blue-dark-sky-040 dark:bg-blue-dark-grey"
              key={i}
              style={{
                width: 64 + (i % 3) * 10
              }}
            />
          ))}
      </div>
      {trendingTags && trendingTags.length > 0 && (
        <Link href="/tags" className="mt-4 block">
          <Button full={true} size="sm" appearance="gray">
            {i18next.t("trending-tags.view-more")}
          </Button>
        </Link>
      )}
    </div>
  );
}
