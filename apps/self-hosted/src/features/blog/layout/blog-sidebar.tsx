import { formatMonthYear, InstanceConfigManager, t } from "@/core";
import { NewsletterSignup } from "../components/newsletter-signup";
import { useAuth } from "@/features/auth";
import { InlineError } from "@/features/shared/inline-error";
import {
  nothingToShow,
  resolveQueryOutcome,
} from "@/features/shared/query-outcome";
import { UserAvatar } from "@/features/shared/user-avatar";
import { TipButton } from "@/features/tipping";
import {
  getAccountFullQueryOptions,
  getCommunityContextQueryOptions,
} from "@ecency/sdk";
import { useQuery } from "@tanstack/react-query";
import { type ReactNode, useMemo } from "react";
import { CommunityJoinButton } from "../components/community-join-button";
import {
  useCommunityData,
  useInstanceConfig,
} from "../hooks/use-instance-config";
import { isModeratorRole } from "../utils/community-role";
import { resolveReputation } from "../utils/reputation-band";
import { safeWebsiteUrl } from "../utils/safe-website";

const REPUTATION_BAND_LABELS = {
  new: "reputation_band_new",
  established: "reputation_band_established",
  longstanding: "reputation_band_longstanding",
} as const;

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

  const showTippingGeneral = InstanceConfigManager.useConfig(
    ({ configuration }) =>
      configuration.instanceConfiguration.features.tipping?.general?.enabled ?? false
  );

  const joinDate = useMemo(() => {
    if (!data?.created) return null;
    return formatMonthYear(data.created);
  }, [data?.created]);

  // The bare integer means nothing to a reader who has not learned the scale,
  // and a zero is a failed bridge call rather than a new account.
  const reputation = useMemo(
    () => resolveReputation(data?.reputation),
    [data?.reputation],
  );

  // Shared with the About page, so the two surfaces cannot drift on what
  // counts as a linkable website.
  const websiteUrl = useMemo(
    () => safeWebsiteUrl(data?.profile?.website),
    [data?.profile?.website],
  );

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
      {/*
       * Both counts come off the same follow_stats payload this component
       * already fetches, so the second one costs no request. The row collapses
       * in CSS when an owner turns both off, or its bottom margin would leave
       * a gap where the counts used to be.
       */}
      {data?.follow_stats && (
        <div className="flex gap-6 mb-4 sidebar-follow-stats">
          <div className="flex flex-col sidebar-followers-section">
            <div className="text-xs text-theme-muted">{t("subscribers")}</div>
            <div className="text-sm font-medium text-theme-primary">
              {data.follow_stats.follower_count}
            </div>
          </div>
          <div className="flex flex-col sidebar-following-section">
            <div className="text-xs text-theme-muted">{t("following")}</div>
            <div className="text-sm font-medium text-theme-primary">
              {data.follow_stats.following_count}
            </div>
          </div>
        </div>
      )}
      <NewsletterSignup />
      {data && (
        <div className="border-t border-theme pt-4 mt-4 sidebar-hive-info-section">
          <div className="text-xs font-medium mb-2 text-theme-muted">
            {t("hiveInfo")}
          </div>
          {reputation && (
            <div className="text-xs mb-1 text-theme-muted">
              <span className="font-medium">{t("reputation")}:</span>{" "}
              {t(REPUTATION_BAND_LABELS[reputation.band])} ({reputation.score})
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

/** The panel chrome, so every state below sits in the same box. */
function CommunitySidebarShell({ children }: { children: ReactNode }) {
  return (
    <div className="lg:sticky lg:top-0 border-b lg:border-b-0 lg:border-l border-theme p-4 sm:p-6 lg:h-screen lg:overflow-y-auto">
      {children}
    </div>
  );
}

function CommunitySidebar() {
  const {
    data: community,
    isEnabled,
    isError,
    isSuccess,
    refetch,
  } = useCommunityData();
  const { communityId } = useInstanceConfig();
  const { user } = useAuth();

  // num_pending is a moderation queue, not a statistic about the community.
  // The context query is disabled without a username, so a logged-out visitor
  // resolves to no role and sees nothing.
  const { data: context } = useQuery(
    getCommunityContextQueryOptions(user?.username, communityId),
  );
  const isModerator = isModeratorRole(context?.role);

  const proxyBase = InstanceConfigManager.useConfig(
    ({ configuration }) =>
      configuration.general.imageProxy || "https://i.ecency.com",
  );

  // Get the community avatar URL from the image proxy
  const communityAvatarUrl = useMemo(() => {
    if (!community?.name) return null;
    // Community avatars use the same pattern as user avatars
    return `${proxyBase}/u/${community.name}/avatar/medium`;
  }, [community?.name, proxyBase]);

  // Was: `if (!community)` renders "Community not found.", which is what the
  // owner of a running community was shown whenever one bridge call failed.
  // Only a response that came back empty says anything about existence.
  const outcome = resolveQueryOutcome({
    isEnabled,
    isError,
    isSuccess,
    hasContent: !!community,
  });

  if (!community) {
    if (outcome === "failed") {
      return (
        <CommunitySidebarShell>
          <InlineError
            message={t("community_load_failed")}
            onRetry={() => refetch()}
          />
        </CommunitySidebarShell>
      );
    }

    if (nothingToShow(outcome)) {
      return (
        <CommunitySidebarShell>
          <div className="text-sm text-theme-muted">
            {t("community_not_found")}
          </div>
        </CommunitySidebarShell>
      );
    }

    return (
      <CommunitySidebarShell>
        <div className="animate-pulse">
          <div className="size-16 rounded-full bg-theme-tertiary mb-4" />
          <div className="h-4 w-32 bg-theme-tertiary rounded mb-2" />
          <div className="h-3 w-48 bg-theme-tertiary rounded" />
        </div>
      </CommunitySidebarShell>
    );
  }

  return (
    <div className="lg:sticky lg:top-0 border-b lg:border-b-0 lg:border-l border-theme p-4 sm:p-6 lg:h-screen lg:overflow-y-auto -ml-4">
      {/* The panel below is a previous response, still true as far as it goes.
          Saying so is the point: computing the stale outcome and then rendering
          as if nothing had happened reads as handled when it is not. */}
      {outcome === "stale" && (
        <InlineError
          className="mb-4"
          message={t("community_refresh_failed")}
          onRetry={() => refetch()}
        />
      )}
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

      {/*
       * The same two visibility classes the blog sidebar carries, on this
       * tree's counterparts: the Followers toggle governs the subscriber
       * count here exactly as it governs the follower count there, which the
       * blog side also labels "Subscribers". Without them the toggles were
       * inert on every community instance (#1480).
       *
       * The row needs no collapse rule: the author count has no toggle, so it
       * can never empty the way the blog side's two-toggle row can.
       */}
      <div className="flex gap-6 mb-4">
        <div className="flex flex-col sidebar-followers-section">
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

      <div className="mb-4">
        <CommunityJoinButton communityId={communityId} />
      </div>

      <NewsletterSignup />
        <div className="border-t border-theme pt-4 mt-4 sidebar-hive-info-section">
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
        {isModerator && community.num_pending > 0 && (
          <div className="text-xs text-theme-muted">
            <span className="font-medium">{t("pending_posts")}:</span>{" "}
            {community.num_pending}
          </div>
        )}
      </div>

      {/*
       * The team is chain information too, and it is a sibling block rather
       * than part of the one above, so it needs the class in its own right.
       * Without it, an owner who turned Hive Information off kept the
       * moderator list: a toggle that half works, which is the same defect as
       * one that does nothing.
       */}
      {community.team && community.team.length > 0 && (
        <div className="border-t border-theme pt-4 mt-4 sidebar-hive-info-section">
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
