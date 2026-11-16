"use client";

import { useMemo, useState } from "react";
import i18next from "i18next";
import { Dropdown, DropdownItem, DropdownMenu, DropdownToggle } from "@ui/dropdown";
import { NotificationFilter, NotificationViewType } from "@/enums";
import { NotificationList } from "@/features/shared/notifications/notification-list";
import { useActiveAccount } from "@/core/hooks/use-active-account";
import { SELF_ONLY_NOTIFICATION_CONTENT_TYPES } from "@/app/decks/_components/consts/content-types";

interface Props {
  username: string;
}

const noop = () => {};

/**
 * The notifications panel's list, for the account this profile belongs to.
 *
 * Rendered client-side only: the list endpoint is signed with the viewer's own
 * code, so there is nothing to prefetch on the server and a signed-out viewer
 * gets the panel's sign-in message. Another account's list is read-only and
 * offers only the filters its public subset can return.
 */
export function ProfileNotifications({ username }: Props) {
  const { activeUser } = useActiveAccount();
  const isOwn = activeUser?.username?.toLowerCase() === username.toLowerCase();
  const [filter, setFilter] = useState<NotificationFilter | null>(null);

  const filters = useMemo(
    () =>
      Object.values(NotificationFilter).filter(
        (f) => isOwn || !SELF_ONLY_NOTIFICATION_CONTENT_TYPES.includes(f)
      ),
    [isOwn]
  );
  const activeFilter = filter && filters.includes(filter) ? filter : null;

  return (
    <div className="notification-list bg-white/80 dark:bg-dark-200/90 glass-box rounded-none sm:rounded-xl w-full overflow-hidden">
      <div className="list-header">
        <div className="list-actions [&_svg]:size-5">
          <Dropdown>
            <DropdownToggle className="list-filter" withChevron={true}>
              {i18next.t(`notifications.type-${activeFilter ?? "all"}`)}
            </DropdownToggle>
            <DropdownMenu>
              <DropdownItem onClick={() => setFilter(null)} selected={activeFilter === null}>
                {i18next.t("notifications.type-all-short")}
              </DropdownItem>
              {filters.map((f) => (
                <DropdownItem key={f} onClick={() => setFilter(f)} selected={activeFilter === f}>
                  {i18next.t(`notifications.type-${f}`)}
                </DropdownItem>
              ))}
            </DropdownMenu>
          </Dropdown>
        </div>
      </div>
      <NotificationList
        username={username}
        standalone={true}
        filter={activeFilter ?? undefined}
        currentStatus={NotificationViewType.ALL}
        selectNotification={noop}
      />
    </div>
  );
}
