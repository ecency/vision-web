'use client';

import type { Entry } from '@ecency/sdk';
import { UilComment, UilEdit, UilHeart, UilRedo } from '@tooni/iconscout-unicons-react';
import { useMemo } from 'react';
import { Link } from '@tanstack/react-router';
import { formatRelativeTime, InstanceConfigManager, t } from '@/core';
import { UserAvatar } from '@/features/shared/user-avatar';
import { useAuth } from '@/features/auth/hooks';
import { canEditEntry } from '@/features/publish/utils/can-edit-entry';
import { estimateReadMinutes } from '../utils/read-time';
import { useThemeShowsReadTime } from '@/themes/use-theme-components';
import { TextToSpeechButton } from './text-to-speech-button';

interface Props {
  entry: Entry;
}

export function BlogPostHeader({ entry }: Props) {
  const { user } = useAuth();
  const entryData = entry.original_entry || entry;
  const instanceType = InstanceConfigManager.useConfig(
    ({ configuration }) => configuration.instanceConfiguration.type ?? 'blog',
  );
  const profileBaseUrl = InstanceConfigManager.useConfig(
    ({ configuration }) => configuration.general.profileBaseUrl || 'https://ecency.com/@',
  );
  const isCommunity = instanceType === 'community';

  const likesCount = useMemo(
    () => entryData.active_votes?.length || 0,
    [entryData],
  );

  const commentsCount = entryData.children || 0;
  const reblogsCount = entryData.reblogs || 0;

  const tags = useMemo(() => {
    const rawTags = entryData.json_metadata?.tags;
    if (!Array.isArray(rawTags)) return [];
    return rawTags.filter((tag) => tag !== entryData.community);
  }, [entryData]);

  // Shared estimator plus the theme's opt-in: read time is an editorial
  // choice a minimal design gets to skip, declared in the theme manifest.
  const showsReadTime = useThemeShowsReadTime();
  const readTime = useMemo(
    () => estimateReadMinutes(entryData.body),
    [entryData.body],
  );

  const createdDate = useMemo(
    () => formatRelativeTime(entryData.created),
    [entryData.created],
  );

  return (
    <header className="mb-6 sm:mb-8">
      <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold mb-4 sm:mb-6 break-words heading-theme leading-[1.04]">
        {entryData.title}
      </h1>

      {/* Author byline */}
      <div className="flex items-center gap-3 mb-4 sm:mb-6">
        <a
          href={`${profileBaseUrl}${entryData.author}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-3 hover:opacity-70 transition-opacity"
        >
          <UserAvatar username={entryData.author} size="medium" />
          <div className="flex flex-col">
            <span className={`text-sm font-medium ${isCommunity ? 'text-theme-primary' : 'text-theme-secondary'}`}>
              {entryData.author}
            </span>
            <span className="text-xs text-theme-muted">{createdDate}</span>
          </div>
        </a>
      </div>

      <div className="flex flex-wrap items-center gap-2 sm:gap-3 text-xs sm:text-sm mb-4 sm:mb-6 text-theme-muted font-theme-ui">
        <div className="flex items-center gap-1">
          <UilHeart className="size-4" />
          <span>{likesCount}</span>
        </div>
        <div className="flex items-center gap-1">
          <UilComment className="size-4" />
          <span>{commentsCount}</span>
        </div>
        <div className="flex items-center gap-1">
          <UilRedo className="size-4" />
          <span>{reblogsCount}</span>
        </div>
        {showsReadTime && readTime !== null && (
          <>
            <span>•</span>
            <span>
              {readTime} {t('minRead')}
            </span>
          </>
        )}
        <span className="ml-auto flex items-center gap-2">
          <TextToSpeechButton
            text={entryData.body}
            title={entryData.title}
          />
          {canEditEntry(user?.username, entryData.author) && (
            <Link
              to="/edit/$author/$permlink"
              params={{ author: entryData.author, permlink: entryData.permlink }}
              className="flex items-center gap-1 px-2 py-1 rounded hover:bg-theme-secondary transition-colors text-theme-muted hover:text-theme-primary"
            >
              <UilEdit className="size-4" />
              <span className="text-xs sm:text-sm">{t('edit_post')}</span>
            </Link>
          )}
        </span>
      </div>

      {tags.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {tags.map((tag) => (
            <span
              key={tag}
              className="text-xs sm:text-sm px-2 py-1 tag-theme"
            >
              #{tag}
            </span>
          ))}
        </div>
      )}
    </header>
  );
}
