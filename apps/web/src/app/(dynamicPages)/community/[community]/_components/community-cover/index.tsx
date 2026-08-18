"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { setProxyBase } from "@ecency/render-helper";
import "./_index.scss";
import defaults, { DEFAULT_IMAGE_SERVER } from "@/defaults";
import i18next from "i18next";
import { CommunityCoverEditImage } from "@/app/(dynamicPages)/community/[community]/_components/community-cover-edit-image";
import { SubscriptionBtn } from "@/app/communities/_components";
import { Account, Community, FullAccount } from "@/entities";
import { useActiveAccount } from "@/core/hooks/use-active-account";
import { useGlobalStore } from "@/core/global-store";
import { formattedNumber } from "@/utils";
import { Button } from "@ui/button";
import Link from "next/link";
import { CommunityStatItem } from "@/app/(dynamicPages)/community/[community]/_components/community-cover/community-stat-item";
import { messageSendSvg } from "@/assets/img/svg";
import { DigestSubscribeButton } from "@/features/newsletter";
import { EcencyConfigManager } from "@/config";

setProxyBase(defaults.imageServer);

interface Props {
  community: Community;
  account: Account;
}

export function CommunityCover({ community, account }: Props) {
  const { activeUser } = useActiveAccount();
  const theme = useGlobalStore((state) => state.theme);
  const { data: channelData } = useQuery({
    queryKey: ["private-api", "get-community-channel", community.name],
    queryFn: () =>
      fetch(`${defaults.base}/private-api/channel/${community.name}`).then((resp) => resp.json()),
    retry: false,
    refetchOnMount: false,
  });
  const hasCommunityChannel = !!channelData?.channel_id;

  // Reset the error fallback when navigating between communities — this client
  // component is reused across community routes, so state would persist and a
  // once-failed cover would wrongly force the fallback on the next community.
  const [coverError, setCoverError] = useState(false);
  useEffect(() => setCoverError(false), [community.name]);

  const fallbackCover =
    theme === "day" ? "/assets/cover-fallback-day.png" : "/assets/cover-fallback-night.png";
  // Build the src from DEFAULT_IMAGE_SERVER (stable across SSR and client), NOT
  // `defaults.imageServer` (a getter that reads the per-user image_proxy override
  // from localStorage). Otherwise the eager high-priority <img> is fetched once
  // during SSR then re-fetched at a different host after hydration. The
  // /u/<name>/cover endpoint is only served by i.ecency.com anyway.
  const coverSrc =
    community && !coverError
      ? `${DEFAULT_IMAGE_SERVER}/u/${community.name}/cover`
      : fallbackCover;
  const subscribers = useMemo(
    () => formattedNumber(community.subscribers, { fractionDigits: 0 }),
    [community.subscribers]
  );
  const rewards = useMemo(
    () => formattedNumber(community.sum_pending, { fractionDigits: 0 }),
    [community.sum_pending]
  );
  const authors = useMemo(
    () => formattedNumber(community.num_authors, { fractionDigits: 0 }),
    [community.num_authors]
  );
  // Same as the avatar: `useUpdateProfile` signs for the ACTIVE user, so
  // showing this because the community is merely in the saved-accounts list
  // let it overwrite the signed-in user's own cover image.
  const canUpdateCoverImage = useMemo(
    () => activeUser?.username === community.name,
    [activeUser?.username, community.name]
  );

  return (
    <div className="relative overflow-hidden rounded-2xl lg:max-h-[210px]">
      {/* Themed placeholder color shown until the cover paints (and if it fails). */}
      <div className="absolute top-0 left-0 w-full h-full bg-light-300 dark:bg-dark-default" />
      {/* Render the cover as a real <img> (not a CSS background) so the browser's
          preload scanner discovers it in the SSR HTML and fetches it eagerly at
          high priority. This is the community page's LCP element; as a background
          image it was discovered late and painted seconds after load. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        className="absolute top-0 left-0 w-full h-full object-cover object-left-top"
        src={coverSrc}
        alt=""
        fetchPriority="high"
        loading="eager"
        decoding="async"
        onError={() => setCoverError(true)}
      />
      <div className="grid gap-4 md:gap-6 px-4 pb-4 md:px-6 md:pb-6 pt-16 md:pt-24 grid-cols-2 lg:grid-cols-4 w-full relative">
        <CommunityStatItem value={subscribers} label={i18next.t("community.subscribers")} />
        <CommunityStatItem value={"$" + rewards} label={i18next.t("community-cover.rewards")} />
        <CommunityStatItem value={authors} label={i18next.t("community-cover.authors")} />

        {community.lang.trim() !== "" && (
          <CommunityStatItem
            value={community.lang.toUpperCase()}
            label={i18next.t("community-cover.lang")}
          />
        )}
      </div>

      <div className="controls-holder absolute z-10 right-0 top-4 flex gap-2 px-2 md:px-4">
        <SubscriptionBtn community={community} />
        <EcencyConfigManager.Conditional condition={({ visionFeatures }) => visionFeatures.newsletter.enabled}>
          <DigestSubscribeButton
            type="community"
            target={community.name}
            targetLabel={community.title || community.name}
            source="community-page"
          />
        </EcencyConfigManager.Conditional>
        {hasCommunityChannel && (
          <Link href={`/chats/${community.name}/channel`}>
            <Button iconPlacement="left" icon={messageSendSvg}>
              {i18next.t("chat.view-community-channel")}
            </Button>
          </Link>
        )}
        <Link href={`/publish?com=${community.name}`}>
          <Button>{i18next.t("community.post")}</Button>
        </Link>
      </div>
      {canUpdateCoverImage && <CommunityCoverEditImage account={account as FullAccount} />}
    </div>
  );
}
