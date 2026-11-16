"use client";

import { useActiveAccount } from "@/core/hooks/use-active-account";
import { CommentEngagement } from "@/app/(dynamicPages)/entry/[category]/[author]/[permlink]/_components/comment-engagement";
import { EcencyConfigManager } from "@/config";
import { EcencyEntriesCacheManagement, getCommunityCache } from "@/core/caches";
import { Entry, Community } from "@/entities";
import { Discussion } from "@/features/shared/discussion";
import { useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { isCommunity } from "@/utils";
import { useQuery } from "@tanstack/react-query";

// The reply composer (markdown editor toolbar, emoji/GIF pickers, textarea
// autocomplete, polls/video upload) only renders for logged-in users via the
// `activeUser &&` gate below. Load it lazily so the SSR'd post page doesn't ship
// the composer to logged-out readers and crawlers.
const EntryReplySection = dynamic(
  () => import("./entry-reply-section").then((m) => ({ default: m.EntryReplySection })),
  { ssr: false }
);

interface Props {
  entry: Entry;
  category: string;
}

// simple runtime type guards
function isEntry(x: unknown): x is Entry {
  return !!x && typeof x === "object" && "author" in (x as any) && "permlink" in (x as any);
}
function isCommunityEntity(x: unknown): x is Community {
  return !!x && typeof x === "object" && "name" in (x as any);
}

export function EntryPageDiscussions({ entry: initialEntry, category }: Props) {
  const params = useSearchParams();
  const { activeUser } = useActiveAccount();

  const { data: entryRaw } =
      useQuery(EcencyEntriesCacheManagement.getEntryQuery(initialEntry));

  const communityCategory = useMemo(() => {
    if (isCommunity(category)) {
      return category;
    }
    if (isCommunity(initialEntry.category)) {
      return initialEntry.category;
    }
    return undefined;
  }, [category, initialEntry.category]);

  const { data: communityRaw } = useQuery(getCommunityCache(communityCategory));

  // ✅ pick a guaranteed Entry (cache hit or the initial one)
  const entry: Entry = isEntry(entryRaw) ? entryRaw : initialEntry;

  // ✅ only render Discussion once we have a proper Community
  const community = isCommunityEntity(communityRaw) ? communityRaw : null;

  const isRawContent = useMemo(
      () =>
          EcencyConfigManager.CONFIG.visionFeatures.entries.rawContent.enabled &&
          !!params?.get("raw"),
      [params]
  );
  const [hasComments, setHasComments] = useState(initialEntry.children > 0);

  return (
      <div className="reading-surface border border-[--border-color] rounded-xl p-2 md:p-3">
        {activeUser && <EntryReplySection key={`${entry.author}/${entry.permlink}`} entry={entry} />}

        {activeUser && !hasComments && <CommentEngagement />}

        <Discussion
            parent={entry}
            community={community}
            hideControls={false}
            isRawContent={isRawContent}
            onTopLevelCommentsChange={setHasComments}
        />
      </div>
  );
}

export default EntryPageDiscussions;
