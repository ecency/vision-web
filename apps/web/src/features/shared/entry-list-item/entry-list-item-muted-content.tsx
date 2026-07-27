"use client";

import { useActiveAccount } from "@/core/hooks/use-active-account";

import i18next from "i18next";
import React, { useEffect, useMemo, useState } from "react";
import { Entry } from "@/entities";
import { EntryListItemThumbnail } from "@/features/shared/entry-list-item/entry-list-item-thumbnail";
import { EntryLink } from "@/features/shared";
import { postBodySummary } from "@ecency/render-helper";
import { useGlobalStore } from "@/core/global-store";
import { EcencyClientServerBridge } from "@/core/client-server-bridge";
import { EntryListItemContext } from "@/features/shared/entry-list-item/entry-list-item-context";
import { getMutedUsersQueryOptions } from "@ecency/sdk";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { UilMapPinAlt } from "@tooni/iconscout-unicons-react";
import { isHiddenPost, useEntryLocation } from "@/utils";
import { isLowTrustSeoPost } from "@/utils/is-low-trust-author";

interface Props {
  entry: Entry;
  isThumbLcp?: boolean;
}

export function EntryListItemMutedContent({ entry: entryProp, isThumbLcp }: Props) {
  const { activeUser } = useActiveAccount();
  const globalNsfw = useGlobalStore((s) => s.nsfw);
  const { showNsfw } = EcencyClientServerBridge.useSafeContext(EntryListItemContext);

  const { data: mutedUsers } = useQuery(getMutedUsersQueryOptions(activeUser?.username));

  const location = useEntryLocation(entryProp);

  const isPostMuted = useMemo(
    () => (activeUser && mutedUsers?.includes(entryProp.author)) ?? false,
    [activeUser, entryProp.author, mutedUsers]
  );
  const entry = useMemo(() => entryProp.original_entry || entryProp, [entryProp]);
  const isCrossPost = useMemo(() => !!entry.original_entry, [entry.original_entry]);
  const isModMuted = useMemo(() => entry.stats?.gray ?? false, [entry.stats?.gray]);
  const isHidden = useMemo(
    () => isHiddenPost(entry.net_rshares, entry.stats?.total_votes ?? entry.active_votes?.length ?? 0),
    [entry.net_rshares, entry.stats?.total_votes, entry.active_votes?.length]
  );
  const nsfw = useMemo(
    () =>
      entry.json_metadata &&
      entry.json_metadata.tags &&
      Array.isArray(entry.json_metadata.tags) &&
      entry.json_metadata.tags.includes("nsfw"),
    [entry]
  );
  // SEO/backlink-farm signal: low-reputation account + an outbound promo link.
  const isLowTrust = useMemo(() => isLowTrustSeoPost(entry), [entry]);

  const [showMuted, setShowMuted] = useState(isPostMuted);
  const [showModMuted, setShowModMuted] = useState(isModMuted);
  const [showHidden, setShowHidden] = useState(isHidden);
  const [showLowTrust, setShowLowTrust] = useState(isLowTrust);

  useEffect(() => {
    setShowMuted(false);
  }, [activeUser]);

  useEffect(() => {
    setShowMuted(isPostMuted);
  }, [isPostMuted]);

  useEffect(() => {
    setShowModMuted(isModMuted);
  }, [isModMuted]);

  useEffect(() => {
    setShowHidden(isHidden);
  }, [isHidden]);

  useEffect(() => {
    setShowLowTrust(isLowTrust);
  }, [isLowTrust]);

  if (nsfw && !showNsfw && !globalNsfw) {
    return <></>;
  }

  const shouldShowMutedOverlay = showModMuted || showHidden || showMuted || showLowTrust;

  const mutedMessage = !shouldShowMutedOverlay
    ? ""
    : showModMuted
      ? i18next.t("g.modmuted-message")
      : showHidden
        ? i18next.t("g.hidden-message")
        : showMuted
          ? i18next.t("g.muted-message")
          : i18next.t("g.lowtrust-message");

  const handleReveal = (e: React.MouseEvent) => {
    e.preventDefault();
    if (showModMuted) setShowModMuted(false);
    if (showHidden) setShowHidden(false);
    if (showMuted) setShowMuted(false);
    if (showLowTrust) setShowLowTrust(false);
  };

  return (
    <>
      {shouldShowMutedOverlay && (
        <div className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-400 mb-1.5">
          <span className="inline-block size-3.5 rounded-full bg-orange-400/20 text-orange-500 dark:bg-orange-500/20 dark:text-orange-400 text-center leading-[14px] font-bold text-[10px]">
            !
          </span>
          <a href="#" className="hover:underline" onClick={handleReveal}>
            {mutedMessage}
          </a>
        </div>
      )}
      <div className={shouldShowMutedOverlay ? "opacity-50" : ""}>
        {(!nsfw || showNsfw || globalNsfw) && (
          <EntryListItemThumbnail
            entryProp={entryProp}
            isCrossPost={isCrossPost}
            noImage="/assets/noimage.png"
            entry={entry}
            isThumbLcp={isThumbLcp}
          />
        )}
        <div className="item-summary overflow-x-hidden">
          <EntryLink entry={isCrossPost ? entryProp : entry}>
            <div className="item-title !mb-0">{entry.title}</div>
          </EntryLink>
          {location?.coordinates && (
            <Link
              href={`https://maps.google.com/?q=${location.coordinates.lat},${location.coordinates.lng}`}
              target="_external"
              rel="noopener"
              className="text-sm"
            >
              <UilMapPinAlt className="size-4 mr-1" />
              {location.address}
            </Link>
          )}
          <EntryLink entry={isCrossPost ? entryProp : entry}>
            <div className="item-body">
              {entry.json_metadata?.description || postBodySummary(entry, 200)}
            </div>
          </EntryLink>
        </div>
      </div>
    </>
  );
}
