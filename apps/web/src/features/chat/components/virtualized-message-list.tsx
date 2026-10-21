import { memo, useCallback, useRef, type ReactNode } from "react";
import { Virtuoso, VirtuosoHandle } from "react-virtuoso";
import { MessageItem } from "./message-item";
import type { MattermostPost, MattermostUser } from "../mattermost-api";
import type { PostItem } from "./message-list";

const INITIAL_INDEX = 100000;

interface VirtualizedMessageListProps {
  groupedPosts: PostItem[];
  showUnreadDivider: boolean;
  firstUnreadIndex: number;
  expandedJoinGroups: Set<string>;
  setExpandedJoinGroups: React.Dispatch<React.SetStateAction<Set<string>>>;
  channelId: string;

  // User and channel data
  usersById: Record<string, MattermostUser>;
  channelData?: {
    member?: { user_id?: string; last_viewed_at?: number; mention_count?: number; msg_count?: number };
    canModerate?: boolean;
    channel?: { type?: string; id?: string; name?: string; display_name?: string };
    community?: string | null;
    onlineUserIds?: string[];
  };
  activeUser?: { username: string };
  postsById: Map<string, MattermostPost>;
  parentPostById: Map<string, MattermostPost>;

  // Callbacks
  getDisplayName: (post: MattermostPost) => string;
  getUsername: (post: MattermostPost) => string | undefined;
  getDecodedDisplayMessage: (post: MattermostPost) => string;
  renderMessageContent: (content: string) => ReactNode;
  normalizeUsername: (username?: string | null) => string | undefined;
  startDirectMessage: (username: string) => void;
  openThread: (post: MattermostPost) => void;
  handleReply: (post: MattermostPost) => void;
  handleEdit: (post: MattermostPost) => void;
  handleDelete: (post: MattermostPost) => void;
  handlePinToggle: (postId: string, isPinned: boolean) => void;
  toggleReaction: (post: MattermostPost, emojiName: string, closePopover?: boolean) => void;

  // State
  openReactionPostId: string | null;
  setOpenReactionPostId: (postId: string | null | ((current: string | null) => string | null)) => void;
  deletingPostId: string | null;
  reactMutationPending: boolean;
  deleteMutationPending: boolean;
  canPin: boolean;
  pinMutationPending: boolean;

  // Virtualization callbacks
  onStartReached: () => void;
  onAtBottomStateChange: (atBottom: boolean) => void;
  isFetchingNextPage: boolean;

  // Refs
  virtuosoRef: React.RefObject<VirtuosoHandle | null>;

  // Initial scroll
  initialScrollIndex?: number;
}

const LoadingOlderIndicator = memo(function LoadingOlderIndicator({
  isFetchingNextPage
}: {
  isFetchingNextPage: boolean;
}) {
  if (!isFetchingNextPage) return null;
  return (
    <div className="flex justify-center py-4">
      <div className="text-sm text-[--text-muted]">Loading older messages...</div>
    </div>
  );
});

function JoinGroupItem({
  item,
  showUnreadDivider,
  firstUnreadIndex,
  expandedJoinGroups,
  setExpandedJoinGroups,
  getDecodedDisplayMessage
}: {
  item: Extract<PostItem, { type: "join-group" }>;
  showUnreadDivider: boolean;
  firstUnreadIndex: number;
  expandedJoinGroups: Set<string>;
  setExpandedJoinGroups: React.Dispatch<React.SetStateAction<Set<string>>>;
  getDecodedDisplayMessage: (post: MattermostPost) => string;
}) {
  const isExpanded = expandedJoinGroups.has(item.groupId);
  const firstUnreadInGroup = item.indices.find((i) => i === firstUnreadIndex);

  return (
    <div className="pb-2.5 space-y-3">
      {showUnreadDivider && firstUnreadInGroup !== undefined && (
        <div className="flex items-center gap-3 text-xs md:text-[11px] font-semibold uppercase tracking-wide text-[--text-muted]">
          <div className="flex-1 border-t border-[--border-color]" />
          <span>New</span>
          <div className="flex-1 border-t border-[--border-color]" />
        </div>
      )}
      <div className="w-full flex justify-center">
        <button
          type="button"
          onClick={() => {
            setExpandedJoinGroups((prev) => {
              const next = new Set(prev);
              if (next.has(item.groupId)) {
                next.delete(item.groupId);
              } else {
                next.add(item.groupId);
              }
              return next;
            });
          }}
          className="rounded bg-[--surface-color] px-4 py-2 text-base md:text-sm text-[--text-muted] text-center hover:bg-[--hover-color] transition-colors cursor-pointer"
        >
          {isExpanded ? (
            <div className="space-y-1">
              {item.posts.map((post) => {
                const message = getDecodedDisplayMessage(post);
                return <div key={post.id}>{message}</div>;
              })}
            </div>
          ) : (
            <span>{item.posts.length} people joined</span>
          )}
        </button>
      </div>
    </div>
  );
}

