import { Button } from "@ui/button";
import { UserAvatar } from "@/features/shared";
import { formatRelativeTime, getAvatarUrl } from "../format-utils";
import type { MattermostPost, MattermostUser } from "../mattermost-api";
import clsx from "clsx";

interface ThreadPanelProps {
  threadRootId: string | null;
  threadRootPost: MattermostPost | null;
  threadPosts: MattermostPost[];
  usersById: Record<string, MattermostUser>;
  getDisplayName: (post: MattermostPost) => string;
  getUsername: (post: MattermostPost) => string | undefined;
  renderMessageContent: (content: string) => React.ReactNode;
  getDecodedDisplayMessage: (post: MattermostPost) => string;
  scrollToPost: (postId: string) => void;
  onClose: () => void;
}

export function ThreadPanel({
  threadRootId,
  threadRootPost,
  threadPosts,
  usersById,
  getDisplayName,
  getUsername,
  renderMessageContent,
  getDecodedDisplayMessage,
  scrollToPost,
  onClose
}: ThreadPanelProps) {
  if (!threadRootId) return null;

  return (
    <div className="flex w-full flex-col rounded border border-[--border-color] bg-[--surface-color] p-4 min-h-0">
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-col">
          <span className="text-sm font-semibold text-[--text-color]">Thread</span>
          {threadRootPost && (
            <span
              className="text-xs md:text-[11px] text-[--text-muted] cursor-help"
              title={new Date(threadRootPost.create_at).toLocaleString()}
            >
              Started by {getDisplayName(threadRootPost)} •{" "}
              {formatRelativeTime(threadRootPost.create_at)}
            </span>
          )}
        </div>
        <Button appearance="gray-link" size="xs" onClick={onClose} className="!h-7">
          Close
        </Button>
      </div>

      <div className="mt-3 flex-1 overflow-y-auto space-y-2">
        {threadPosts.length ? (
          threadPosts.map((post) => (
            <div
              key={`${post.id}-thread`}
              className={clsx(
                "rounded border border-[--border-color] bg-[--background-color] p-3",
                post.id === threadRootId &&
                  "border-blue-dark-sky bg-blue-duck-egg dark:border-blue-dusk dark:bg-dark-default"
              )}
            >
              <div className="flex items-start gap-3">
                <div className="size-8 flex-shrink-0">
                  {(() => {
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
                  })()}
                </div>
                <div className="flex flex-col gap-1 w-full">
                  <div className="flex items-center gap-2 text-sm md:text-xs text-[--text-muted]">
                    <span className="font-semibold text-[--text-color]">
                      {getDisplayName(post)}
                    </span>
                    <span
                      className="text-[--text-muted] cursor-help"
                      title={new Date(post.create_at).toLocaleString()}
                    >
                      {formatRelativeTime(post.create_at)}
                    </span>
                    {!!post.edit_at && post.edit_at > post.create_at && (
                      <span
                        className="text-xs md:text-[11px] text-[--text-muted] cursor-help"
                        title={`Edited ${new Date(post.edit_at).toLocaleString()}`}
                      >
                        • Edited {formatRelativeTime(post.edit_at)}
                      </span>
                    )}
                  </div>
                  <div className="flex flex-col gap-1">
                    <div
                      className="rounded bg-[--surface-color] p-2.5 text-base md:text-sm whitespace-pre-wrap break-words space-y-1 [&>*]:m-0"
                    >
                      {renderMessageContent(getDecodedDisplayMessage(post))}
                    </div>
                    <div className="flex flex-wrap gap-1">
                      <Button
                        appearance="gray-link"
                        size="xs"
                        className="!h-7"
                        onClick={() => scrollToPost(post.id)}
                      >
                        Jump to message
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))
        ) : (
          <div className="text-sm text-[--text-muted]">No messages in this thread yet.</div>
        )}
      </div>
    </div>
  );
}
