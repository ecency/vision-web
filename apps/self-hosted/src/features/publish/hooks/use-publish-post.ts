import { useComment } from '@ecency/sdk';
import { useMutation } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
// Imported from the module rather than the `@/core` barrel: the barrel pulls
// in `configuration-loader`, which imports the build-time `config.json` that
// only exists after an image build, so a test of this hook could not load it.
import {
  resolveCommentOptions,
  resolveRewardSelection,
} from '@/core/hive-layer';
import { useAuth } from '@/features/auth/hooks';
import { useHiveLayer } from '@/features/blog/hooks/use-hive-layer';
import { useInstanceConfig } from '@/features/blog/hooks/use-instance-config';
import { createBroadcastAdapter } from '@/providers/sdk';
import { createPermlink } from '../utils/permlink';
import type { PublishVariables } from '../utils/publish-variables';
import { resolvePublishTarget } from '../utils/publish-target';

export function usePublishPost({
  beforeNavigate,
}: {
  beforeNavigate?: () => void;
} = {}) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { isCommunityMode, communityId } = useInstanceConfig();
  const { authorRewards } = useHiveLayer();

  const adapter = createBroadcastAdapter();
  const commentMutation = useComment(user?.username, { adapter });

  return useMutation({
    mutationKey: ['publish-post'],
    mutationFn: async ({ title, body, tags, rewardType }: PublishVariables) => {
      if (!user) {
        throw new Error('Authentication required to publish post');
      }

      if (!title.trim()) {
        throw new Error('Title cannot be empty');
      }

      if (!body.trim()) {
        throw new Error('Post content cannot be empty');
      }

      if (!tags.length) {
        throw new Error('At least one tag is required');
      }

      const permlink = createPermlink(title, true);

      // In community mode publish into the community (parentPermlink =
      // communityId) with the community tag first; in blog mode the first tag
      // stays the category. The logged-in user remains the author either way.
      const { parentPermlink, tags: metadataTags } = resolvePublishTarget({
        tags,
        isCommunityMode,
        communityId,
      });

      // The instance is not allowed to choose a reward split, only whether the
      // author is asked at all. With the control switched off there is nothing
      // to honour, and a selection left in a stale draft must not survive the
      // owner turning the panel off. Applied here, at the broadcast site, and
      // through the same function the composer uses to decide what it is
      // asking the author to confirm.
      const rewardSelection = resolveRewardSelection(authorRewards, rewardType);

      await commentMutation.mutateAsync({
        author: user.username,
        permlink,
        parentAuthor: '',
        parentPermlink,
        title: title.trim(),
        body: body.trim(),
        jsonMetadata: {
          tags: metadataTags,
          app: 'ecency-selfhost/1.0',
          format: 'markdown',
        },
        // The only door to a `comment_options` operation in this app, and it
        // returns undefined for every author who did not choose otherwise,
        // which the SDK's `if (payload.options)` gate turns into an operation
        // array byte-identical to the one published before this existed.
        options: resolveCommentOptions(rewardSelection),
      });

      // Return where the new post lives so onSuccess can land the author ON it.
      return { author: user.username, permlink };
    },
    onSuccess: ({ author, permlink }) => {
      beforeNavigate?.();
      // Redirect to the new post, not a hardcoded feed: a fresh post has no votes, so on a
      // community (whose default filter is trending/hot) the author would land on a feed
      // without their post and think publishing failed.
      navigate({
        to: '/$author/$permlink',
        params: { author: `@${author}`, permlink },
        search: { raw: undefined },
      });
    },
  });
}
