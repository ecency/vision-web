import { UserAvatar } from "@/features/shared/user-avatar";
import type { MattermostUser } from "../mattermost-api";

interface ChannelAvatarProps {
  channel: {
    type: string;
    name: string;
    directUser?: MattermostUser | null;
    groupUsers?: MattermostUser[];
  };
}

/**
 * A direct message shows the other person, a group the first two other
 * members overlapped, anything else the channel's own avatar.
 */
export function ChannelAvatar({ channel }: ChannelAvatarProps) {
  if (channel.type === "D") {
    return channel.directUser ? (
      <UserAvatar username={channel.directUser.username} size="medium" className="size-10" />
    ) : null;
  }

  if (channel.type === "G") {
    const [first, second] = channel.groupUsers ?? [];
    if (!first) {
      return (
        <span
          className="flex size-10 items-center justify-center rounded-full bg-[--background-color] text-lg"
          aria-hidden="true"
        >
          👥
        </span>
      );
    }
    return (
      <span className="relative block size-10" aria-hidden="true">
        <UserAvatar username={first.username} size="small" className="absolute left-0 top-0 size-7" />
        {second && (
          <UserAvatar
            username={second.username}
            size="small"
            className="absolute bottom-0 right-0 size-7 ring-2 ring-[--surface-color]"
          />
        )}
      </span>
    );
  }

  return <UserAvatar username={channel.name} size="medium" className="size-10" />;
}
