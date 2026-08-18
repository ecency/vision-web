"use client";

import { rcPower } from "@ecency/sdk";
import { EcencyConfigManager } from "@/config";
import defaults, { DEFAULT_IMAGE_SERVER } from "@/defaults";
import { Account } from "@/entities";
import { FollowControls, HivePosh, UserAvatar } from "@/features/shared";
import { FavoriteBtn } from "@/features/shared/favorite-btn";
import { TimeLabel } from "@/features/shared/time-label";
import { Badge } from "@/features/ui";
import { accountReputation } from "@/utils";
import {
  getAccountRcQueryOptions,
  getAccountSubscriptionsQueryOptions,
  getRelationshipBetweenAccountsQueryOptions,
  getAccountFullQueryOptions
} from "@ecency/sdk";
import { useQuery } from "@tanstack/react-query";
import {
  UilCalendarAlt,
  UilCommentDots,
  UilGlobe,
  UilLocationPoint,
  UilRss
} from "@tooni/iconscout-unicons-react";
import i18next from "i18next";
import Image from "next/image";
import Link from "next/link";
import { useMemo, useState } from "react";
import { ProfileInfo } from "../profile-info";
import { ResourceCreditsInfo } from "../rc-info";
import "./_index.scss";
import { ProfileCardExtraProperty } from "./profile-card-extra-property";
import { profileWebsiteHref } from "./website-href";
import { FinalizeCommunityBanner } from "../finalize-community-banner";
import { useActiveAccount } from "@/core/hooks";
import { ProBadge } from "@/features/pro";
import { DigestSubscribeButton, NewsletterGate, SenderStatusNotice } from "@/features/newsletter";

interface Props {
  account: Account;
}

