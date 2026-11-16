"use client";

import { useState } from "react";
import i18next from "i18next";
import { Dropdown, DropdownItem, DropdownMenu, DropdownToggle } from "@ui/dropdown";
import { AccountActivities } from "@/features/shared/account-activities";

interface Props {
  username: string;
}

// bridge.account_notifications types, grouped the way the notifications panel
// labels them. Everything a community emits goes under one group; hivemind's
// `error` type belongs to no group and shows under All only.
const FILTERS = {
  rvotes: ["vote"],
  replies: ["reply", "reply_comment"],
  mentions: ["mention"],
  follows: ["follow"],
  reblogs: ["reblog"],
  communities: [
    "subscribe",
    "new_community",
    "set_role",
    "set_props",
    "set_label",
    "mute_post",
    "unmute_post",
    "pin_post",
    "unpin_post",
    "flag_post"
  ]
} as const;

type Filter = keyof typeof FILTERS;

/**
 * The account's on-chain notifications from Hive (bridge.account_notifications),
 * the same log a community's activity tab shows. Public, so it reads the same
 * for every viewer, signed in or not.
 */
export function ProfileNotifications({ username }: Props) {
  const [filter, setFilter] = useState<Filter | null>(null);

  return (
    <div className="bg-white/80 dark:bg-dark-200/90 glass-box rounded-none sm:rounded-xl w-full p-2 sm:p-4">
      <div className="flex justify-end">
        <Dropdown>
          <DropdownToggle withChevron={true} className="gap-1 [&_svg]:size-5">
            {i18next.t(`notifications.type-${filter ?? "all"}`)}
          </DropdownToggle>
          <DropdownMenu align="right">
            <DropdownItem onClick={() => setFilter(null)} selected={filter === null}>
              {i18next.t("notifications.type-all-short")}
            </DropdownItem>
            {(Object.keys(FILTERS) as Filter[]).map((f) => (
              <DropdownItem key={f} onClick={() => setFilter(f)} selected={filter === f}>
                {i18next.t(`notifications.type-${f}`)}
              </DropdownItem>
            ))}
          </DropdownMenu>
        </Dropdown>
      </div>
      <AccountActivities account={username} types={filter ? FILTERS[filter] : undefined} />
    </div>
  );
}
