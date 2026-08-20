'use client';

import { getAccountFullQueryOptions } from '@ecency/sdk';
import { useQuery } from '@tanstack/react-query';
import { type ReactNode, useMemo } from 'react';
import { formatMonthYear, InstanceConfigManager, t } from '@/core';
import { UserAvatar } from '@/features/shared';
import { ErrorMessage } from '@/features/shared/error-message';
import {
  nothingToShow,
  resolveQueryOutcome,
} from '@/features/shared/query-outcome';
import { useDocumentMeta } from '@/utils/use-document-meta';
import {
  useCommunityData,
  useInstanceConfig,
} from '../hooks/use-instance-config';
import { safeWebsiteUrl } from '../utils/safe-website';
import { NewsletterSignup } from './newsletter-signup';

/**
 * The About surface, generated from what already exists on chain: a blog
 * instance renders the showcased account's profile metadata (about text,
 * location, website, cover image), a community instance its community's
 * title and description. No configuration is required for the page to say
 * something true; a config override can come later together with static
 * pages.
 */
export function AboutPage() {
  useDocumentMeta({ title: t('about_title') });
  const { isCommunityMode } = useInstanceConfig();
  return (
    <>
      {isCommunityMode ? <CommunityAbout /> : <BlogAbout />}
      {/* Outside the variant on purpose (vision-web#1551): both of them return
          early while their account or community query is loading or has failed,
          and the signup depends on neither. This is the one surface every
          template has, so it is where the four sidebar-less templates offer the
          digest at all. */}
      <NewsletterSignup placement="page" />
    </>
  );
}

/**
 * The page frame, and the heading it always has. The identity is known from
 * config before any query resolves, so a loading or failed About page is still
 * a titled page rather than a bare line of text.
 *
 * That matters beyond tidiness: without it the first heading on the page is
 * whatever renders next, which for the newsletter section below is an h2. Three
 * of the four shells carry a masthead h1 of their own (DefaultShell through
 * BlogNavigation, journal and terminal directly), but the reader shell renders
 * its title in a span, so on that template the document would have started at
 * h2 for as long as the query was loading or failed.
 */
function AboutFrame({
  title,
  handle,
  avatar,
  cover,
  children,
}: {
  title: string;
  handle?: string;
  avatar?: ReactNode;
  cover?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <article className="max-w-3xl mx-auto">
      {cover}
      <div className="flex items-center gap-4 mb-6">
        {avatar}
        <div>
          <h1 className="heading-theme text-2xl sm:text-3xl">{title}</h1>
          {handle && (
            <p className="text-sm text-theme-muted font-theme-ui">{handle}</p>
          )}
        </div>
      </div>
      {children}
    </article>
  );
}

function BlogAbout() {
  const { username } = useInstanceConfig();
  const proxyBase = InstanceConfigManager.useConfig(
    ({ configuration }) =>
      configuration.general.imageProxy || 'https://i.ecency.com',
  );

  const {
    data,
    isEnabled,
    isError,
    isSuccess,
    refetch,
  } = useQuery({
    ...getAccountFullQueryOptions(username),
    enabled: !!username,
  });

  const profile = data?.profile;

  // The cover is authored on-chain and untrusted: it only ever renders
  // through the image proxy, which also right-sizes it.
  const coverUrl = useMemo(() => {
    const raw = profile?.cover_image;
    if (typeof raw !== 'string' || !/^https?:\/\//i.test(raw)) return null;
    return `${proxyBase}/1600x400/${raw}`;
  }, [profile?.cover_image, proxyBase]);

  const websiteUrl = useMemo(
    () => safeWebsiteUrl(profile?.website),
    [profile?.website],
  );

  const joined = useMemo(
    () => (data?.created ? formatMonthYear(data.created) : null),
    [data?.created],
  );

  const outcome = resolveQueryOutcome({
    isEnabled,
    isError,
    isSuccess,
    hasContent: !!data,
  });

  // The handle and the avatar come from config, not from the request, so the
  // page is recognisable in every outcome.
  const identity = {
    handle: `@${username}`,
    avatar: <UserAvatar username={username} size="sLarge" />,
  };

  if (outcome === 'failed') {
    return (
      <AboutFrame title={username} {...identity}>
        <ErrorMessage onRetry={() => refetch()} />
      </AboutFrame>
    );
  }
  if (nothingToShow(outcome) || !data) {
    return (
      <AboutFrame title={username} {...identity}>
        <div className="text-center py-12 text-theme-muted">{t('loading')}</div>
      </AboutFrame>
    );
  }

  return (
    <AboutFrame
      title={data.name || username}
      {...identity}
      cover={
        coverUrl && (
          <img
            src={coverUrl}
            alt=""
            aria-hidden="true"
            className="w-full h-40 sm:h-56 object-cover rounded-lg mb-6"
          />
        )
      }
    >

      {profile?.about && (
        <p className="text-theme-secondary leading-relaxed mb-6">
          {profile.about}
        </p>
      )}

      <dl className="text-sm text-theme-muted font-theme-ui flex flex-col gap-1.5">
        {profile?.location && (
          <div>
            <dt className="inline font-medium">{t('location')}: </dt>
            <dd className="inline">{profile.location}</dd>
          </div>
        )}
        {websiteUrl && (
          <div>
            <dt className="inline font-medium">{t('website')}: </dt>
            <dd className="inline">
              <a
                href={websiteUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="underline text-theme-accent"
              >
                {profile?.website}
              </a>
            </dd>
          </div>
        )}
        {joined && (
          <div>
            <dt className="inline font-medium">{t('joined')}: </dt>
            <dd className="inline">{joined}</dd>
          </div>
        )}
      </dl>
    </AboutFrame>
  );
}

function CommunityAbout() {
  const { data: community, isEnabled, isError, isSuccess, refetch } =
    useCommunityData();
  const { communityId } = useInstanceConfig();
  const proxyBase = InstanceConfigManager.useConfig(
    ({ configuration }) =>
      configuration.general.imageProxy || 'https://i.ecency.com',
  );

  const outcome = resolveQueryOutcome({
    isEnabled,
    isError,
    isSuccess,
    hasContent: !!community,
  });

  if (outcome === 'failed') {
    return (
      <AboutFrame title={communityId}>
        <ErrorMessage onRetry={() => refetch()} />
      </AboutFrame>
    );
  }
  if (nothingToShow(outcome) || !community) {
    return (
      <AboutFrame title={communityId}>
        <div className="text-center py-12 text-theme-muted">{t('loading')}</div>
      </AboutFrame>
    );
  }

  const avatarUrl = community.name
    ? `${proxyBase}/u/${community.name}/avatar/medium`
    : null;

  return (
    <AboutFrame
      title={community.title || communityId}
      handle={community.name}
      avatar={
        avatarUrl && (
          <img
            src={avatarUrl}
            alt=""
            aria-hidden="true"
            className="size-14 rounded-full object-cover"
          />
        )
      }
    >

      {community.about && (
        <p className="text-theme-secondary leading-relaxed mb-6">
          {community.about}
        </p>
      )}
      {community.description && (
        <div className="text-theme-secondary leading-relaxed whitespace-pre-line">
          {community.description}
        </div>
      )}
    </AboutFrame>
  );
}
