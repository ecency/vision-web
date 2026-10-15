import clsx from "clsx";
import {
  Dropdown,
  DropdownItemWithIcon,
  DropdownMenu,
  DropdownToggle
} from "@ui/dropdown";
import { blogSvg, mailSvg } from "@ui/svg";
import type { MattermostUser } from "../mattermost-api";

interface MentionTokenProps {
  username: string;
  user?: MattermostUser;
  currentUsername?: string;
  onStartDm: (username: string) => void;
}

export function MentionToken({
  username,
  user,
  currentUsername,
  onStartDm
}: MentionTokenProps) {
  const secondary =
    [user?.first_name, user?.last_name].filter(Boolean).join(" ") || user?.nickname;
  const isSelf = currentUsername
    ? username.toLowerCase() === currentUsername.toLowerCase()
    : false;
  const isSpecialMention = ["here", "everyone"].includes(username.toLowerCase());

  if (isSpecialMention) {
    return (
      <span
        className={clsx(
          "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-sm font-semibold",
          "cursor-default bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-200"
        )}
      >
        @{username}
      </span>
    );
  }

  return (
    <Dropdown className="inline-block">
      <DropdownToggle as="span">
        <span
          className={clsx(
            "inline-flex cursor-pointer items-center gap-1 rounded-full px-2 py-0.5 text-sm font-semibold",
            "bg-blue-50 text-blue-700 hover:bg-blue-100 dark:bg-blue-500/10 dark:text-blue-200"
          )}
          title={secondary || `@${username}`}
        >
          @{username}
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
}
