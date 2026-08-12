import {
  buildSrcSet,
  catchPostImage,
  postBodySummary,
  renderPostBody,
} from '@ecency/render-helper';
import type { Entry } from '@ecency/sdk';
import { Link } from '@tanstack/react-router';
import {
  UilComment,
  UilHeart,
  UilMapPinAlt,
} from '@tooni/iconscout-unicons-react';
import clsx from 'clsx';
import { useMemo } from 'react';
import { formatDate, InstanceConfigManager, t } from '@/core';
import { UserAvatar } from '@/features/shared/user-avatar';
import { useHiveLayer } from '../hooks/use-hive-layer';
import { estimateReadMinutes } from '../utils/read-time';
import {
  useThemeGridSizes,
  useThemeShowsReadTime,
} from '@/themes/use-theme-components';
import { PostPayout } from './post-payout';

interface Props {
  entry: Entry;
  index?: number;
}

export function BlogPostItem({ entry }: Props) {
  const hiveLayer = useHiveLayer();
  const listType = InstanceConfigManager.useConfig(
    ({ configuration }) => configuration.instanceConfiguration.layout.listType,
  );
  const showLikes = InstanceConfigManager.useConfig(
    ({ configuration }) =>
      configuration.instanceConfiguration.features.likes?.enabled ?? true,
  );
  const showComments = InstanceConfigManager.useConfig(
    ({ configuration }) =>
      configuration.instanceConfiguration.features.comments?.enabled ?? true,
  );
  const instanceType = InstanceConfigManager.useConfig(
    ({ configuration }) => configuration.instanceConfiguration.type ?? 'blog',
  );
  const profileBaseUrl = InstanceConfigManager.useConfig(
    ({ configuration }) => configuration.general.profileBaseUrl || 'https://ecency.com/@',
  );
  const entryData = entry.original_entry || entry;

  // Theme opt-in (manifest showsReadTime): an editorial choice, not config.
  const showsReadTime = useThemeShowsReadTime();
  const readTime = useMemo(
    () => (showsReadTime ? estimateReadMinutes(entryData.body) : null),
    [showsReadTime, entryData.body],
  );
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

  // Width variants of the same proxied image, so a phone never downloads the
  // 800px cut a desktop grid cell needs. The grid sizes come from the
  // theme's own column variables; the CSS height token already pins the
  // box, so no CLS either way.
  const imageSrcSet = useMemo(
    () => (imageUrl ? buildSrcSet(imageUrl) || undefined : undefined),
    [imageUrl],
  );
  const gridSizes = useThemeGridSizes();

  // Router navigation, not a document load: an <a href> here tore down the SPA
  // on every feed-to-post click, refetching the instance config and throwing
  // away the query cache the feed had just filled. The route param carries the
  // bare username; the post page accepts it with or without the @ prefix.
  const postParams = useMemo(
    // The '@' is part of the canonical post URL, and the router is configured to
    // leave it unencoded, so these links keep the shape the rest of the Hive
    // ecosystem uses instead of dropping to /author/permlink.
    () => ({ author: `@${entryData.author}`, permlink: entryData.permlink }),
    [entryData.author, entryData.permlink],
  );

  // The post route declares `raw` as a search param, so the type demands the
  // key. An undefined value is dropped when the href is built, so the link is
  // still the bare post path.
  const postSearch = { raw: undefined };

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
        <Link to="/$author/$permlink" params={postParams} search={postSearch}>
          {entryData.title}
        </Link>
      </h2>

      {listType === 'grid' && imageUrl && (
        <div className="mb-4 overflow-hidden">
          <Link to="/$author/$permlink" params={postParams} search={postSearch}>
            <img
              src={imageUrl}
              srcSet={imageSrcSet}
              sizes={gridSizes}
              alt={entryData.title}
              className="w-full object-cover post-card-image-theme"
              loading="lazy"
            />
          </Link>
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
              // externalProfileBase: a profile SECTION link (/@user/wallet and the rest
              // of SECTION_LIST) is emitted as an ordinary link, so it lands on
              // /$author/$permlink here and tries to load a post called "wallet".
              // The route exists, so no route guard sees it, and it is not a chip,
              // so inertAuthorAndTagChips does not either. Real post links stay
              // internal on purpose: that content resolves from the chain.
              externalProfileBase: 'https://ecency.com',
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
        {showsReadTime && readTime !== null && (
          <>
            <span>•</span>
            <span>
              {readTime} {t('minRead')}
            </span>
          </>
        )}
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
        {/*
          The `full` posture, and the only thing it adds over `standard`. Same
          meta row, same muted treatment as the post page, so one earnings
          figure per surface still holds. PostPayout renders nothing when the
          entry carries no readable payout, which is what keeps the search feed
          safe: it hand-builds an Entry with no payout fields at all.
        */}
        {hiveLayer.showPayoutInFeed && (
          <PostPayout
            entry={entryData}
            label={hiveLayer.payoutLabel}
            separator={<span>•</span>}
          />
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
            <Link
              to="/$author/$permlink"
              params={postParams}
              search={postSearch}
            >
              <img
                src={imageUrl}
                srcSet={imageSrcSet}
                sizes="(max-width: 640px) 100vw, 200px"
                alt={entryData.title}
                className="w-full h-48 sm:h-32 object-cover rounded-theme"
                loading="lazy"
              />
            </Link>
          </div>
        </div>
      ) : (
        contentSection
      )}
    </article>
  );
}
