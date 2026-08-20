'use client';

import { getAccountFullQueryOptions } from '@ecency/sdk';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
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

  if (outcome === 'failed') {
    return <ErrorMessage onRetry={() => refetch()} />;
  }
  if (nothingToShow(outcome) || !data) {
    return (
      <div className="text-center py-12 text-theme-muted">{t('loading')}</div>
    );
  }

  return (
    <article className="max-w-3xl mx-auto">
      {coverUrl && (
        <img
          src={coverUrl}
          alt=""
          aria-hidden="true"
          className="w-full h-40 sm:h-56 object-cover rounded-lg mb-6"
        />
      )}
      <div className="flex items-center gap-4 mb-6">
        <UserAvatar username={username} size="sLarge" />
        <div>
          <h1 className="heading-theme text-2xl sm:text-3xl">
            {data.name || username}
          </h1>
          <p className="text-sm text-theme-muted font-theme-ui">@{username}</p>
        </div>
      </div>

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
    </article>
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
    return <ErrorMessage onRetry={() => refetch()} />;
  }
  if (nothingToShow(outcome) || !community) {
    return (
      <div className="text-center py-12 text-theme-muted">{t('loading')}</div>
    );
  }

  const avatarUrl = community.name
    ? `${proxyBase}/u/${community.name}/avatar/medium`
    : null;

  return (
    <article className="max-w-3xl mx-auto">
      <div className="flex items-center gap-4 mb-6">
        {avatarUrl && (
          <img
            src={avatarUrl}
            alt=""
            aria-hidden="true"
            className="size-14 rounded-full object-cover"
          />
        )}
        <div>
          <h1 className="heading-theme text-2xl sm:text-3xl">
            {community.title || communityId}
          </h1>
          <p className="text-sm text-theme-muted font-theme-ui">
            {community.name}
          </p>
        </div>
      </div>

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
    </article>
  );
}