export const VirtualizedMessageList = memo(function VirtualizedMessageList({
  groupedPosts,
  showUnreadDivider,
  firstUnreadIndex,
  expandedJoinGroups,
  setExpandedJoinGroups,
  channelId,
  usersById,
  channelData,
  activeUser,
  postsById,
  parentPostById,
  getDisplayName,
  getUsername,
  getDecodedDisplayMessage,
  renderMessageContent,
  normalizeUsername,
  startDirectMessage,
  openThread,
  handleReply,
  handleEdit,
  handleDelete,
  handlePinToggle,
  toggleReaction,
  openReactionPostId,
  setOpenReactionPostId,
  deletingPostId,
  reactMutationPending,
  deleteMutationPending,
  canPin,
  pinMutationPending,
  onStartReached,
  onAtBottomStateChange,
  isFetchingNextPage,
  virtuosoRef,
  initialScrollIndex
}: VirtualizedMessageListProps) {
  const firstItemIndex = INITIAL_INDEX - groupedPosts.length;

  const itemContent = useCallback(
    (_virtualIndex: number, item: PostItem) => {
      if (item.type === "join-group") {
        return (
          <JoinGroupItem
            item={item}
            showUnreadDivider={showUnreadDivider}
            firstUnreadIndex={firstUnreadIndex}
            expandedJoinGroups={expandedJoinGroups}
            setExpandedJoinGroups={setExpandedJoinGroups}
            getDecodedDisplayMessage={getDecodedDisplayMessage}
          />
        );
      }

      const post = item.post;
      const index = item.index;
      const isGroupStart = item.isGroupStart;

      return (
        <div className="mx-auto max-w-4xl px-4">
          <MessageItem
            post={post}
            index={index}
            isGroupStart={isGroupStart}
            showUnreadDivider={showUnreadDivider}
            firstUnreadIndex={firstUnreadIndex}
            channelId={channelId}
            usersById={usersById}
            channelData={channelData}
            activeUser={activeUser}
            postsById={postsById}
            parentPostById={parentPostById}
            getDisplayName={getDisplayName}
            getUsername={getUsername}
            getDecodedDisplayMessage={getDecodedDisplayMessage}
            renderMessageContent={renderMessageContent}
            normalizeUsername={normalizeUsername}
            startDirectMessage={startDirectMessage}
            openThread={openThread}
            handleReply={handleReply}
            handleEdit={handleEdit}
            handleDelete={handleDelete}
            handlePinToggle={handlePinToggle}
            toggleReaction={toggleReaction}
            openReactionPostId={openReactionPostId}
            setOpenReactionPostId={setOpenReactionPostId}
            deletingPostId={deletingPostId}
            reactMutationPending={reactMutationPending}
            deleteMutationPending={deleteMutationPending}
            canPin={canPin}
            pinMutationPending={pinMutationPending}
          />
        </div>
      );
    },
    [
      showUnreadDivider,
      firstUnreadIndex,
      expandedJoinGroups,
      setExpandedJoinGroups,
      channelId,
      usersById,
      channelData,
      activeUser,
      postsById,
      parentPostById,
      getDisplayName,
      getUsername,
      getDecodedDisplayMessage,
      renderMessageContent,
      normalizeUsername,
      startDirectMessage,
      openThread,
      handleReply,
      handleEdit,
      handleDelete,
      handlePinToggle,
      toggleReaction,
      openReactionPostId,
      setOpenReactionPostId,
      deletingPostId,
      reactMutationPending,
      deleteMutationPending,
      canPin,
      pinMutationPending
    ]
  );

  const followOutput = useCallback(
    (isAtBottom: boolean) => (isAtBottom ? "smooth" : false) as "smooth" | false,
    []
  );

  const Header = useCallback(
    () => <LoadingOlderIndicator isFetchingNextPage={isFetchingNextPage} />,
    [isFetchingNextPage]
  );

  return (
    <Virtuoso
      ref={virtuosoRef}
      data={groupedPosts}
      firstItemIndex={firstItemIndex}
      // A data index (0..length-1), not offset by firstItemIndex.
      initialTopMostItemIndex={
        groupedPosts.length ? (initialScrollIndex ?? groupedPosts.length - 1) : undefined
      }
      followOutput={followOutput}
      startReached={onStartReached}
      atBottomStateChange={onAtBottomStateChange}
      atBottomThreshold={200}
      overscan={400}
      itemContent={itemContent}
      components={{ Header }}
      style={{ height: "100%" }}
    />
  );
});

export type { VirtualizedMessageListProps };
export { INITIAL_INDEX };
