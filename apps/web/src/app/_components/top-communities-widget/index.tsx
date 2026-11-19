"use client";

import { getCommunityCache } from "@/core/caches";
import { Community } from "@/entities";
import { UserAvatar } from "@/features/shared/user-avatar";
import { IntentLink } from "@/features/shared/intent-link";
import { SubscriptionBtn } from "@/app/communities/_components/subscription-btn";
import { formattedNumber, makePath } from "@/utils";
import { AllFilter } from "@/enums";
import { seededShuffle } from "@/utils/seeded-shuffle";
import { useActiveAccount } from "@/core/hooks/use-active-account";
import { getAccountSubscriptionsQueryOptions, getCommunitiesQueryOptions } from "@ecency/sdk";
import { useQuery } from "@tanstack/react-query";
import i18next from "i18next";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

const PINNED = "hive-125125";
const SLOTS = 3;
/** The ranked communities the two rotating slots draw from. */
const POOL_SIZE = 30;
/**
 * How many ranked communities to ask for. The pool is 30 and the card shows
 * three, so the request only ever needs to cover the pool with a little room;
 * the previous 100 pulled the whole payload on every feed load to render three
 * rows.
 */
const FETCH_LIMIT = 50;
/** How many of the reader's own communities the card lists. */
const MY_SLOTS = 5;

/**
 * A logged-in reader who belongs to communities gets a few of their own as a
 * way back in; everyone else, and a reader whose subscriptions fail to load,
 * gets the discovery card.
 */
export const TopCommunitiesWidget = () => {
  const { username } = useActiveAccount();
  const { data: subscriptions, isLoading } = useQuery(
    getAccountSubscriptionsQueryOptions(username ?? undefined)
  );
  // Once discovery is on screen for a reader it stays for this page load.
  // Joining a suggestion updates the subscriptions optimistically, and the card
  // must not swap to "My communities" under the reader's click. And after a
  // failed request, the join buttons subscribe to the same query and refetch
  // it, which must not put the skeleton back.
  const [discoverFor, setDiscoverFor] = useState<string | null>(null);
  const discoverLatched = !!username && discoverFor === username;

  const showMine =
    !!username && !discoverLatched && !!subscriptions && subscriptions.length > 0;
  const showDiscover = !showMine && (discoverLatched || !(username && isLoading));

  useEffect(() => {
    if (showDiscover && username) setDiscoverFor(username);
  }, [showDiscover, username]);

  if (showMine) return <MyCommunities username={username} subscriptions={subscriptions} />;
  if (!showDiscover) return <SidebarSkeleton />;
  return <DiscoverCommunities />;
};

function SidebarSkeleton() {
  return (
    <div className="feed-communities">
      <div className="flex flex-col gap-6">
        {Array.from({ length: 3 }, (_, i) => (
          <div
            key={i}
            className="h-24 rounded bg-gray-100 dark:bg-gray-800 animate-pulse"
            aria-hidden="true"
          />
        ))}
      </div>
    </div>
  );
}

function MyCommunities({
  username,
  subscriptions
}: {
  username: string;
  /**
   * Bridge subscription rows, [name, title, role, label]. The SDK types the
   * query as string[], so each row is checked before it is read.
   */
  subscriptions: readonly unknown[];
}) {
  // Same per-mount seed as the discovery card: a different handful on every
  // page load, stable while the reader scrolls or the query refetches.
  const [seed] = useState(() => Math.random());
  const list = useMemo(() => {
    const unique = new Map<string, string>();
    for (const row of subscriptions) {
      if (!Array.isArray(row)) continue;
      const [name, title] = row;
      if (typeof name !== "string" || !name || unique.has(name)) continue;
      unique.set(name, typeof title === "string" && title ? title : name);
    }
    return seededShuffle([...unique], seed).slice(0, MY_SLOTS);
  }, [subscriptions, seed]);

  return (
    <div className="feed-communities">
      <h2 className="feed-sidebar-heading">{i18next.t("top-communities.my-title")}</h2>
      <ul className="feed-topic-list">
        {list.map(([name, title]) => (
          <li key={name} className="feed-topic-row">
            <IntentLink href={makePath(AllFilter.hot, name)}>
              <UserAvatar username={name} size="small" />
              <span className="truncate">{title}</span>
            </IntentLink>
          </li>
        ))}
      </ul>
      <Link href={`/@${username}/communities`} className="feed-sidebar-link">
        {i18next.t("top-communities.view-all")}
      </Link>
      <div className="feed-community-create">
        <Link href="/communities" className="feed-sidebar-link">
          {i18next.t("top-communities.explore")}
        </Link>
      </div>
    </div>
  );
}

function DiscoverCommunities() {
  const { data: ecencyCommunity, isLoading: ecencyLoading } = useQuery(
    getCommunityCache(PINNED)
  );
  const { data, isLoading, isError } = useQuery(getCommunitiesQueryOptions("rank", undefined, FETCH_LIMIT));
  // One seed per mount: the pair changes on every page load, so more communities
  // get seen, but stays put while the reader scrolls and the queries refetch.
  const [seed] = useState(() => Math.random());

  const list = useMemo(() => {
    // Town Square is pinned first. The other slots rotate through the top of the
    // ranking instead of always showing the same two leaders. A failed Town
    // Square request must not hide the other suggestions, and the list is
    // deduplicated by community name.
    const communities = new Map<string, Community>();
    if (ecencyCommunity) communities.set(ecencyCommunity.name, ecencyCommunity);
    const pool = (data ?? []).filter((c) => c.name !== PINNED).slice(0, POOL_SIZE);
    for (const community of seededShuffle(pool, seed)) {
      if (communities.size === SLOTS) break;
      if (!communities.has(community.name)) communities.set(community.name, community);
    }
    return [...communities.values()];
  }, [ecencyCommunity, data, seed]);
  const loading = isLoading || ecencyLoading;

  return (
    <div className="feed-communities">
      <h2 className="feed-sidebar-heading">{i18next.t("top-communities.discover-title")}</h2>
      <div className="flex flex-col gap-6">
        {list.map((community) => (
          <div key={community.name} className="feed-community">
            <div className="feed-community-heading">
              <IntentLink
                href={makePath(AllFilter.hot, community.name)}
                className="feed-community-name"
              >
                <UserAvatar username={community.name} size="small" />
                <span>{community.title}</span>
              </IntentLink>
              <SubscriptionBtn community={community} buttonProps={{ size: "sm", outline: true }} />
            </div>
            <p className="feed-community-about">{community.about}</p>
            <div className="feed-community-members">
              {i18next.t("communities.n-subscribers", {
                n: formattedNumber(community.subscribers, { fractionDigits: 0 })
              })}
            </div>
          </div>
        ))}
        {list.length === 0 &&
          loading &&
          Array.from({ length: 3 }, (_, i) => (
            <div
              key={i}
              className="h-24 rounded bg-gray-100 dark:bg-gray-800 animate-pulse"
              aria-hidden="true"
            />
          ))}
        {list.length === 0 && !loading && (
          <p className="text-sm text-gray-600 dark:text-gray-400">
            {i18next.t(isError ? "g.server-error" : "communities.no-results")}
          </p>
        )}
      </div>
      <Link href="/communities" className="feed-sidebar-link">
        {i18next.t("top-communities.explore")}
      </Link>
      <div className="feed-community-create">
        <Link href="/communities/create" className="feed-sidebar-link">
          {i18next.t("top-communities.create-button")}
        </Link>
      </div>
    </div>
  );
}
