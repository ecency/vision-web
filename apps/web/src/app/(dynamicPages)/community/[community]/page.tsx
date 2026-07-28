import { getCommunityCache } from "@/core/caches";
import { notFound } from "next/navigation";
import { prefetchGetPostsFeedQuery } from "@/api/queries";
import { EntryListContent } from "@/features/shared/entry-list-content";
import { LinearProgress } from "@/features/shared/linear-progress";
import { CommunityContentSearch } from "@/app/(dynamicPages)/community/[community]/_components/community-content-search";
import { ProfileEntriesLayout } from "@/app/(dynamicPages)/profile/[username]/_components/profile-entries-layout";
import { Entry } from "@/entities";
import { CommunityContentInfiniteList } from "@/app/(dynamicPages)/community/[community]/_components/community-content-infinite-list";
import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import { getQueryClient, prefetchQuery } from "@/core/react-query";
import { cookies } from "next/headers";
import { ACTIVE_USER_COOKIE_NAME } from "@/consts";
import { stripAnonEntryCacheInPlace } from "@/core/react-query/strip-active-votes";
import { Metadata, ResolvingMetadata } from "next";
import { generateCommunityMetadata } from "@/app/(dynamicPages)/community/[community]/_helpers";

interface Props {
  params: Promise<{ community: string }>;
}

// NOTE: this is INERT, and was already inert before this route read cookies.
// The ROOT LAYOUT awaits cookies() (theme) and headers() (x-pathname), which opts
// every route in the app into request-time rendering. Verified against the
// deployed production build: prerender-manifest.json lists 0 ISR dynamicRoutes
// and only 5 prerendered entries, all static files — no page route is in the
// Full Route Cache, this one included.
//
// So the anonymous vote strip below costs no ISR here; there is none to lose.
// Making these routes statically renderable is a separate, larger change that
// starts with the root layout, not with this file.
//
// Anonymous HTML is cached at the edge and in the origin SSR cache instead, via
// the Cache-Control tier middleware assigns by pathname.
export const revalidate = 300;

export async function generateMetadata(props: Props, parent: ResolvingMetadata): Promise<Metadata> {
  const params = await props.params;
  return generateCommunityMetadata(params.community, "created");
}

export default async function CommunityPostsPage({ params }: Props) {
  const { community } = await params;
  // See the [tag] route: anonymous renders drop active_votes, and the cache is
  // rewritten in place so the dehydrated copy and the entries prop share one
  // reference.
  const loggedInUser = (await cookies()).get(ACTIVE_USER_COOKIE_NAME)?.value;
  const communityData = await prefetchQuery(getCommunityCache(community));
  if (!communityData) {
    return notFound();
  }

  const fetched = await prefetchGetPostsFeedQuery("created", community);
  if (!fetched || !fetched.pages || fetched.pages.length === 0) {
    return <></>;
  }
  const data = stripAnonEntryCacheInPlace(getQueryClient(), fetched, loggedInUser);

  return (
    <HydrationBoundary state={dehydrate(getQueryClient())}>
      {data.pages.length === 0 ? <LinearProgress /> : ""}

      {["hot", "created", "trending"].includes("created") && data.pages.length > 0 && (
        <div className="searchProfile">
          <CommunityContentSearch community={communityData} filter="created" />
        </div>
      )}

      <ProfileEntriesLayout section="created" username={community}>
        <EntryListContent
          username={community}
          isPromoted={false}
          entries={data.pages.reduce<Entry[]>((acc, page) => [...acc, ...(page as Entry[])], [])}
          loading={false}
          sectionParam="created"
        />
        <CommunityContentInfiniteList community={communityData} section="created" />
      </ProfileEntriesLayout>
    </HydrationBoundary>
  );
}
