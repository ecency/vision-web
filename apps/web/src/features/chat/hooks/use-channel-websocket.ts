import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { QueryClient } from "@tanstack/react-query";
import type { MattermostPost, MattermostPostsResponse } from "../mattermost-api";
import { MattermostWebSocket } from "../mattermost-websocket";
import { getUserDisplayName } from "../format-utils";
import type { MattermostUser } from "../mattermost-api";

interface OnPostedConfirmPayload {
  post: MattermostPost;
}

interface UseChannelWebSocketParams {
  channelId: string;
  queryClient: QueryClient;
  /** Current user's Mattermost ID (read dynamically to avoid recreating WS) */
  getCurrentUserId: () => string | undefined;
  /** Called when our own sent message is confirmed via WebSocket */
  onPostedConfirm: (payload: OnPostedConfirmPayload) => void;
  /** Refs from usePendingPosts for matching posted events */
  pendingPostRefs: {
    lastSentPendingIdRef: React.MutableRefObject<string | null>;
    lastSentMessageRef: React.MutableRefObject<string | null>;
    lastSentRootIdRef: React.MutableRefObject<string | null>;
    lastSentAtRef: React.MutableRefObject<number>;
    confirmedPendingPostIdsRef: React.MutableRefObject<Set<string>>;
    pendingAbortControllerRef: React.MutableRefObject<AbortController | null>;
    sendMutationRef: React.MutableRefObject<{ reset: () => void }>;
  };
  usersById: Record<string, MattermostUser>;
}

const TYPING_TIMEOUT = 5000;
const TYPING_RECONNECT_INTERVAL = 5000;

