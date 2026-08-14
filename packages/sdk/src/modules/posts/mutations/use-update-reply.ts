import { useBroadcastMutation, QueryKeys } from "@/modules/core";
import type { BroadcastMode } from "@/modules/core";
import { buildCommentOp, buildCommentOptionsOp } from "@/modules/operations/builders";
import type { AuthContextV2 } from "@/modules/core/types";
import type { Operation } from "../../../hive-tx";
import type { Beneficiary } from "./use-comment";

/**
 * Payload for updating a reply/comment.
 */
export interface UpdateReplyPayload {
  /** Author of the comment/post */
  author: string;
  /** Permlink of the comment/post being updated */
  permlink: string;
  /** Parent author */
  parentAuthor: string;
  /** Parent permlink */
  parentPermlink: string;
  /** Title (empty for comments) */
  title: string;
  /** Updated content body */
  body: string;
  /** Updated JSON metadata object */
  jsonMetadata: Record<string, any>;
  /** Optional: Root post author (for nested replies, used for discussions cache invalidation) */
  rootAuthor?: string;
  /** Optional: Root post permlink (for nested replies, used for discussions cache invalidation) */
  rootPermlink?: string;
  /** Optional: Comment options (beneficiaries, rewards) */
  options?: {
    /** Maximum accepted payout (e.g., "1000000.000 HBD") */
    maxAcceptedPayout?: string;
    /** Percent of payout in HBD (10000 = 100%) */
    percentHbd?: number;
    /** Allow votes on this content */
    allowVotes?: boolean;
    /** Allow curation rewards */
    allowCurationRewards?: boolean;
    /** Beneficiaries array */
    beneficiaries?: Beneficiary[];
  };
}

/**
 * React Query mutation hook for updating existing replies/comments.
 *
 * This mutation broadcasts a comment operation (and optionally comment_options)
 * to update an existing reply/comment on the Hive blockchain.
 *
 * @param username - The username updating the comment (required for broadcast)
 * @param auth - Authentication context with platform adapter and fallback configuration
 *
 * @returns React Query mutation result
 *
 * @remarks
 * **Post-Broadcast Actions:**
 * - Invalidates parent post cache to reflect the updated comment
 * - Invalidates discussions cache (all sort orders)
 * - Invalidates RC cache (RC decreases after updating)
 *
 * **Operations:**
 * - Always includes a comment operation
 * - Optionally includes comment_options operation for beneficiaries/rewards
 *
 * **Important:**
 * - Updates use the same comment operation as creating new comments
 * - The blockchain identifies this as an update based on matching author/permlink
 * - Only the author can update their own content
 * - Content can only be updated before payout (within 7 days)
 *
 * @example
 * ```typescript
 * const updateReplyMutation = useUpdateReply(username, {
 *   adapter: myAdapter,
 *   enableFallback: true,
 *   fallbackChain: ['keychain', 'key', 'hivesigner']
 * });
 *
 * // Update a reply
 * updateReplyMutation.mutate({
 *   author: 'alice',
 *   permlink: 're-bob-my-post-20260209',
 *   parentAuthor: 'bob',
 *   parentPermlink: 'my-post-20260209',
 *   title: '',
 *   body: 'Updated comment content!',
 *   jsonMetadata: {
 *     tags: ['comment'],
 *     app: 'ecency/3.0.0-vision'
 *   },
 *   rootAuthor: 'bob',
 *   rootPermlink: 'my-post-20260209'
 * });
 * ```
 */
export function useUpdateReply(
  username: string | undefined,
  auth?: AuthContextV2,
  broadcastMode?: BroadcastMode
) {
  return useBroadcastMutation<UpdateReplyPayload>(
    ["posts", "update-reply"],
    username,
    (payload) => {
      const operations: Operation[] = [];

      // Main comment operation (same operation for create and update)
      operations.push(
        buildCommentOp(
          payload.author,
          payload.permlink,
          payload.parentAuthor,
          payload.parentPermlink,
          payload.title,
          payload.body,
          payload.jsonMetadata
        )
      );

      // Optional comment options operation
      if (payload.options) {
        const {
          maxAcceptedPayout = "1000000.000 HBD",
          percentHbd = 10000,
          allowVotes = true,
          allowCurationRewards = true,
          beneficiaries = []
        } = payload.options;

        const extensions: any[] = [];

        // Add beneficiaries extension if provided
        if (beneficiaries.length > 0) {
          // Sort beneficiaries alphabetically by account name (required by blockchain)
          const sortedBeneficiaries = [...beneficiaries].sort((a, b) =>
            a.account.localeCompare(b.account)
          );

          extensions.push([
            0,
            {
              beneficiaries: sortedBeneficiaries.map(b => ({
                account: b.account,
                weight: b.weight
              }))
            }
          ]);
        }

        operations.push(
          buildCommentOptionsOp(
            payload.author,
            payload.permlink,
            maxAcceptedPayout,
            percentHbd,
            allowVotes,
            allowCurationRewards,
            extensions
          )
        );
      }

      return operations;
    },
    async (_result: any, variables) => {
      // No activity is recorded here. Activity rewards creating content. Every
      // broadcast from this mutation edits content that already exists.

      // Cache invalidation
      if (auth?.adapter?.invalidateQueries) {
        const queriesToInvalidate: any[] = [
          QueryKeys.resourceCredits.account(username!)
        ];

        // Invalidate parent entry
        queriesToInvalidate.push(
          QueryKeys.posts.entry(`/@${variables.parentAuthor}/${variables.parentPermlink}`)
        );

        // Invalidate discussions (matches all sort orders)
        // Use partial key to match all sort order variants
        // For nested replies, use rootAuthor/rootPermlink to match the root post's discussions
        // Fall back to parentAuthor/parentPermlink for direct replies to posts
        const discussionsAuthor = variables.rootAuthor || variables.parentAuthor;
        const discussionsPermlink = variables.rootPermlink || variables.parentPermlink;

        queriesToInvalidate.push({
          predicate: (query: any) => {
            const key = query.queryKey;
            return (
              Array.isArray(key) &&
              key[0] === "posts" &&
              key[1] === "discussions" &&
              key[2] === discussionsAuthor &&
              key[3] === discussionsPermlink
            );
          }
        });

        await auth.adapter.invalidateQueries(queriesToInvalidate);
      }
    },
    auth,
    'posting',
    { broadcastMode }
  );
}
