import { Button } from "@ui/button";
import { UserAvatar } from "@/features/shared";
import { emojiIconSvg } from "@ui/icons";
import { blogSvg, deleteForeverSvg, dotsHorizontal, earthSvg, linkSvg, mailSvg, pinSvg } from "@ui/svg";
import { clipboard } from "@/utils/clipboard";
import {
  Dropdown,
  DropdownItemWithIcon,
  DropdownMenu,
  DropdownToggle
} from "@ui/dropdown";
import { Popover, PopoverContent } from "@ui/popover";
import { formatRelativeTime, getAvatarUrl } from "../format-utils";
import { getNativeEmojiFromShortcode } from "../emoji-utils";
import { resolveReplyPreview } from "./reply-preview";
import { MessageTranslate } from "./message-translate";
import { PeopleListModal } from "./people-list-modal";
import { formatReactorNames, getReactorName, groupReactions } from "../group-utils";
import clsx from "clsx";
import i18next from "i18next";
import React, { memo, useEffect, useState } from "react";
import type { MattermostPost, MattermostUser } from "../mattermost-api";

const QUICK_REACTIONS = ["👍", "👎", "❤️", "😂", "🎉", "😮", "😢"] as const;

interface MessageItemProps {
  post: MattermostPost;
  index: number;
  isGroupStart: boolean;
  showUnreadDivider: boolean;
  firstUnreadIndex: number;
  channelId: string;

  // User and channel data
  usersById: Record<string, MattermostUser>;
  channelData?: {
    member?: { user_id?: string };
    canModerate?: boolean;
    channel?: { type?: string };
  };
  activeUser?: { username: string };
  postsById: Map<string, MattermostPost>;
  parentPostById: Map<string, MattermostPost>;

  // Callbacks
  getDisplayName: (post: MattermostPost) => string;
  getUsername: (post: MattermostPost) => string | undefined;
  getDecodedDisplayMessage: (post: MattermostPost) => string;
  renderMessageContent: (content: string) => React.ReactNode;
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
}

const UsernameActions = memo(function UsernameActions({
  username,
  displayName,
  currentUsername,
  onStartDm
}: {
  username: string;
  displayName: string;
  currentUsername?: string;
  onStartDm: (username: string) => void;
}) {
  const isSelf = currentUsername
    ? username.toLowerCase() === currentUsername.toLowerCase()
    : false;

  return (
    <Dropdown className="inline-block">
      <DropdownToggle>
        <span
          className="cursor-pointer font-semibold hover:text-[--text-color]"
          title={`@${username}`}
        >
          {displayName}
        </span>
      </DropdownToggle>
      <DropdownMenu align="left" size="small">
        <DropdownItemWithIcon icon={blogSvg} label="View blog" href={`/@${username}`} />
        {!isSelf && (
          <DropdownItemWithIcon
            icon={mailSvg}
            label="Start DM"
            onClick={() => onStartDm(username)}
          />
        )}
      </DropdownMenu>
    </Dropdown>
  );
});

