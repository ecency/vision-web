import { CommunitySubscribers } from "../_components";
import { getCommunityCache } from "@/core/caches";
import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import { getQueryClient, prefetchRequired } from "@/core/react-query";
import { Metadata, ResolvingMetadata } from "next";
import { generateCommunityMetadata } from "@/app/(dynamicPages)/community/[community]/_helpers";

interface Props {
  params: Promise<{ community: string }>;
}

export async function generateMetadata(props: Props, parent: ResolvingMetadata): Promise<Metadata> {
  const { community } = await props.params;
  return generateCommunityMetadata(community, "subscribers");
}

export default async function SubscribersPage({ params }: Props) {
  const { community } = await params;
  const communityData = await prefetchRequired(getCommunityCache(community));

  return (
    <HydrationBoundary state={dehydrate(getQueryClient())}>
      <CommunitySubscribers community={communityData} />
    </HydrationBoundary>
  );
}
