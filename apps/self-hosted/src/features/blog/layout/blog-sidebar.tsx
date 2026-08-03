import { formatMonthYear, InstanceConfigManager, t } from "@/core";
import { UserAvatar } from "@/features/shared/user-avatar";
import { TipButton } from "@/features/tipping";
import { getAccountFullQueryOptions } from "@ecency/sdk";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import {
  useCommunityData,
  useInstanceConfig,
} from "../hooks/use-instance-config";

export function BlogSidebar() {
  const { username, isCommunityMode } = useInstanceConfig();

  if (isCommunityMode) {
    return <CommunitySidebar />;
  }

  return <BlogSidebarContent username={username} />;
}

function BlogSidebarContent({ username }: { username: string }) {
  const { data } = useQuery({
    ...getAccountFullQueryOptions(username),
    enabled: !!username,
  });

  const showTippingGeneral = InstanceConfigManager.getConfigValue(
    ({ configuration }) =>
      configuration.instanceConfiguration.features.tipping?.general?.enabled ?? false
  );

  const joinDate = useMemo(() => {
    if (!data?.created) return null;
    return formatMonthYear(data.created);
  }, [data?.created]);

  const websiteUrl = useMemo(() => {
    const raw = data?.profile?.website;
    if (!raw) return null;
    const url =
      raw.startsWith("http://") || raw.startsWith("https://")
        ? raw
        : `https://${raw}`;
    try {
      new URL(url);
      return url;
    } catch {
      return null;
    }
  }, [data?.profile?.website]);

  return (
    <div className="lg:sticky lg:top-0 border-b lg:border-b-0 lg:border-l border-theme p-4 sm:p-6 lg:h-screen lg:overflow-y-auto">
      <div className="flex items-center gap-3 mb-4">
        <UserAvatar username={username} size="sLarge" />
        <div className="text-sm sm:text-base font-bold font-theme-ui text-theme-primary">
          {data?.name || username}
        </div>
      </div>
      {data?.profile?.about && (
        <div className="text-sm mb-4 text-theme-muted leading-[1.58]">
          {data.profile.about}
        </div>
      )}
      {data?.follow_stats && (
        <div className="flex gap-6 mb-4">
          <div className="flex flex-col sidebar-followers-section">
            <div className="text-xs text-theme-muted">{t("subscribers")}</div>
            <div className="text-sm font-medium text-theme-primary">
              {data.follow_stats.follower_count}
            </div>
          </div>
        </div>
      )}
      {data && (
        <div className="border-t border-theme pt-4 mt-4 sidebar-hive-info-section">
          <div className="text-xs font-medium mb-2 text-theme-muted">
            {t("hiveInfo")}
          </div>
          {data.reputation !== undefined && (
            <div className="text-xs mb-1 text-theme-muted">
              <span className="font-medium">{t("reputation")}:</span>{" "}
              {Math.floor(data.reputation)}
            </div>
          )}
          {joinDate && (
            <div className="text-xs mb-1 text-theme-muted">
              <span className="font-medium">{t("joined")}:</span> {joinDate}
            </div>
          )}
          {data.post_count !== undefined && (
            <div className="text-xs text-theme-muted">
              <span className="font-medium">{t("posts")}:</span>{" "}
              {data.post_count}
            </div>
          )}
        </div>
      )}
      {showTippingGeneral && (
        <div className="border-t border-theme pt-4 mt-4">
          <TipButton
            recipientUsername={username}
            variant="general"
            className="w-full flex items-center justify-center gap-2 py-2 rounded-md border border-theme bg-theme-primary text-theme-primary hover:bg-theme-tertiary text-sm"
          />
        </div>
      )}
      {data?.profile?.location && (
        <div className="text-xs mb-2 mt-4 text-theme-muted">
          <span className="font-medium">{t("location")}:</span>{" "}
          {data.profile.location}
        </div>
      )}
      {websiteUrl && (
        <div className="text-xs text-theme-muted">
          <span className="font-medium">{t("website")}:</span>{" "}
          <a
            href={websiteUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="underline text-theme-accent"
          >
            {data?.profile?.website}
          </a>
        </div>
      )}
    </div>
  );
}

function CommunitySidebar() {
  const { data: community, isLoading } = useCommunityData();

  // Get the community avatar URL from the image proxy
  const communityAvatarUrl = useMemo(() => {
    if (!community?.name) return null;
    const proxyBase = InstanceConfigManager.getConfigValue(
      ({ configuration }) =>
        configuration.general.imageProxy || "https://i.ecency.com",
    );
    // Community avatars use the same pattern as user avatars
    return `${proxyBase}/u/${community.name}/avatar/medium`;
  }, [community?.name]);

  if (isLoading) {
    return (
      <div className="lg:sticky lg:top-0 border-b lg:border-b-0 lg:border-l border-theme p-4 sm:p-6 lg:h-screen lg:overflow-y-auto">
        <div className="animate-pulse">
          <div className="size-16 rounded-full bg-theme-tertiary mb-4" />
          <div className="h-4 w-32 bg-theme-tertiary rounded mb-2" />
          <div className="h-3 w-48 bg-theme-tertiary rounded" />
        </div>
      </div>
    );
  }

  if (!community) {
    return (
      <div className="lg:sticky lg:top-0 border-b lg:border-b-0 lg:border-l border-theme p-4 sm:p-6 lg:h-screen lg:overflow-y-auto">
        <div className="text-sm text-theme-muted">
          {t("community_not_found")}
        </div>
      </div>
    );
  }

  return (
    <div className="lg:sticky lg:top-0 border-b lg:border-b-0 lg:border-l border-theme p-4 sm:p-6 lg:h-screen lg:overflow-y-auto -ml-4">
      <div className="flex items-center gap-3 mb-4">
        {communityAvatarUrl ? (
          <img
            src={communityAvatarUrl}
            alt={community.title}
            className="size-12 sm:size-16 rounded-full object-cover"
          />
        ) : (
          <div className="size-12 sm:size-16 rounded-full bg-theme-tertiary flex items-center justify-center">
            <span className="text-xl font-bold text-theme-muted">
              {community.title?.charAt(0) || "C"}
            </span>
          </div>
        )}
        <div>
          <div className="text-sm sm:text-base font-bold font-theme-ui text-theme-primary">
            {community.title}
          </div>
          <div className="text-xs text-theme-muted">{community.name}</div>
        </div>
      </div>

      {community.about && (
        <div className="text-sm mb-4 text-theme-muted leading-[1.58]">
          {community.about}
        </div>
      )}

      {community.description && community.description !== community.about && (
        <div className="text-xs mb-4 text-theme-muted leading-relaxed">
          {community.description}
        </div>
      )}

      <div className="flex gap-6 mb-4">
        <div className="flex flex-col">
          <div className="text-xs text-theme-muted">{t("subscribers")}</div>
          <div className="text-sm font-medium text-theme-primary">
            {community.subscribers?.toLocaleString() || 0}
          </div>
        </div>
        <div className="flex flex-col">
          <div className="text-xs text-theme-muted">{t("authors")}</div>
          <div className="text-sm font-medium text-theme-primary">
            {community.num_authors?.toLocaleString() || 0}
          </div>
        </div>
      </div>

      <div className="border-t border-theme pt-4 mt-4">
        <div className="text-xs font-medium mb-2 text-theme-muted">
          {t("community_info")}
        </div>
        {community.created_at && (
          <div className="text-xs mb-1 text-theme-muted">
            <span className="font-medium">{t("created")}:</span>{" "}
            {formatMonthYear(community.created_at)}
          </div>
        )}
        {community.lang && (
          <div className="text-xs mb-1 text-theme-muted">
            <span className="font-medium">{t("language")}:</span>{" "}
            {community.lang.toUpperCase()}
          </div>
        )}
        {community.num_pending > 0 && (
          <div className="text-xs text-theme-muted">
            <span className="font-medium">{t("pending_posts")}:</span>{" "}
            {community.num_pending}
          </div>
        )}
      </div>

      {community.team && community.team.length > 0 && (
        <div className="border-t border-theme pt-4 mt-4">
          <div className="text-xs font-medium mb-2 text-theme-muted">
            {t("team")}
          </div>
          <div className="space-y-2">
            {community.team.slice(0, 5).map((member) => (
              <div key={member[0]} className="flex items-center gap-2">
                <UserAvatar username={member[0]} size="small" />
                <div className="text-xs">
                  <span className="text-theme-primary">{member[0]}</span>
                  <span className="text-theme-muted ml-1">({member[1]})</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
