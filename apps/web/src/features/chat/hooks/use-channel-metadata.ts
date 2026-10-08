import { useEffect, useMemo } from "react";
import i18next from "i18next";
import type { MattermostPostsResponse, MattermostUser } from "../mattermost-api";
import { getUserDisplayName } from "../format-utils";
import { getGroupTitle } from "../group-utils";

interface UseChannelMetadataParams {
  channelId: string;
  channelData: MattermostPostsResponse | undefined;
  usersById: Record<string, MattermostUser>;
  activeUsername: string | undefined;
  channels: { channels: Array<{ id: string; type: string; name: string; display_name: string; directUser?: MattermostUser | null; groupUsers?: MattermostUser[]; [key: string]: any }> } | undefined;
  showOnlineUsers: boolean;
  setShowOnlineUsers: (show: boolean) => void;
}

export function useChannelMetadata({
  channelId,
  channelData,
  usersById,
  activeUsername,
  channels,
  showOnlineUsers,
  setShowOnlineUsers
}: UseChannelMetadataParams) {

  const directChannelFromList = useMemo(
    () => channels?.channels.find((channel) => channel.id === channelId),
    [channelId, channels?.channels]
  );

  const directChannelUser = useMemo(() => {
    const isDirect = channelData?.channel?.type === "D" || directChannelFromList?.type === "D";
    if (!isDirect) return null;

    const participantIds = (channelData?.channel?.name || directChannelFromList?.name || "").split(
      "__"
    );
    const participants = participantIds
      .map((id: string) => usersById[id])
      .filter((u): u is MattermostUser => Boolean(u));

    const participantFromList = directChannelFromList?.directUser;

    return (
      participants.find((user: MattermostUser) => user.username !== activeUsername) ||
      participantFromList ||
      participants[0] ||
      null
    );
  }, [
    activeUsername,
    channelData?.channel?.name,
    channelData?.channel?.type,
    directChannelFromList,
    usersById
  ]);

  const isGroup = channelData?.channel?.type === "G" || directChannelFromList?.type === "G";
  const groupUsers = isGroup ? directChannelFromList?.groupUsers : undefined;

  const channelTitle = useMemo(() => {
    if (directChannelUser) {
      const displayName = getUserDisplayName(directChannelUser);
      if (displayName) return displayName;
    }

    if (groupUsers?.length) {
      return getGroupTitle(groupUsers, i18next.t("chat.group"));
    }

    return (
      channelData?.channel?.display_name ||
      directChannelFromList?.display_name ||
      channelData?.channel?.name ||
      directChannelFromList?.name ||
      "Chat"
    );
  }, [
    channelData?.channel?.display_name,
    channelData?.channel?.name,
    directChannelFromList?.display_name,
    directChannelFromList?.name,
    directChannelUser,
    groupUsers
  ]);

  const channelSubtitle = useMemo(() => {
    const isDirectChannel =
      channelData?.channel?.type === "D" || directChannelFromList?.type === "D";
    if (isDirectChannel) {
      if (directChannelUser?.username) return `@${directChannelUser.username}`;
      return "Direct message";
    }

    if (isGroup) {
      const count = channelData?.memberCount ?? (groupUsers?.length ? groupUsers.length + 1 : undefined);
      return count !== undefined
        ? i18next.t("chat.channel-type-group", { count })
        : i18next.t("chat.new-group-members");
    }

    const baseName = channelData?.community ? `${channelData.community} channel` : "Channel";
    const memberCount = channelData?.memberCount;

    if (memberCount !== undefined) {
      return `${baseName} • ${memberCount} member${memberCount === 1 ? "" : "s"}`;
    }

    return baseName;
  }, [
    channelData?.channel?.type,
    channelData?.community,
    channelData?.memberCount,
    directChannelFromList?.type,
    directChannelUser?.username,
    groupUsers,
    isGroup
  ]);

  const onlineUsers = useMemo(() => {
    const uniqueIds = Array.from(new Set(channelData?.onlineUserIds ?? []));

    const getName = (user: MattermostUser) =>
      getUserDisplayName(user) || user.username || user.id;

    return uniqueIds
      .map((id) => usersById[id])
      .filter((user): user is MattermostUser => Boolean(user))
      .sort((a, b) => getName(a).localeCompare(getName(b)));
  }, [channelData?.onlineUserIds, usersById]);

  const onlineCount = onlineUsers.length;

  useEffect(() => {
    if (onlineCount === 0 && showOnlineUsers) {
      setShowOnlineUsers(false);
    }
  }, [onlineCount, showOnlineUsers]);

  return {
    directChannelFromList,
    directChannelUser,
    channelTitle,
    channelSubtitle,
    groupUsers,
    onlineUsers,
    onlineCount
  };
}
