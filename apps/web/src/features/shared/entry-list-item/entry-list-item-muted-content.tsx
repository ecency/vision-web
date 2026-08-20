"use client";

import i18next from "i18next";
import React, { useEffect, useMemo, useState } from "react";
import { Entry } from "@/entities";
import { EntryListItemThumbnail } from "@/features/shared/entry-list-item/entry-list-item-thumbnail";
import { EntryLink } from "@/features/shared";
import { postBodySummary } from "@ecency/render-helper";
import { useGlobalStore } from "@/core/global-store";
import { EcencyClientServerBridge } from "@/core/client-server-bridge";
import { EntryListItemContext } from "@/features/shared/entry-list-item/entry-list-item-context";
import { ContentModerationReason } from "@ecency/sdk";
import { getEntryModerationReason } from "@/core/entries/entry-moderation";
import Link from "next/link";
import { UilMapPinAlt } from "@tooni/iconscout-unicons-react";
import { useEntryLocation } from "@/utils";

interface Props {
  entry: Entry;
  isThumbLcp?: boolean;
}

export function EntryListItemMutedContent({ entry: entryProp, isThumbLcp }: Props) {
  const globalNsfw = useGlobalStore((s) => s.nsfw);
  const { showNsfw } = EcencyClientServerBridge.useSafeContext(EntryListItemContext);

  const location = useEntryLocation(entryProp);

  const entry = useMemo(() => entryProp.original_entry || entryProp, [entryProp]);
  const isCrossPost = useMemo(() => !!entry.original_entry, [entry.original_entry]);

  // Which rule fired (moderator action, downvotes, low-trust promo) is decided in
  // the SDK, so the mobile app flags the very same posts for the very same reason.
  const moderationReason = useMemo(() => getEntryModerationReason(entry), [entry]);

  const nsfw = useMemo(
    () =>
      entry.json_metadata &&
      entry.json_metadata.tags &&
      Array.isArray(entry.json_metadata.tags) &&
      entry.json_metadata.tags.includes("nsfw"),
    [entry]
  );

  const [isRevealed, setIsRevealed] = useState(false);

  // A recycled card (same component, different post) must come back dimmed.
  useEffect(() => {
    setIsRevealed(false);
  }, [entry.author, entry.permlink, moderationReason]);

  if (nsfw && !showNsfw && !globalNsfw) {
    return <></>;
  }

  const shouldShowMutedOverlay = !!moderationReason && !isRevealed;

  const mutedMessage = !moderationReason
    ? ""
    : moderationReason === ContentModerationReason.MOD_MUTED
      ? i18next.t("g.modmuted-message")
      : moderationReason === ContentModerationReason.DOWNVOTED
        ? i18next.t("g.hidden-message")
        : i18next.t("g.lowtrust-message");

  const handleReveal = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsRevealed(true);
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
