import type { MattermostPost, MattermostUser } from "../mattermost-api";
import { formatTimestamp, getUserDisplayName } from "../format-utils";
import { Modal, ModalBody } from "@ui/modal";
import { ProfileLink, UserAvatar } from "@/features/shared";
import { useState } from "react";
import { PeopleListModal } from "./people-list-modal";

interface ChannelHeaderProps {
  channelTitle: string;
  channelSubtitle: string;
  effectiveLastViewedAt: number;
  pinnedPosts: MattermostPost[] | undefined;
  onlineUsers: MattermostUser[];
  onlineCount: number;
  showOnlineUsers: boolean;
  setShowOnlineUsers: (show: boolean) => void;
  showPinnedModal: boolean;
  setShowPinnedModal: (show: boolean) => void;
  canPin: boolean;
  handlePinToggle: (postId: string, isPinned: boolean) => void;
  unpinPending: boolean;
  scrollToPost: (postId: string) => void;
  usersById: Record<string, MattermostUser>;
  getDecodedDisplayMessage: (post: MattermostPost) => string;
  showKeyboardShortcuts: boolean;
  setShowKeyboardShortcuts: (show: boolean) => void;
  onClose: () => void;
  /** Group channels: the other members, listed from the header. */
  groupMembers?: MattermostUser[];
}

