import { useActiveAccount } from "@/core/hooks/use-active-account";
import { User } from "@/entities";
import { UserAvatar } from "@/features/shared/user-avatar";
import { UilTrash } from "@tooni/iconscout-unicons-react";
import { Button } from "@ui/button";
import { PopoverConfirm } from "@ui/popover-confirm";
import { classNameObject } from "@ui/util";
import i18next from "i18next";
import React, { useRef, useState } from "react";
import { useDeleteUserFromList, useUserSelect } from "./hooks";
import { LoginTypeBadge } from "./login-type-badge";

interface Props {
  user: User;
  compact?: boolean;
}

export function LoginUserItem({ user, compact = false }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);

  const { activeUser } = useActiveAccount();

  const [showDelete, setShowDelete] = useState(false);

  const { mutateAsync: select } = useUserSelect(user);
  const deleteUser = useDeleteUserFromList(user);

  return (
    <div
      ref={containerRef}
      className={classNameObject({
        "flex items-center pointer rounded-full p-2 relative gap-2": true,
        "border border-[--border-color] hover:bg-gray-100 dark:hover:bg-dark-default duration-300":
          true,
        "text-sm h-[46px]": compact,
        "text-base": !compact,
        active: !!activeUser && activeUser.username === user.username
      })}
      role="button"
      tabIndex={0}
      onClick={() => select()}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          select();
        }
      }}
      onMouseEnter={() => setShowDelete(true)}
      onMouseLeave={() => setShowDelete(false)}
    >
      <div className="relative flex-shrink-0">
        <UserAvatar username={user.username} size={compact ? "small" : "medium"} />
        <LoginTypeBadge username={user.username} loginType={user.loginType} compact={compact} />
        {activeUser?.username === user.username && (
          <div className="rounded-full absolute left-0 bottom-0 p-0.5 bg-white dark:bg-dark-200">
            <div className="bg-green size-2 rounded-full" />
          </div>
        )}
      </div>
      <span className="username max-w-full truncate">@{user.username}</span>
      <div className="flex-spacer" />
      {showDelete && (
        <PopoverConfirm
          onConfirm={() => deleteUser()}
          placement="left"
          trigger="click"
          containerRef={containerRef}
        >
          <Button appearance="gray-link" size="sm" type="button" icon={<UilTrash />} aria-label={i18next.t("g.delete", { defaultValue: "Delete" })} />
        </PopoverConfirm>
      )}
    </div>
  );
}
