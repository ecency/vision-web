import React, { type ChangeEvent, useState } from "react";
import { ChatBanInfo, formatChatBanNotice } from "../chat-ban-notice";
import { Button } from "@ui/button";
import { ImageUploadButton, UserAvatar } from "@/features/shared";
import { emojiIconSvg } from "@ui/icons";
import { EmojiPicker } from "@/features/ui/emoji-picker/lazy-emoji-picker";
import { GifPicker } from "@ui/gif-picker";
import clsx from "clsx";
import type { MattermostPost, MattermostUser } from "../mattermost-api";
import type { EmojiSuggestion } from "../emoji-utils";

type GifPickerStyle = {
  width: string;
  bottom: string;
  left: string | number;
  marginLeft: string;
  borderTopLeftRadius: string;
  borderTopRightRadius: string;
  borderBottomLeftRadius: string;
};

interface MentionSearchResult {
  users?: MattermostUser[];
}

interface MessageInputProps {
  // Message state
  message: string;
  setMessage: (message: string | ((prev: string) => string)) => void;
  messageError: string | null;
  setMessageError: (error: string | null) => void;
  /** Present while a chat ban is live; renders a standing notice instead of a transient error. */
  banInfo?: ChatBanInfo | null;
  /** Ticking clock from the owner, so the countdown re-renders instead of freezing. */
  banNow?: number;

  // Editing/Reply state
  editingPost: MattermostPost | null;
  setEditingPost: (post: MattermostPost | null) => void;
  replyingTo: MattermostPost | null;
  setReplyingTo: (post: MattermostPost | null) => void;

  // Image uploads
  uploadedImages: string[];
  removeImage: (index: number) => void;
  handleImageUploadBegin: () => void;
  handleImageUpload: (url: string) => void;
  isUploadingImage: boolean;
  isSubmitting: boolean;

  // Emoji autocomplete
  emojiQuery: string;
  setEmojiQuery: (query: string) => void;
  emojiSuggestions: EmojiSuggestion[];
  isEmojiSearchLoading: boolean;
  emojiStart: number | null;
  setEmojiStart: (start: number | null) => void;
  applyEmoji: (emojiId: string) => void;

  // Mention autocomplete
  mentionQuery: string;
  setMentionQuery: (query: string) => void;
  mentionStart: number | null;
  setMentionStart: (start: number | null) => void;
  mentionSearch: {
    data?: MentionSearchResult;
    isFetching: boolean;
  };
  applyMention: (username: string) => void;
  channelWideMentionOptions: Array<{ key: string; label: string; description: string }>;
  isChannelWideMentionQuery: boolean;

  // Channel info
  isPublicChannel: boolean;
  channelData?: {
    member?: { user_id?: string };
    canModerate?: boolean;
  };

  // Callbacks
  handleMessageChange: (e: ChangeEvent<HTMLTextAreaElement>) => void;
  submitMessage: () => void;
  handleEdit: (post: MattermostPost) => void;

  // Refs
  messageInputRef: React.MutableRefObject<HTMLTextAreaElement | null>;
  emojiButtonRef: React.MutableRefObject<HTMLButtonElement | null>;
  gifButtonRef: React.MutableRefObject<HTMLButtonElement | null>;
  gifPickerRef: React.MutableRefObject<HTMLDivElement | null>;

  // GIF picker
  showGifPicker: boolean;
  setShowGifPicker: (show: boolean | ((prev: boolean) => boolean)) => void;
  gifPickerStyle: GifPickerStyle | null;
  setGifPickerStyle: (style: GifPickerStyle | null) => void;

  // Helper functions
  getDisplayName: (post: MattermostPost) => string;
  getDecodedDisplayMessage: (post: MattermostPost) => string;
  renderMessageContent: (content: string) => React.ReactNode;

  // Posts array (for arrow up edit feature)
  posts: MattermostPost[];

  // Typing indicators
  typingUsernames?: string[];
}

