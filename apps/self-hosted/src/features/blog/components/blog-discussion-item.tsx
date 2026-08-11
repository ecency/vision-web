'use client';

import { renderPostBody } from '@ecency/render-helper';
import type { Entry } from '@ecency/sdk';
import { UilComment, UilHeart } from '@tooni/iconscout-unicons-react';
import { useMemo, useState } from 'react';
import { formatRelativeTime, InstanceConfigManager } from '@/core';
import { UserAvatar } from '@/features/shared/user-avatar';
import { BlogDiscussionList } from './blog-discussion-list';

interface Props {
  entry: Entry;
  discussionList: Entry[];
  root: Entry;
  isRawContent?: boolean;
}

export function BlogDiscussionItem({
  entry,
  discussionList,
  root,
  isRawContent,
}: Props) {
  const [showReplies, setShowReplies] = useState(false);

  const likesCount = useMemo(() => entry.active_votes?.length || 0, [entry]);
  // Honor the likes flag, read the same way every other config-flag consumer does
  // (blog-post-item, blog-post-footer). A live owner-preview toggle is NOT reflected by any
  // consumer because the preview flow applies edits via DOM attributes, not the config store;
  // making it live is an app-wide preview change (store-based preview re-renders the whole
  // tree per keystroke), out of scope here. For real visitors the config is static per load.
  const showLikes = InstanceConfigManager.useConfig(
    ({ configuration }) =>
      configuration.instanceConfiguration.features.likes?.enabled ?? true,
  );

  const repliesCount = useMemo(
    () =>
      discussionList.filter(
        (x) =>
          x.parent_author === entry.author &&
          x.parent_permlink === entry.permlink,
      ).length,
    [discussionList, entry],
  );

  const hasReplies = repliesCount > 0;
  const createdDate = useMemo(
    () => formatRelativeTime(entry.created),
    [entry.created],
  );

  const entryLink = useMemo(
    // Canonical post URL is the bare /@author/permlink form (same as the post
    // page routes); the category segment is intentionally omitted.
    () => `/@${entry.author}/${entry.permlink}`,
    [entry],
  );

  return (
    <div className="border-l-2 border-theme pl-3 sm:pl-6 py-3 sm:py-4">
      <div className="flex items-start gap-2 sm:gap-3">
        <div className="shrink-0">
          <UserAvatar username={entry.author} size="medium" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 sm:gap-2 mb-2 text-xs sm:text-sm text-theme-muted font-theme-ui">
            {/* Not a link: there is no /@user route, so this pointed at the SPA's
                "Page not found". A blog does not show other people's profiles, same
                reasoning as the inert @user chips in rendered bodies, and the same
                treatment the sidebar team list already gives other accounts. The
                post author's own name is the exception and still links out via
                general.profileBaseUrl (blog-post-header, blog-post-item). */}
            <span className="font-semibold text-theme-primary">
              @{entry.author}
            </span>
            <span>•</span>
            <a href={entryLink} className="transition-theme hover:opacity-70">
              {createdDate}
            </a>
          </div>

          <div className="mt-2">
            {isRawContent ? (
              <pre className="text-sm font-mono whitespace-pre-wrap break-words bg-theme-tertiary p-2 rounded-theme-sm text-theme-primary">
                {entry.body}
              </pre>
            ) : (
              <div
                className="markdown-body text-sm! max-w-none entry-body"
                dangerouslySetInnerHTML={{
                  // embedVideosDirectly: emit ready-to-play iframes for
                  // YouTube/3Speak (no client-side enhancer runs here).
                  // inertAuthorAndTagChips: no profile or tag routes exist here.
                  __html: renderPostBody(
                    entry.body,
                    false,
                    false,
                    'ecency.com',
                    undefined,
                    {
                      embedVideosDirectly: true,
                      // externalProfileBase: a profile SECTION link (/@user/wallet and the rest
                      // of SECTION_LIST) is emitted as an ordinary link, so it lands on
                      // /$author/$permlink here and tries to load a post called "wallet".
                      // The route exists, so no route guard sees it, and it is not a chip,
                      // so inertAuthorAndTagChips does not either. Real post links stay
                      // internal on purpose: that content resolves from the chain.
                      externalProfileBase: 'https://ecency.com',
                      inertAuthorAndTagChips: true,
                    },
                  ),
                }}
              />
            )}
          </div>

          <div className="flex items-center gap-3 sm:gap-4 mt-2 sm:mt-3 text-xs text-theme-muted font-theme-ui">
            {showLikes && (
              <div className="flex items-center gap-1">
                <UilHeart className="size-3" />
                <span>{likesCount}</span>
              </div>
            )}
            {hasReplies && (
              <button
                type="button"
                onClick={() => setShowReplies(!showReplies)}
                className="flex items-center gap-1 transition-theme hover:opacity-70"
              >
                <UilComment className="size-3" />
                <span>
                  {repliesCount} {repliesCount === 1 ? 'reply' : 'replies'}
                </span>
              </button>
            )}
          </div>

          {showReplies && hasReplies && (
            <div className="mt-4 ml-4">
              <BlogDiscussionList
                discussionList={discussionList}
                parent={entry}
                root={root}
                isRawContent={isRawContent}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