export function ProfileCard({ account }: Props) {
  const { username: activeUsername, account: activeAccount } = useActiveAccount();

  const isMyProfile = useMemo(
    () => activeUsername === account?.name && activeAccount?.profile,
    [account?.name, activeUsername, activeAccount]
  );

  // Use the account prop directly instead of re-fetching (already prefetched by layout)
  const data = account;
  // Profile `website` is free-text; only link it when it forms a valid URL,
  // otherwise Next.js <Link> throws while prefetching (ECENCY-NEXT-1GE5).
  const websiteHref = useMemo(
    () => profileWebsiteHref(data?.profile?.website),
    [data?.profile?.website]
  );
  const { data: rcData } = useQuery(getAccountRcQueryOptions(account.name));
  const { data: relationshipBetweenAccounts } = useQuery({
    ...getRelationshipBetweenAccountsQueryOptions(account?.name, activeUsername ?? undefined),
    enabled: !isMyProfile && !!account?.name && !!activeUsername
  });
  const { data: subscriptions } = useQuery(getAccountSubscriptionsQueryOptions(account?.name));

  const [imageSrc, setImageSrc] = useState<string>();
  const moderatedCommunities = useMemo(
    () => subscriptions?.filter((x) => x[2] === "mod" || x[2] === "admin" || x[2] === "owner") ?? [],
    [subscriptions]
  );

  return (
    <div className="rounded-xl w-full overflow-hidden relative p-4">
      {/* No opacity fade-in here: this card is above the fold, so a
          JS-driven initial opacity:0 left the whole header (cover, avatar,
          name) invisible in the SSR HTML until hydration, delaying LCP paint.
          Render it visible from the server instead. */}
      <Image
          className="absolute top-0 left-0 w-full h-[96px] object-cover"
          src={imageSrc ?? (data?.profile?.cover_image ? `${DEFAULT_IMAGE_SERVER}/u/${data.name}/cover` : "/assets/promote-wave-bg.jpg")}
          alt=""
          width={300}
          height={200}
          priority
          fetchPriority="high"
          onError={() => setImageSrc("/assets/promote-wave-bg.jpg")}
      />

      {/* Overlaid on the cover (like ProfileInfo) — the relationship loads
          async, so an in-flow badge would shift the whole card down when it
          appears. */}
      {!isMyProfile && relationshipBetweenAccounts?.follows && (
        <div className="absolute z-10 left-4 top-4 animate-pop-in">
          <Badge>{i18next.t("profile.follows-you")}</Badge>
        </div>
      )}
      <div className="absolute z-10 right-4 top-4">
        <ProfileInfo account={account} />
      </div>

      <div className="relative flex flex-col mt-10 gap-2">
        <UserAvatar username={account?.name ?? ""} size="large" />

        <div className="flex flex-col gap-1">
          <div className="font-semibold flex items-center flex-wrap gap-2">
            {data?.profile?.name ?? account.name}
            <ProBadge username={account.name} />
          </div>
          <span className="text-sm text-gray-600 dark:text-gray-400 truncate flex gap-1">
            @{account.name}
            <Badge className="!px-1 !py-0">{accountReputation(data?.reputation ?? 0)}</Badge>
          </span>
          {data?.profile?.about && <div className="text-sm">{data?.profile.about}</div>}
        </div>

        <div className="grid grid-cols-2 pb-4">
          <Link
            href={`/@${account.name}/followers`}
            className="hover:text-blue-dark-sky hover:scale-95 duration-300 cursor-pointer"
          >
            <div className="text-sm opacity-50">{i18next.t("profile.followers")}</div>
            <div className="font-semibold">{data?.follow_stats?.follower_count ?? 0}</div>
          </Link>
          <Link
            href={`/@${account.name}/following`}
            className="hover:text-blue-dark-sky hover:scale-95 duration-300 cursor-pointer"
          >
            <div className="text-sm opacity-50">{i18next.t("profile.following")}</div>
            <div className="font-semibold">{data?.follow_stats?.following_count ?? 0}</div>
          </Link>
        </div>
      </div>
      <HivePosh username={account.name} className="mb-4" />

      {/* Policing (vision-web#1513): the creator sees when their own digest is suspended, and why. */}
      {isMyProfile && (
        <NewsletterGate>
          <SenderStatusNotice type="creator" target={account.name} isSender className="mb-4" />
        </NewsletterGate>
      )}

      {!isMyProfile && (
        <div className="mb-4 flex flex-wrap gap-2">
          <FollowControls targetUsername={account?.name} />
          <EcencyConfigManager.Conditional
            condition={({ visionFeatures }) => visionFeatures.favourites.enabled}
          >
            <FavoriteBtn targetUsername={account?.name} />
          </EcencyConfigManager.Conditional>
          {activeUsername && (
            <Link
              href={`/chats?dm=${encodeURIComponent(account?.name ?? "")}`}
              className="flex items-center justify-center size-9 rounded-full border border-[--border-color] hover:border-blue-dark-sky hover:text-blue-dark-sky transition-colors"
              title={i18next.t("profile.message", { defaultValue: "Message" })}
              aria-label={i18next.t("profile.message", { defaultValue: "Message" })}
            >
              <UilCommentDots className="size-4" />
            </Link>
          )}
          <NewsletterGate>
            <DigestSubscribeButton
              type="creator"
              target={account.name}
              targetLabel={data?.profile?.name || `@${account.name}`}
              source="creator-page"
              size="sm"
            />
          </NewsletterGate>
        </div>
      )}

      {data && (
        <div className="-mx-4 border-y border-[--border-color] px-4 py-4">
          <ResourceCreditsInfo rcPercent={rcData ? rcPower(rcData[0]) : 100} account={data} />
        </div>
      )}
      <div className="grid grid-cols-2 lg:grid-cols-1 w-full gap-4 py-4">
        {data?.profile?.location && (
          <ProfileCardExtraProperty
            icon={<UilLocationPoint className="size-5" />}
            label={i18next.t("profile-edit.location")}
          >
            {data.profile.location}
          </ProfileCardExtraProperty>
        )}

        {data?.profile?.website && (
          <ProfileCardExtraProperty
            icon={<UilGlobe className="size-5" />}
            label={i18next.t("profile-edit.website")}
          >
            {websiteHref ? (
              <Link
                target="_external"
                rel="nofollow ugc noopener"
                className="break-all"
                href={websiteHref}
              >
                {data?.profile?.website}
              </Link>
            ) : (
              <span className="break-all">{data?.profile?.website}</span>
            )}
          </ProfileCardExtraProperty>
        )}

        {data?.created && (
          <ProfileCardExtraProperty
            icon={<UilCalendarAlt className="size-5" />}
            label={i18next.t("referral.created")}
          >
            <TimeLabel created={data?.created} mode="absolute" format="LL" />
          </ProfileCardExtraProperty>
        )}

        <ProfileCardExtraProperty icon={<UilRss className="size-5" />} label="RSS Feed">
          <Link target="_external" href={`${defaults.base}/@${account?.name}/rss`}>
            {i18next.t("profile-info.subscribe")}
          </Link>
        </ProfileCardExtraProperty>
      </div>

      {moderatedCommunities.length > 0 && (
        <div className="-mx-4 p-4 flex flex-col gap-2 border-t border-[--border-color]">
          <div className="text-sm opacity-50">{i18next.t("profile.com-mod")}</div>
          {moderatedCommunities.map((x) => (
            <Link className="flex items-center gap-2 text-sm" key={x[0]} href={`/created/${x[0]}`}>
              <UserAvatar username={x[0]} size="small" />
              {x[1]}
            </Link>
          ))}
        </div>
      )}

      <FinalizeCommunityBanner username={account.name} />
    </div>
  );
}
