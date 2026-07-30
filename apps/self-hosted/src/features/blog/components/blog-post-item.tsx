import {
  catchPostImage,
  postBodySummary,
  renderPostBody,
} from '@ecency/render-helper';
import type { Entry } from '@ecency/sdk';
import {
  UilComment,
  UilHeart,
  UilMapPinAlt,
} from '@tooni/iconscout-unicons-react';
import clsx from 'clsx';
import { useMemo } from 'react';
import { formatDate, InstanceConfigManager } from '@/core';
import { UserAvatar } from '@/features/shared/user-avatar';

interface Props {
  entry: Entry;
  index?: number;
}

export function BlogPostItem({ entry }: Props) {
  const listType = InstanceConfigManager.getConfigValue(
    ({ configuration }) => configuration.instanceConfiguration.layout.listType,
  );
  const showLikes = InstanceConfigManager.getConfigValue(
    ({ configuration }) =>
      configuration.instanceConfiguration.features.likes?.enabled ?? true,
  );
  const showComments = InstanceConfigManager.getConfigValue(
    ({ configuration }) =>
      configuration.instanceConfiguration.features.comments?.enabled ?? true,
  );
  const instanceType = InstanceConfigManager.getConfigValue(
    ({ configuration }) => configuration.instanceConfiguration.type ?? 'blog',
  );
  const profileBaseUrl = InstanceConfigManager.getConfigValue(
    ({ configuration }) => configuration.general.profileBaseUrl || 'https://ecency.com/@',
  );
  const entryData = entry.original_entry || entry;
  const isCommunity = instanceType === 'community';

  const summary = useMemo(
    () =>
      entryData.json_metadata?.description ||
      postBodySummary(entryData.body, 300),
    [entryData],
  );

  const likesCount = useMemo(
    () => entryData.active_votes?.length || 0,
    [entryData],
  );

  const commentsCount = entryData.children || 0;

  const tags = useMemo(() => {
    const rawTags = entryData.json_metadata?.tags;
    if (!Array.isArray(rawTags)) return [];
    return rawTags.filter((tag) => tag !== entryData.community);
  }, [entryData]);

  const location = useMemo(() => {
    if (entryData.json_metadata?.location) {
      const loc = entryData.json_metadata.location;
      if (typeof loc === 'string') {
        return loc;
      }
      if (typeof loc === 'object' && loc.address) {
        return loc.address;
      }
    }
    return;
  }, [entryData]);

  const imageUrl = useMemo(() => {
    // json_metadata is authored on-chain, so its image value is untrusted — it can carry
    // a non-http scheme, or a non-string that stringifies into src. The entry overload
    // resolves the metadata image (falling back to the body's first image) and always
    // returns a proxy URL or null, so there is no path where a raw author-controlled host
    // reaches the card and collects a beacon from every visitor.
    // `|| null` rather than `?? null`: a non-string metadata value resolves to an empty
    // string, and an empty src is re-requested as the page URL by browsers.
    return catchPostImage(entryData, 800, 600) || null;
  }, [entryData]);

  const contentSection = (
    <>
      <div className="mb-2">
        {entryData.community && entryData.community_title && (
          <span className="text-xs font-medium text-theme-muted font-theme-ui">
            Community: {entryData.community_title}
          </span>
        )}
        {!entryData.community && entryData.category && (
          <span className="text-xs font-medium text-theme-muted font-theme-ui">
            {entryData.category}
          </span>
        )}
      </div>

      <h2 className="text-xl sm:text-2xl font-bold mb-3 transition-theme hover:opacity-70 heading-theme leading-[1.15]">
        <a
          href={`/@${entryData.author}/${entryData.permlink}`}
        >
          {entryData.title}
        </a>
      </h2>

      {listType === 'grid' && imageUrl && (
        <div className="mb-4 overflow-hidden">
          <a
            href={`/@${entryData.author}/${entryData.permlink}`}
          >
            <img
              src={imageUrl}
              alt={entryData.title}
              className="w-full object-cover post-card-image-theme"
              loading="lazy"
            />
          </a>
        </div>
      )}

      {location && (
        <div className="mb-3 flex items-center text-xs text-theme-muted">
          <UilMapPinAlt className="size-3 mr-1" />
          <span>{location}</span>
        </div>
      )}

      <div className="mb-4">
        <div
          className="markdown-body text-sm sm:text-base max-w-none body-theme entry-body"
          dangerouslySetInnerHTML={{
            // inertAuthorAndTagChips: no profile or tag routes exist here, and a
            // link inside this card would nest inside the card's own post link.
            __html: renderPostBody(summary, false, false, 'ecency.com', undefined, {
              inertAuthorAndTagChips: true,
            }),
          }}
        />
      </div>

      {tags.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-2">
          {tags.map((tag) => (
            <span
              key={tag}
              className="text-xs px-2 py-1 tag-theme"
            >
              #{tag}
            </span>
          ))}
        </div>
      )}

      <div className="flex items-center gap-4 text-xs text-theme-muted font-theme-ui">
        <a
          href={`${profileBaseUrl}${entryData.author}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 hover:opacity-70 transition-opacity"
        >
          <UserAvatar username={entryData.author} size="small" />
          <span className={isCommunity ? 'font-medium text-theme-secondary' : ''}>
            {entryData.author}
          </span>
        </a>
        <span>•</span>
        <span>{formatDate(entryData.created)}</span>
        {showLikes && (
          <>
            <span>•</span>
            <div className="flex items-center gap-1">
              <UilHeart className="size-3" />
              <span>{likesCount}</span>
            </div>
          </>
        )}
        {showComments && (
          <>
            <span>•</span>
            <div className="flex items-center gap-1">
              <UilComment className="size-3" />
              <span>{commentsCount}</span>
            </div>
          </>
        )}
      </div>
    </>
  );

  return (
    <article className={clsx('py-6 sm:py-8 border-b border-theme')}>
      {listType === 'list' && imageUrl ? (
        <div className="flex flex-col sm:flex-row gap-4 sm:gap-6">
          <div className="flex-1">{contentSection}</div>
          <div className="shrink-0 w-full sm:w-48">
            <a
              href={`/@${entryData.author}/${entryData.permlink}`}
            >
              <img
                src={imageUrl}
                alt={entryData.title}
                className="w-full h-48 sm:h-32 object-cover rounded-theme"
                loading="lazy"
              />
            </a>
          </div>
        </div>
      ) : (
        contentSection
      )}
    </article>
  );
}