export function MessageInput({
  message,
  setMessage,
  messageError,
  banInfo,
  banNow,
  setMessageError,
  editingPost,
  setEditingPost,
  replyingTo,
  setReplyingTo,
  uploadedImages,
  removeImage,
  handleImageUploadBegin,
  handleImageUpload,
  isUploadingImage,
  isSubmitting,
  emojiQuery,
  setEmojiQuery,
  emojiSuggestions,
  isEmojiSearchLoading,
  emojiStart,
  setEmojiStart,
  applyEmoji,
  mentionQuery,
  setMentionQuery,
  mentionStart,
  setMentionStart,
  mentionSearch,
  applyMention,
  channelWideMentionOptions,
  isChannelWideMentionQuery,
  isPublicChannel,
  channelData,
  handleMessageChange,
  submitMessage,
  handleEdit,
  messageInputRef,
  emojiButtonRef,
  gifButtonRef,
  gifPickerRef,
  showGifPicker,
  setShowGifPicker,
  gifPickerStyle,
  setGifPickerStyle,
  getDisplayName,
  getDecodedDisplayMessage,
  renderMessageContent,
  posts,
  typingUsernames
}: MessageInputProps) {
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);

  return (
    <>
      <form
        className="fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+72px)] z-20 flex flex-col border-t border-[--border-color] bg-white shadow-[0_-8px_24px_rgba(0,0,0,0.08)] md:sticky md:inset-x-0 md:bottom-0 md:border-t md:bg-white md:shadow-[0_-8px_24px_rgba(0,0,0,0.04)]"
        onSubmit={(e) => {
          e.preventDefault();
          submitMessage();
        }}
        aria-busy={isSubmitting}
      >
        {/* Typing indicators */}
        {typingUsernames && typingUsernames.length > 0 && (
          <div className="px-4 py-2 text-xs italic border-b border-[--border-color] bg-[--surface-color]">
            <div className="flex items-center gap-2 max-w-4xl w-full mx-auto text-[--text-muted]">
              <span className="inline-flex gap-1" aria-label="typing">
                <span className="size-1.5 rounded-full bg-[--text-muted] animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="size-1.5 rounded-full bg-[--text-muted] animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="size-1.5 rounded-full bg-[--text-muted] animate-bounce" style={{ animationDelay: '300ms' }} />
              </span>
              <span>
                {typingUsernames.length === 1 && `${typingUsernames[0]} is typing...`}
                {typingUsernames.length === 2 && `${typingUsernames[0]} and ${typingUsernames[1]} are typing...`}
                {typingUsernames.length > 2 && `${typingUsernames[0]}, ${typingUsernames[1]}, and ${typingUsernames.length - 2} other${typingUsernames.length - 2 > 1 ? 's' : ''} are typing...`}
              </span>
            </div>
          </div>
        )}

        <div className="flex flex-col gap-2 max-w-4xl w-full mx-auto px-4 py-3">
          {isSubmitting && (
            <div className="flex items-center gap-2 text-xs text-[--text-muted]">
              <span className="size-2.5 rounded-full bg-blue-500 animate-pulse" aria-hidden />
              <span>Sending…</span>
            </div>
          )}

          {editingPost && (
            <div className="rounded border border-[--border-color] bg-[--background-color] p-2 text-xs text-[--text-muted]">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-[--text-color]">Editing message</span>
                <Button
                  type="button"
                  appearance="gray-link"
                  size="xs"
                  onClick={() => {
                    setEditingPost(null);
                    setMessage("");
                    setMentionQuery("");
                    setMentionStart(null);
                    setEmojiQuery("");
                    setEmojiStart(null);
                    setMessageError(null);
                  }}
                  className="!h-6"
                >
                  Cancel
                </Button>
              </div>
              <div className="line-clamp-2 text-[--text-muted]">
                {renderMessageContent(getDecodedDisplayMessage(editingPost))}
              </div>
            </div>
          )}
          {replyingTo && (
            <div className="rounded border border-[--border-color] bg-[--background-color] p-2 text-xs text-[--text-muted]">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-[--text-color]">
                  Replying to {getDisplayName(replyingTo)}
                </span>
                <Button
                  type="button"
                  appearance="gray-link"
                  size="xs"
                  onClick={() => setReplyingTo(null)}
                  className="!h-6"
                >
                  Cancel
                </Button>
              </div>
              <div className="line-clamp-2 text-[--text-muted]">
                {renderMessageContent(getDecodedDisplayMessage(replyingTo))}
              </div>
            </div>
          )}
          {banInfo && (
            <div
              role="status"
              className="mb-2 rounded border border-[--border-color] bg-[--surface-color] p-3 text-sm text-[--text-muted]"
            >
              {formatChatBanNotice(banInfo, banNow)}
            </div>
          )}
          {messageError && <div className="text-sm text-red-500">{messageError}</div>}

          {/* Image Previews */}
          {uploadedImages.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-3">
              {uploadedImages.map((url, index) => (
                <div key={index} className="relative group">
                  <img
                    src={url}
                    alt={`Upload ${index + 1}`}
                    className="size-20 rounded-lg object-cover border border-[--border-color]"
                  />
                  <button
                    type="button"
                    onClick={() => removeImage(index)}
                    className="absolute -top-2 -right-2 size-6 rounded-full bg-red-500 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-lg hover:bg-red-600"
                    aria-label="Remove image"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="relative">
            {/* Emoji shortcode suggestions */}
            {emojiQuery && (
              <div
                className="absolute bottom-full left-0 right-0 mb-2 z-20 rounded border border-[--border-color] bg-white dark:bg-gray-800 shadow-lg"
              >
                <div className="px-3 py-2 text-xs text-[--text-muted] flex items-center justify-between">
                  <span>Type :emoji_name to insert an emoji.</span>
                  {isEmojiSearchLoading && (
                    <span className="text-[--text-muted]">Searching…</span>
                  )}
                </div>
                <div className="max-h-48 overflow-y-auto">
                  {emojiSuggestions.map((emoji) => (
                    <button
                      key={emoji.id}
                      type="button"
                      className="w-full px-3 py-2 flex items-center gap-3 hover:bg-[--background-color]"
                      onClick={() => applyEmoji(emoji.id)}
                    >
                      <span className="text-xl">{emoji.native}</span>
                      <div className="flex flex-col text-left">
                        <span className="font-semibold">:{emoji.id}:</span>
                        <span className="text-xs text-[--text-muted]">{emoji.name}</span>
                      </div>
                    </button>
                  ))}
                  {!emojiSuggestions.length && !isEmojiSearchLoading && (
                    <div className="px-3 py-2 text-sm text-[--text-muted]">No emojis found.</div>
                  )}
                </div>
              </div>
            )}

            {/* ChatGPT-style input pill */}
            <div
              className={clsx(
                "flex items-center gap-2",
                "rounded-2xl border border-[--border-color]",
                "bg-[--surface-color] px-3 py-2",
                "shadow-sm",
                "focus-within:ring-2 focus-within:ring-blue-500/60 focus-within:border-blue-500/60",
                "transition-colors"
              )}
              onClick={() => messageInputRef.current?.focus()}
            >
              <div className="flex items-center gap-1">
                <ImageUploadButton
                  size="md"
                  appearance="gray-link"
                  className="rounded-full !px-2 !py-1"
                  onBegin={handleImageUploadBegin}
                  onEnd={handleImageUpload}
                  aria-label="Attach image"
                  title="Attach image"
                  disabled={isUploadingImage || isSubmitting}
                />
                {isUploadingImage && (
                  <span className="text-xs text-[--text-muted] animate-pulse">
                    Uploading...
                  </span>
                )}
              </div>

              {/* Textarea */}
              <div className="flex-1 min-w-0">
                <textarea
                  ref={messageInputRef}
                  rows={1}
                  value={message}
                  onChange={handleMessageChange}
                  disabled={isSubmitting}
                  onKeyDown={(e) => {
                    // Arrow Up - Edit last message (when input is empty)
                    if (e.key === "ArrowUp" && !message.trim() && !editingPost && !replyingTo) {
                      const myPosts = posts.filter(
                        (post) =>
                          post.user_id === channelData?.member?.user_id &&
                          post.type !== "system_add_to_channel" &&
                          !post.root_id
                      );
                      const lastPost = myPosts[myPosts.length - 1];

                      if (lastPost) {
                        handleEdit(lastPost);
                        e.preventDefault();
                      }
                    }

                    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                      e.preventDefault();

                      const target = e.currentTarget;
                      const selectionStart = target.selectionStart ?? message.length;
                      const selectionEnd = target.selectionEnd ?? selectionStart;

                      setMessage((prev) => {
                        const nextValue =
                          prev.slice(0, selectionStart) + "\n" + prev.slice(selectionEnd);

                        requestAnimationFrame(() => {
                          target.setSelectionRange(selectionStart + 1, selectionStart + 1);
                        });

                        return nextValue;
                      });

                      return;
                    }

                    if (
                      e.key === "Enter" &&
                      !e.shiftKey &&
                      !e.nativeEvent.isComposing &&
                      !e.ctrlKey &&
                      !e.metaKey
                    ) {
                      e.preventDefault();
                      submitMessage();
                    }
                  }}
                  placeholder="Write a message"
                  className={clsx(
                    "block w-full resize-none bg-transparent",
                    "text-sm md:text-base leading-[1.4]",
                    "py-1.5",
                    "outline-none border-none",
                    "placeholder:text-[--text-muted]",
                    "disabled:cursor-not-allowed disabled:opacity-70"
                  )}
                />
              </div>

              <div className="flex items-center gap-1">
                <Button
                  ref={emojiButtonRef}
                  type="button"
                  size="sm"
                  appearance="gray-link"
                  className="rounded-full !px-2 !py-1"
                  icon={emojiIconSvg}
                  aria-label="Add emoji"
                  title="Add emoji"
                  disabled={isSubmitting}
                  onClick={(e: React.MouseEvent) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setShowEmojiPicker((prev) => !prev);
                  }}
                />

                <Button
                  ref={gifButtonRef}
                  type="button"
                  size="sm"
                  appearance="gray-link"
                  className="rounded-full !px-2 !py-1 font-semibold"
                  aria-label="Add GIF"
                  title="Add GIF"
                  disabled={isSubmitting}
                  onClick={(e: React.MouseEvent) => {
                    e.preventDefault();
                    e.stopPropagation();

                    if (gifButtonRef.current) {
                      const rect = gifButtonRef.current.getBoundingClientRect();

                      const minMargin = 8;
                      const desiredWidth = 430;
                      const pickerWidth = Math.min(
                        desiredWidth,
                        Math.max(260, window.innerWidth - minMargin * 2)
                      );

                      // Distance from button's bottom to viewport bottom -> picker sits just above the button
                      const bottomPx = window.innerHeight - rect.bottom + minMargin;

                      // Align picker's right edge with the trigger while clamping on screen
                      const rawLeft = rect.right - pickerWidth;
                      const leftPx = Math.min(
                        Math.max(minMargin, rawLeft),
                        window.innerWidth - pickerWidth - minMargin
                      );

                      setGifPickerStyle({
                        width: `${pickerWidth}px`,
                        bottom: `${bottomPx}px`,
                        left: leftPx,
                        marginLeft: "0",
                        borderTopLeftRadius: "12px",
                        borderTopRightRadius: "12px",
                        borderBottomLeftRadius: "12px"
                      });
                    }

                    setShowGifPicker((prev) => !prev);
                  }}
                >
                  GIF
                </Button>
              </div>
            </div>
          </div>

          {isPublicChannel && mentionQuery && (
            <div
              className="absolute bottom-full left-0 right-0 mb-2 z-20 rounded border border-[--border-color] bg-white dark:bg-gray-800 shadow-sm"
            >
              <div className="px-3 py-2 text-xs text-[--text-muted] flex items-center justify-between">
                <span>Use @ to mention users. Selecting will invite them to this channel.</span>
                {mentionSearch.isFetching && (
                  <span className="text-[--text-muted]">Searching…</span>
                )}
              </div>
              <div className="max-h-48 overflow-y-auto">
                {channelData?.canModerate && channelWideMentionOptions.length > 0 && (
                  <>
                    <div className="px-3 pt-2 text-xs font-semibold text-[--text-muted]">
                      Channel-wide mentions
                    </div>
                    {channelWideMentionOptions.map((mention) => (
                      <button
                        key={mention.key}
                        type="button"
                        className="w-full px-3 py-2 flex items-center gap-3 hover:bg-[--background-color]"
                        onClick={() => applyMention(mention.key)}
                      >
                        <div className="flex flex-col text-left">
                          <span className="font-semibold">{mention.label}</span>
                          <span className="text-xs text-[--text-muted]">
                            {mention.description}
                          </span>
                        </div>
                      </button>
                    ))}
                    <div className="border-t border-[--border-color]" />
                  </>
                )}
                {!channelData?.canModerate && isChannelWideMentionQuery && (
                  <div className="px-3 py-2 text-xs text-[--text-muted]">
                    Channel-wide mentions (@here, @everyone) are limited to community moderators.
                  </div>
                )}
                {mentionQuery.length < 2 && (
                  <div className="px-3 py-2 text-sm text-[--text-muted]">
                    Keep typing to search for a user.
                  </div>
                )}
                {mentionSearch.data?.users?.map((user) => (
                  <button
                    key={user.id}
                    type="button"
                    className="w-full px-3 py-2 flex items-center gap-3 hover:bg-[--background-color]"
                    onClick={() => applyMention(user.username)}
                  >
                    <UserAvatar username={user.username} size="medium" className="size-8" />
                    <div className="flex flex-col text-left">
                      <span className="font-semibold">@{user.username}</span>
                      {(user.nickname || user.first_name || user.last_name) && (
                        <span className="text-xs text-[--text-muted]">
                          {[user.first_name, user.last_name].filter(Boolean).join(" ") ||
                            user.nickname}
                        </span>
                      )}
                    </div>
                  </button>
                ))}
                {!mentionSearch.isFetching &&
                  mentionQuery.length >= 2 &&
                  !mentionSearch.data?.users?.length && (
                    <div className="px-3 py-2 text-sm text-[--text-muted]">No users found.</div>
                  )}
              </div>
            </div>
          )}
        </div>
      </form>
      {showEmojiPicker && (
        <EmojiPicker
          show={showEmojiPicker}
          changeState={(state) => setShowEmojiPicker(state)}
          onSelect={(emoji: string) => {
            setMessage((prev) => prev + emoji);
          }}
          buttonRef={emojiButtonRef}
          position="top"
        />
      )}
      {showGifPicker && gifPickerStyle && (
        <GifPicker
          rootRef={gifPickerRef}
          shGif={showGifPicker}
          changeState={(state) => setShowGifPicker(state ?? false)}
          fallback={(gifUrl) => {
            setMessage((prev) => (prev ? `${prev}\n${gifUrl}` : gifUrl));
          }}
          style={gifPickerStyle}
        />
      )}
    </>
  );
}