export function ChannelHeader({
  channelTitle,
  channelSubtitle,
  effectiveLastViewedAt,
  pinnedPosts,
  onlineUsers,
  onlineCount,
  showOnlineUsers,
  setShowOnlineUsers,
  showPinnedModal,
  setShowPinnedModal,
  canPin,
  handlePinToggle,
  unpinPending,
  scrollToPost,
  usersById,
  getDecodedDisplayMessage,
  showKeyboardShortcuts,
  setShowKeyboardShortcuts,
  onClose,
  groupMembers
}: ChannelHeaderProps) {
  const [showMembers, setShowMembers] = useState(false);

  return (
    <div className="border-b border-[--border-color] px-4 py-2.5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-col min-w-0">
          <div className="truncate text-base font-semibold">{channelTitle}</div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-[--text-muted]">
            <span className="truncate">{channelSubtitle}</span>

            {pinnedPosts && pinnedPosts.length > 0 && (
              <button
                type="button"
                onClick={() => setShowPinnedModal(true)}
                className="flex items-center gap-1 rounded-full border border-[--border-color] px-2 py-1 text-[11px] text-[--text-muted] transition hover:border-blue-dark-sky hover:text-[--text-color]"
              >
                <span className="text-sm leading-none" aria-hidden>📌</span>
                <span>{pinnedPosts.length} pinned</span>
              </button>
            )}

            {groupMembers && groupMembers.length > 0 && (
              <button
                type="button"
                onClick={() => setShowMembers(true)}
                className="flex items-center gap-1 rounded-full border border-[--border-color] px-2 py-1 text-[11px] text-[--text-muted] transition hover:border-blue-dark-sky hover:text-[--text-color]"
              >
                <span className="text-sm leading-none" aria-hidden>👥</span>
                <span>Members</span>
              </button>
            )}

            {groupMembers && (
              <PeopleListModal
                show={showMembers}
                onHide={() => setShowMembers(false)}
                title="Members"
                sections={[
                  {
                    key: "members",
                    people: groupMembers.map((user) => ({
                      id: user.id,
                      username: user.username,
                      displayName: getUserDisplayName(user) || user.username
                    }))
                  }
                ]}
              />
            )}

            {onlineCount > 0 && (
              <button
                type="button"
                onClick={() => setShowOnlineUsers(true)}
                className="flex items-center gap-1 rounded-full border border-[--border-color] px-2 py-1 text-[11px] text-[--text-muted] transition hover:border-blue-dark-sky hover:text-[--text-color]"
              >
                <span className="text-sm leading-none" aria-hidden>🟢</span>
                <span>{onlineCount} online</span>
              </button>
            )}

            <Modal show={showOnlineUsers} onHide={() => setShowOnlineUsers(false)} centered size="sm">
              <ModalBody>
                <div className="flex items-center justify-between gap-2 pb-3">
                  <div className="flex items-center gap-2 text-sm font-semibold">
                    <span className="text-sm leading-none" aria-hidden>🟢</span>
                    <span>Online now</span>
                  </div>
                  <button type="button" onClick={() => setShowOnlineUsers(false)} className="text-[--text-muted] hover:text-[--text-color]" aria-label="Close online users">×</button>
                </div>
                <div className="max-h-80 overflow-y-auto">
                  {onlineUsers.length ? (
                    <div className="space-y-1">
                      {onlineUsers.map((user) => {
                        const displayName = getUserDisplayName(user) || user.username;
                        if (!user.username) {
                          return (
                            <div key={user.id} className="flex items-center gap-2 rounded px-2 py-1 hover:bg-[--background-color]">
                              <div className="size-7 rounded-full bg-[--background-color]" />
                              <div className="min-w-0"><div className="truncate text-sm">{displayName}</div></div>
                            </div>
                          );
                        }
                        return (
                          <ProfileLink key={user.id} username={user.username} afterClick={() => setShowOnlineUsers(false)} className="flex items-center gap-2 rounded px-2 py-1 hover:bg-[--background-color] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-dark-sky">
                            <UserAvatar username={user.username} size="small" />
                            <div className="min-w-0">
                              <div className="truncate text-sm">{displayName}</div>
                              <div className="truncate text-[11px] text-[--text-muted]">@{user.username}</div>
                            </div>
                          </ProfileLink>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="px-2 py-1 text-[11px] text-[--text-muted]">No one is online right now.</div>
                  )}
                </div>
              </ModalBody>
            </Modal>
          </div>
        </div>

        {/* Pinned Messages Modal */}
        <Modal show={showPinnedModal} onHide={() => setShowPinnedModal(false)} centered size="sm">
          <ModalBody>
            <div className="flex items-center justify-between gap-2 pb-3">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <span className="text-sm leading-none" aria-hidden>📌</span>
                <span>Pinned Messages</span>
              </div>
              <button type="button" onClick={() => setShowPinnedModal(false)} className="text-[--text-muted] hover:text-[--text-color]" aria-label="Close pinned messages">×</button>
            </div>
            <div className="max-h-80 overflow-y-auto">
              {pinnedPosts && pinnedPosts.length > 0 ? (
                <div className="space-y-2">
                  {pinnedPosts.map((post) => {
                    const author = usersById[post.user_id];
                    const displayName = author ? (getUserDisplayName(author) || author.username) : 'Unknown';
                    const messageText = getDecodedDisplayMessage(post);
                    return (
                      <div key={post.id} className="group rounded border border-[--border-color] bg-[--background-color] p-2 hover:border-blue-dark-sky cursor-pointer transition" role="button" tabIndex={0} onClick={() => { scrollToPost(post.id); setShowPinnedModal(false); }} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); scrollToPost(post.id); setShowPinnedModal(false); } }}>
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 text-xs text-[--text-muted] mb-1">
                              <span className="font-semibold text-[--text-color]">{displayName}</span>
                              <span>•</span>
                              <span>{formatTimestamp(post.create_at)}</span>
                            </div>
                            <div className="text-sm line-clamp-3 break-words">{messageText}</div>
                          </div>
                          {canPin && (
                            <button type="button" onClick={(e) => { e.stopPropagation(); handlePinToggle(post.id, true); }} disabled={unpinPending} className="opacity-0 group-hover:opacity-100 text-[--text-muted] hover:text-red-500 p-1 transition" aria-label="Unpin message" title="Unpin message">
                              {unpinPending ? '⏳' : '📌'}
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="px-2 py-4 text-center text-[11px] text-[--text-muted]">No pinned messages</div>
              )}
            </div>
          </ModalBody>
        </Modal>

        {/* Right side */}
        <div className="flex items-center gap-3 shrink-0">
          <button type="button" onClick={() => setShowKeyboardShortcuts(true)} className="text-[--text-muted] hover:text-[--text-color] p-1 text-sm" aria-label="Keyboard shortcuts" title={effectiveLastViewedAt > 0 ? `Keyboard shortcuts • Last viewed ${formatTimestamp(effectiveLastViewedAt)}` : "Keyboard shortcuts"}>⌨️</button>
          <button type="button" onClick={onClose} className="md:hidden text-[--text-muted] hover:text-[--text-color] p-1" aria-label="Close chat" title="Back to chats">✕</button>
        </div>
      </div>
    </div>
  );
}