function messageItemPropsAreEqual(prev: MessageItemProps, next: MessageItemProps): boolean {
  // Post identity & content
  if (prev.post.id !== next.post.id) return false;
  if (prev.post.message !== next.post.message) return false;
  if (prev.post.edit_at !== next.post.edit_at) return false;
  if (prev.post.is_pinned !== next.post.is_pinned) return false;
  if (prev.post.metadata !== next.post.metadata) return false;

  // Layout
  if (prev.isGroupStart !== next.isGroupStart) return false;
  if (prev.index !== next.index) return false;
  if (prev.channelId !== next.channelId) return false;

  // Unread divider — only the boundary item needs to re-render
  const prevShowsDivider = prev.showUnreadDivider && prev.index === prev.firstUnreadIndex;
  const nextShowsDivider = next.showUnreadDivider && next.index === next.firstUnreadIndex;
  if (prevShowsDivider !== nextShowsDivider) return false;

  // Reaction picker — only the affected item re-renders
  const prevPickerOpen = prev.openReactionPostId === prev.post.id;
  const nextPickerOpen = next.openReactionPostId === next.post.id;
  if (prevPickerOpen !== nextPickerOpen) return false;

  // Deleting state — only the affected item re-renders
  const prevDeleting = prev.deletingPostId === prev.post.id && prev.deleteMutationPending;
  const nextDeleting = next.deletingPostId === next.post.id && next.deleteMutationPending;
  if (prevDeleting !== nextDeleting) return false;

  // User data — only compare this post's author
  if (prev.usersById[prev.post.user_id] !== next.usersById[next.post.user_id]) return false;
  // ...and its reactors, whose names show in the reaction tooltips
  const reactions = next.post.metadata?.reactions;
  if (
    reactions?.length &&
    reactions.some((reaction) => prev.usersById[reaction.user_id] !== next.usersById[reaction.user_id])
  ) {
    return false;
  }

  // Parent post (for threaded replies)
  if (prev.post.root_id) {
    if (prev.parentPostById.get(prev.post.id) !== next.parentPostById.get(next.post.id)) return false;
  }

  // Channel data — compare individual fields
  if (prev.channelData?.member?.user_id !== next.channelData?.member?.user_id) return false;
  if (prev.channelData?.canModerate !== next.channelData?.canModerate) return false;
  if (prev.channelData?.channel?.type !== next.channelData?.channel?.type) return false;

  // Mutation pending states that affect all items
  if (prev.reactMutationPending !== next.reactMutationPending) return false;
  if (prev.canPin !== next.canPin) return false;
  if (prev.pinMutationPending !== next.pinMutationPending) return false;

  // Active user
  if (prev.activeUser?.username !== next.activeUser?.username) return false;

  // Skip callback comparison — trust useCallback stability from PR 1

  return true;
}

