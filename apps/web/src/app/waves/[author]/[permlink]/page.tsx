import { EcencyEntriesCacheManagement } from "@/core/caches";
import { notFound } from "next/navigation";
import { WaveViewDetails, WaveViewDiscussion } from "@/app/waves/[author]/[permlink]/_components";
import { WaveEntry } from "@/entities";
import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import { getQueryClient, prefetchQuery } from "@/core/react-query";
import { cookies } from "next/headers";
import { ACTIVE_USER_COOKIE_NAME } from "@/consts";
import { stripAnonEntryCacheInPlace } from "@/core/react-query/strip-active-votes";
import { EcencyConfigManager } from "@/config";
import { Metadata } from "next";
import { ScrollToTop } from "@/features/shared/scroll-to-top";

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
  const fetched = (await prefetchQuery(EcencyEntriesCacheManagement.getEntryQueryByPath(
    author.replace(/%40/g, ""),
    permlink
  ))) as WaveEntry;
  const data = stripAnonEntryCacheInPlace(getQueryClient(), fetched, loggedInUser);

  if (!data) {
    return notFound();
  }

  return (
    <HydrationBoundary state={dehydrate(getQueryClient())}>
      <div className="flex flex-col gap-4 lg:gap-6 xl:gap-8">
        <ScrollToTop />
        <WaveViewDetails entry={data} />
        <WaveViewDiscussion entry={data} />
      </div>
    </HydrationBoundary>
  );
}