export function useChannelWebSocket({
  channelId,
  queryClient,
  getCurrentUserId,
  onPostedConfirm,
  pendingPostRefs,
  usersById,
  setIsWebSocketActive,
  setReconnectAttempt,
  setReconnectDelay,
  isWebSocketActive
}: UseChannelWebSocketParams & {
  setIsWebSocketActive: (active: boolean) => void;
  setReconnectAttempt: (attempt: number | null) => void;
  setReconnectDelay: (delay: number | null) => void;
  isWebSocketActive: boolean;
}) {
  const [typingUsers, setTypingUsers] = useState<Map<string, number>>(new Map());
  const websocketRef = useRef<MattermostWebSocket | null>(null);

  // Ref bridges to avoid recreating WebSocket on callback changes
  const onPostedConfirmRef = useRef(onPostedConfirm);
  onPostedConfirmRef.current = onPostedConfirm;
  const getCurrentUserIdRef = useRef(getCurrentUserId);
  getCurrentUserIdRef.current = getCurrentUserId;
  const pendingPostRefsRef = useRef(pendingPostRefs);
  pendingPostRefsRef.current = pendingPostRefs;
  const setIsWebSocketActiveRef = useRef(setIsWebSocketActive);
  setIsWebSocketActiveRef.current = setIsWebSocketActive;
  const setReconnectAttemptRef = useRef(setReconnectAttempt);
  setReconnectAttemptRef.current = setReconnectAttempt;
  const setReconnectDelayRef = useRef(setReconnectDelay);
  setReconnectDelayRef.current = setReconnectDelay;

  // WebSocket initialization
  useEffect(() => {
    if (!channelId) return;

    try {
      const ws = new MattermostWebSocket()
        .withChannel(channelId)
        .withQueryClient(queryClient)
        .onConnectionChange((active) => {
          setIsWebSocketActiveRef.current(active);
          if (active) {
            setReconnectAttemptRef.current(null);
            setReconnectDelayRef.current(null);
          }
        })
        .onReconnecting((attempt, delay) => {
          setReconnectAttemptRef.current(attempt);
          setReconnectDelayRef.current(delay);
        })
        .onTyping((userId) => {
          const currentUserId = getCurrentUserIdRef.current();
          if (userId === currentUserId) return;
          setTypingUsers(prev => new Map(prev).set(userId, Date.now()));
        })
        .onPosted((post) => {
          // their message is here, so they are no longer typing it
          setTypingUsers((prev) => {
            if (!prev.has(post.user_id)) return prev;
            const next = new Map(prev);
            next.delete(post.user_id);
            return next;
          });
          const refs = pendingPostRefsRef.current;
          const currentUserId = getCurrentUserIdRef.current();
          const pendingPostId = post.pending_post_id;
          const pendingMatch =
            pendingPostId &&
            pendingPostId === refs.lastSentPendingIdRef.current;
          const fallbackMatch =
            !pendingPostId &&
            (!currentUserId || post.user_id === currentUserId) &&
            refs.lastSentMessageRef.current !== null &&
            post.message?.replace(/\r\n/g, "\n") ===
              refs.lastSentMessageRef.current.replace(/\r\n/g, "\n") &&
            (post.root_id ?? null) === (refs.lastSentRootIdRef.current ?? null) &&
            Math.abs(post.create_at - refs.lastSentAtRef.current) < 30000;

          if (pendingMatch || fallbackMatch) {
            const confirmedId = refs.lastSentPendingIdRef.current;
            if (confirmedId) {
              refs.confirmedPendingPostIdsRef.current.add(confirmedId);
            }
            onPostedConfirmRef.current({ post });
            refs.lastSentPendingIdRef.current = null;
            refs.lastSentMessageRef.current = null;
            refs.lastSentRootIdRef.current = null;
            refs.lastSentAtRef.current = 0;
            if (refs.pendingAbortControllerRef.current) {
              refs.pendingAbortControllerRef.current.abort();
              refs.pendingAbortControllerRef.current = null;
            }
            refs.sendMutationRef.current.reset();
          }
        });

      websocketRef.current = ws;
      ws.connect().catch((error) => {
        console.error("Failed to connect chat WebSocket:", error);
        websocketRef.current = null;
      });
    } catch (error) {
      console.error("Failed to initialize chat WebSocket:", error);
    }

    return () => {
      if (websocketRef.current) {
        websocketRef.current.disconnect();
        websocketRef.current = null;
      }
    };
  }, [channelId, queryClient]);

  // Typing indicators auto-cleanup
  useEffect(() => {
    const interval = setInterval(() => {
      setTypingUsers(prev => {
        const now = Date.now();
        const updated = new Map(prev);
        let changed = false;

        updated.forEach((timestamp, userId) => {
          if (now - timestamp > TYPING_TIMEOUT) {
            updated.delete(userId);
            changed = true;
          }
        });

        return changed ? updated : prev;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  // Someone typing who has no message on the loaded page (Esie answering the first question in a
  // new DM) is unknown here: the caller looks them up, until then they cannot be named
  const unknownTypingUserIds = useMemo(
    () => Array.from(typingUsers.keys()).filter((userId) => !usersById[userId]).sort(),
    [typingUsers, usersById]
  );

  // Compute typing usernames for display
  const typingUsernames = useMemo(() => {
    return Array.from(typingUsers.keys())
      .map(userId => usersById[userId])
      .filter(Boolean)
      .map(user => getUserDisplayName(user) || user.username)
      .slice(0, 3);
  }, [typingUsers, usersById]);

  // Sent at once: sendTyping already sends at most one event every few seconds, while waiting for a
  // pause meant someone typing steadily never showed as typing to the other side.
  // Typing into a dropped connection retries it, but not on every keystroke.
  const lastReconnectKickRef = useRef(0);
  const sendTypingDebounced = useCallback(() => {
    const ws = websocketRef.current;
    if (!ws) return;
    if (!isWebSocketActive) {
      const now = Date.now();
      if (now - lastReconnectKickRef.current < TYPING_RECONNECT_INTERVAL) return;
      lastReconnectKickRef.current = now;
      ws.connect();
    }
    ws.sendTyping(channelId);
  }, [channelId, isWebSocketActive]);

  return {
    typingUsernames,
    unknownTypingUserIds,
    sendTypingDebounced,
    websocketRef
  };
}