function MessageItemInner({
  post,
  index,
  isGroupStart,
  showUnreadDivider,
  firstUnreadIndex,
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
}: MessageItemProps) {
  const [showTranslateModal, setShowTranslateModal] = useState(false);
  const [showReactions, setShowReactions] = useState(false);
  const currentUserId = channelData?.member?.user_id;
  const groupedReactions = groupReactions(post.metadata?.reactions, currentUserId);

  // Close reaction picker when this item unmounts (e.g., due to virtualization)
  useEffect(() => {
    return () => {
      setOpenReactionPostId((current: string | null) =>
        current === post.id ? null : current
      );
    };
  }, [post.id, setOpenReactionPostId]);

  const handleCopyLink = () => {
    const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
    const link = `${baseUrl}/chats/${channelId}?post=${post.id}`;
    clipboard(link);
  };

  return (
    <div
      className={clsx(isGroupStart ? "mt-3 first:mt-0" : "mt-0.5")}
      data-post-id={post.id}
    >
      {showUnreadDivider && index === firstUnreadIndex && (
        <div className="flex items-center gap-3 text-[11px] font-semibold uppercase tracking-wide text-[--text-muted]">
          <div className="flex-1 border-t border-[--border-color]" />
          <span>New</span>
          <div className="flex-1 border-t border-[--border-color]" />
        </div>
      )}
      <div className="flex gap-2.5 group relative rounded px-2 py-0.5 -mx-2 hover:bg-[--surface-color] transition-colors">
        {post.type === "system_add_to_channel" ? (
          <div className="w-full flex justify-center">
            <div className="rounded bg-[--surface-color] px-4 py-2 text-sm text-[--text-muted] text-center">
              {renderMessageContent(getDecodedDisplayMessage(post))}
            </div>
          </div>
        ) : (
          <>
            {/* Avatar - show only for group start or hide with placeholder */}
            <div className="w-8 flex-shrink-0 pt-0.5">
              {isGroupStart ? (
                (() => {
                  const user = usersById[post.user_id];
                  const displayName = getDisplayName(post);
                  const username = getUsername(post);
                  const avatarUrl = getAvatarUrl(user);

                  if (username) {
                    return (
                      <UserAvatar username={username} size="small" className="size-8" />
                    );
                  }

                  if (avatarUrl) {
                    return (
                      <img
                        src={avatarUrl}
                        alt={`${displayName} avatar`}
                        className="size-8 rounded-full object-cover"
                      />
                    );
                  }

                  return (
                    <div className="size-8 rounded-full bg-[--surface-color] text-xs font-semibold text-[--text-muted] flex items-center justify-center">
                      {displayName.charAt(0).toUpperCase()}
                    </div>
                  );
                })()
              ) : (
                <div className="h-5 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                  <span className="text-[10px] text-[--text-muted]">
                    {new Date(post.create_at).toLocaleTimeString([], {
                      hour: "numeric",
                      minute: "2-digit"
                    })}
                  </span>
                </div>
              )}
            </div>

            <div className="flex flex-col gap-1 min-w-0 flex-1">
              {/* Header with name and timestamp - show only for group start */}
              {isGroupStart && (
                <div className="flex items-center gap-2 text-xs text-[--text-muted]">
                  {(() => {
                    const username = getUsername(post);
                    const displayName = getDisplayName(post);

                    if (username) {
                      return (
                        <UsernameActions
                          username={username}
                          displayName={displayName}
                          currentUsername={activeUser?.username}
                          onStartDm={startDirectMessage}
                        />
                      );
                    }

                    return <span>{displayName}</span>;
                  })()}
                  <span
                    className="text-[--text-muted] cursor-help"
                    title={new Date(post.create_at).toLocaleString()}
                  >
                    {formatRelativeTime(post.create_at)}
                  </span>
                  {!!post.edit_at && post.edit_at > post.create_at && (
                    <span
                      className="text-[11px] text-[--text-muted] cursor-help"
                      title={`Edited ${new Date(post.edit_at).toLocaleString()}`}
                    >
                      • Edited {formatRelativeTime(post.edit_at)}
                    </span>
                  )}
                </div>
              )}
              {post.root_id &&
                (() => {
                  const rootPost = postsById.get(post.root_id!) ?? post;
                  const { parentUsername, parentMessage } = resolveReplyPreview(
                    post,
                    postsById,
                    parentPostById,
                    { getDecodedDisplayMessage, getDisplayName, normalizeUsername }
                  );

                  if (!parentMessage && !parentUsername) return null;

                  return (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        openThread(rootPost);
                      }}
                      className="text-left border-l-2 border-l-blue-dark-sky pl-2.5 py-0.5 text-xs text-[--text-muted] hover:text-[--text-color] transition-colors"
                    >
                      <span className="font-medium">{parentUsername || "conversation"}</span>
                      {parentMessage && (
                        <span className="line-clamp-1 opacity-70"> {parentMessage}</span>
                      )}
                    </button>
                  );
                })()}
              <div
                className="text-sm break-words space-y-1 [&>*]:m-0"
              >
                {renderMessageContent(getDecodedDisplayMessage(post))}
              </div>
              {groupedReactions.length > 0 && (
                <div className="flex flex-wrap gap-1 -mt-0.5">
                  {groupedReactions.map((reaction) => {
                    const emoji =
                      getNativeEmojiFromShortcode(reaction.emojiName) || `:${reaction.emojiName}:`;
                    const names = formatReactorNames(reaction.userIds, usersById, currentUserId);
                    return (
                      <button
                        key={`${post.id}-${reaction.emojiName}`}
                        type="button"
                        onClick={() => toggleReaction(post, reaction.emojiName)}
                        title={i18next.t("chat.reacted-with", { names, emoji })}
                        aria-label={`${emoji} ${reaction.userIds.length}: ${names}`}
                        aria-pressed={reaction.reacted}
                        className={clsx(
                          "flex items-center gap-1 rounded-full border px-2 py-1 text-xs",
                          reaction.reacted
                            ? "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-700 dark:bg-blue-900/40"
                            : "border-[--border-color] bg-[--background-color]"
                        )}
                      >
                        <span>{emoji}</span>
                        <span className="text-[--text-muted]">{reaction.userIds.length}</span>
                      </button>
                    );
                  })}
                  <button
                    type="button"
                    onClick={() => setShowReactions(true)}
                    className="rounded-full px-1.5 py-1 text-[11px] text-[--text-muted] hover:text-[--text-color]"
                    aria-label={i18next.t("chat.see-who-reacted")}
                    title={i18next.t("chat.see-who-reacted")}
                  >
                    ⋯
                  </button>
                </div>
              )}
            </div>
          </>
        )}
        {post.type !== "system_add_to_channel" && (
          <div className="absolute -right-2 -top-2 flex gap-1 opacity-100 md:opacity-0 transition-opacity duration-150 md:group-hover:opacity-100 pointer-events-auto md:pointer-events-none md:group-hover:pointer-events-auto">
            {(() => {
              const isReactionPickerOpen = openReactionPostId === post.id;

              return (
                <Popover
                  behavior="click"
                  placement="right"
                  customClassName="bg-[--surface-color] border border-[--border-color] rounded-lg shadow-lg"
                  show={isReactionPickerOpen}
                  setShow={(next) => setOpenReactionPostId(next ? post.id : null)}
                  directContent={
                    <Button
                      appearance="gray-link"
                      size="xs"
                      className="!h-7"
                      icon={emojiIconSvg}
                      aria-label="Add reaction"
                      disabled={reactMutationPending}
                      onClick={(e: React.MouseEvent) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setOpenReactionPostId((current) =>
                          current === post.id ? null : post.id
                        );
                      }}
                    />
                  }
                >
                  <PopoverContent className="flex max-w-[220px] flex-wrap gap-2 p-3">
                    {QUICK_REACTIONS.map((emoji) => (
                      <button
                        key={`${post.id}-${emoji}-picker`}
                        type="button"
                        className="rounded-full border border-[--border-color] bg-[--background-color] px-2 py-1 text-lg hover:border-[--text-muted]"
                        onClick={() => toggleReaction(post, emoji, true)}
                        disabled={reactMutationPending}
                      >
                        {emoji}
                      </button>
                    ))}
                  </PopoverContent>
                </Popover>
              );
            })()}
            <Button
              appearance="gray-link"
              size="xs"
              onClick={() => handleReply(post)}
              className="!h-7"
            >
              Reply
            </Button>
            {post.user_id === channelData?.member?.user_id && (
              <Button
                appearance="gray-link"
                size="xs"
                onClick={() => handleEdit(post)}
                className="!h-7"
              >
                Edit
              </Button>
            )}
            <Dropdown>
              <DropdownToggle>
                <Button
                  icon={dotsHorizontal}
                  appearance="gray-link"
                  size="xs"
                  className="size-7 !p-0"
                  aria-label="Message actions"
                />
              </DropdownToggle>
              <DropdownMenu align="right" size="small">
                <DropdownItemWithIcon
                  icon={mailSvg}
                  label="Open thread"
                  onClick={() => openThread(post)}
                />
                {channelData?.channel?.type !== "D" && (
                  <DropdownItemWithIcon
                    icon={linkSvg}
                    label="Copy link"
                    onClick={handleCopyLink}
                  />
                )}
                <DropdownItemWithIcon
                  icon={earthSvg}
                  label="Translate"
                  onClick={() => setShowTranslateModal(true)}
                />
                {groupedReactions.length > 0 && (
                  <DropdownItemWithIcon
                    icon={emojiIconSvg}
                    label={i18next.t("chat.reactions")}
                    onClick={() => setShowReactions(true)}
                  />
                )}
                {canPin && (
                  <DropdownItemWithIcon
                    icon={pinSvg}
                    label={post.is_pinned ? "Unpin message" : "Pin message"}
                    onClick={() => handlePinToggle(post.id, post.is_pinned ?? false)}
                    disabled={pinMutationPending}
                  />
                )}
                {(channelData?.canModerate || post.user_id === channelData?.member?.user_id) && (
                  <DropdownItemWithIcon
                    icon={deleteForeverSvg}
                    label={
                      deleteMutationPending && deletingPostId === post.id ? "Deleting…" : "Delete"
                    }
                    onClick={() => handleDelete(post)}
                    disabled={deleteMutationPending && deletingPostId === post.id}
                  />
                )}
              </DropdownMenu>
            </Dropdown>
          </div>
        )}
      </div>
      {showReactions && (
        <PeopleListModal
          show={showReactions}
          onHide={() => setShowReactions(false)}
          title={i18next.t("chat.reactions")}
          sections={groupedReactions.map((reaction) => ({
            key: reaction.emojiName,
            heading: (
              <>
                <span className="text-base leading-none">
                  {getNativeEmojiFromShortcode(reaction.emojiName) || `:${reaction.emojiName}:`}
                </span>
                <span>{reaction.userIds.length}</span>
              </>
            ),
            people: reaction.userIds.map((userId) => {
              const user = usersById[userId];
              return {
                id: userId,
                username: user?.username,
                displayName: getReactorName(userId, usersById, currentUserId)
              };
            })
          }))}
        />
      )}
      {showTranslateModal && (
        <MessageTranslate
          messageText={getDecodedDisplayMessage(post)}
          onHide={() => setShowTranslateModal(false)}
        />
      )}
    </div>
  );
}

export const MessageItem = memo(MessageItemInner, messageItemPropsAreEqual);
