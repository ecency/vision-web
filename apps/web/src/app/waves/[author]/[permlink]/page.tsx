import { EcencyEntriesCacheManagement } from "@/core/caches";
import { notFound } from "next/navigation";
import { WaveViewDetails, WaveViewDiscussion } from "@/app/waves/[author]/[permlink]/_components";
import { WaveEntry } from "@/entities";
import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import { getQueryClient, prefetchRequired } from "@/core/react-query";
import { cookies } from "next/headers";
import { ACTIVE_USER_COOKIE_NAME } from "@/consts";
import { stripAnonEntryCacheInPlace } from "@/core/react-query/strip-active-votes";
import { EcencyConfigManager } from "@/config";
import { Metadata } from "next";
import { ScrollToTop } from "@/features/shared/scroll-to-top";
import { isWaveFlaggedNsfw } from "@/server/wave-nsfw";

interface Props {
  params: Promise<{
    author: string;
    permlink: string;
  }>;
}

export const metadata: Metadata = {
  title: { absolute: "Waves | Ecency" },
  description: "Micro-blogging in decentralized system of Web 3.0"
};

export default async function WaveViewPage({ params }: Props) {
  const isWavesEnabled = EcencyConfigManager.selector(
    ({ visionFeatures }) => visionFeatures.waves.enabled
  );

  if (!isWavesEnabled) {
    return notFound();
  }

  const { author, permlink } = await params;

  // Waves are depth-1 posts and can carry large voter arrays. Same treatment as
  // the entry route: anonymous-only, cache rewritten in place so the prop and the
  // dehydrated copy remain a single reference.
  const loggedInUser = (await cookies()).get(ACTIVE_USER_COOKIE_NAME)?.value;
  const authorName = author.replace(/%40/g, "");
  // Beside the entry fetch, not after it: the entry comes from the chain and
  // carries no image-check verdict, so a wave opened by its link would render
  // its media uncovered. Resolves to false when the API cannot answer.
  // A missing wave is notFound(); a lookup that failed throws a retryable
  // lookup-unavailable error instead (prefetchRequired).
  const [fetched, nsfwFlagged] = await Promise.all([
    prefetchRequired(
      EcencyEntriesCacheManagement.getEntryQueryByPath(authorName, permlink)
    ) as Promise<WaveEntry>,
    isWaveFlaggedNsfw(authorName, permlink)
  ]);
  const data = stripAnonEntryCacheInPlace(getQueryClient(), fetched, loggedInUser);

  return (
    <HydrationBoundary state={dehydrate(getQueryClient())}>
      <div className="flex flex-col gap-4 lg:gap-6 xl:gap-8">
        <ScrollToTop />
        <WaveViewDetails entry={data} nsfwFlagged={nsfwFlagged} />
        <WaveViewDiscussion entry={data} />
      </div>
    </HydrationBoundary>
  );
}
