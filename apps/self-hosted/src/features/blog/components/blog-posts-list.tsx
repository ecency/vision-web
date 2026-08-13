'use client';

import { useThemeComponents } from '@/themes/use-theme-components';
import { ArchiveFrame } from './archive-frame';

interface Props {
  filter?: string;
  limit?: number;
}

/**
 * The default archive: every entry as a card, in order. The frame owns
 * fetching, paging and the failure states; this file is only the layout, and
 * the card resolves through the theme registry so a theme can restyle every
 * entry without owning either.
 */
export function BlogPostsList({ filter = 'posts', limit = 20 }: Props) {
  const { PostCard } = useThemeComponents();

  return (
    <ArchiveFrame filter={filter} limit={limit}>
      {({ posts, batchIndexOf }) =>
        posts.map((post, index) => (
          <PostCard
            key={`${post.author}/${post.permlink}`}
            entry={post}
            index={batchIndexOf(index)}
          />
        ))
      }
    </ArchiveFrame>
  );
}
