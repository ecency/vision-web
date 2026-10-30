import { CommunityActivities } from "../_components";
import { getCommunityCache } from "@/core/caches";
import { getQueryClient, prefetchRequired } from "@/core/react-query";
import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import { Metadata, ResolvingMetadata } from "next";
import { generateCommunityMetadata } from "@/app/(dynamicPages)/community/[community]/_helpers";

interface Props {
  params: Promise<{ community: string }>;
}

export async function generateMetadata(props: Props, parent: ResolvingMetadata): Promise<Metadata> {
  const { community } = await props.params;
  return generateCommunityMetadata(community, "activities");
}

export default async function ActivitiesPage({ params }: Props) {
  const { community } = await params;
  const communityData = await prefetchRequired(getCommunityCache(community));

  return (
    <HydrationBoundary state={dehydrate(getQueryClient())}>
      <CommunityActivities community={communityData} />
    </HydrationBoundary>
  );
}
