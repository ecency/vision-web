'use client';

import type { Entry } from '@ecency/sdk';
import { UilComment } from '@tooni/iconscout-unicons-react';
import { useMemo } from 'react';
import { InstanceConfigManager, t } from '@/core';
import { useIsAuthEnabled, VoteButton, ReblogButton } from '@/features/auth';
import { VoteDisclosure } from '@/features/shared/hive-disclosure';
import { TipButton } from '@/features/tipping';
import { useHiveLayer } from '../hooks/use-hive-layer';
import { HivePostNote } from './hive-post-note';
import { PostPayout } from './post-payout';

interface Props {
  entry: Entry;
}

export function BlogPostFooter({ entry }: Props) {
  const entryData = entry.original_entry || entry;
  const hiveLayer = useHiveLayer();
  const isAuthEnabled = useIsAuthEnabled();

  const showLikes = InstanceConfigManager.useConfig(
    ({ configuration }) =>
      configuration.instanceConfiguration.features.likes?.enabled ?? true,
  );
  const showComments = InstanceConfigManager.useConfig(
    ({ configuration }) =>
      configuration.instanceConfiguration.features.comments?.enabled ?? true,
  );
  const showTippingPost = InstanceConfigManager.useConfig(
    ({ configuration }) =>
      configuration.instanceConfiguration.features.tipping?.post?.enabled ?? false,
  );

  const commentsCount = entryData.children || 0;
  const reblogsCount = entryData.reblogs || 0;

  const tags = useMemo(() => {
    const rawTags = entryData.json_metadata?.tags;
    if (!Array.isArray(rawTags)) return [];
    return rawTags.filter((tag) => tag !== entryData.community);
  }, [entryData]);

  return (
    <footer className="mb-6 sm:mb-8 pt-6 sm:pt-8 border-t border-theme">
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-4 sm:mb-6">
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

      <div className="flex flex-wrap items-center gap-4 sm:gap-6 text-xs sm:text-sm text-theme-muted font-theme-ui">
        {showLikes && (
          <VoteButton
            author={entryData.author}
            permlink={entryData.permlink}
            activeVotes={entryData.active_votes || []}
          />
        )}
        {showComments && (
          <div className="flex items-center gap-1">
            <UilComment className="size-4" />
            <span>
              {commentsCount} {t('comments')}
            </span>
          </div>
        )}
        <ReblogButton
          author={entryData.author}
          permlink={entryData.permlink}
          reblogCount={reblogsCount}
        />
        {showTippingPost && (
          <TipButton
            recipientUsername={entryData.author}
            variant="post"
            memo={`tip for @${entryData.author}/${entryData.permlink}`}
            className="flex items-center gap-1"
          />
        )}
        {hiveLayer.showPayoutOnPost && (
          <PostPayout entry={entryData} label={hiveLayer.payoutLabel} />
        )}
      </div>

      {/*
        Not configurable, by design. The gate is only whether a reader can vote
        at all, which features.likes and features.auth already decide.
      */}
      {showLikes && isAuthEnabled && (
        <div className="mt-2">
          <VoteDisclosure />
        </div>
      )}

      <HivePostNote
        author={entryData.author}
        permlink={entryData.permlink}
        showNote={hiveLayer.showChainNote}
        showPermalink={hiveLayer.showChainPermalink}
        learnMoreUrl={hiveLayer.learnMoreUrl}
      />
    </footer>
  );
}
