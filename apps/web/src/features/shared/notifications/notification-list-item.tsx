import React, { memo, useEffect, useMemo, useRef, useState } from "react";
import { ApiNotification } from "@/entities";
import { ProBadge } from "@/features/pro";
import { NotificationReferralType } from "@/features/shared/notifications/notification-types/notification-referral-type";
import { NotificationInactiveType } from "@/features/shared/notifications/notification-types/notification-inactive-type";
import { NotificationSpinType } from "@/features/shared/notifications/notification-types/notification-spin-type";
import { NotificationDelegationsType } from "@/features/shared/notifications/notification-types/notification-delegations-type";
import { NotificationTransferType } from "@/features/shared/notifications/notification-types/notification-transfer-type";
import { NotificationReblogType } from "@/features/shared/notifications/notification-types/notification-reblog-type";
import { NotificationFollowType } from "@/features/shared/notifications/notification-types/notification-follow-type";
import { NotificationBookmarkType } from "@/features/shared/notifications/notification-types/notification-bookmark-type";
import { NotificationFavouriteType } from "@/features/shared/notifications/notification-types/notification-favourite-type";
import { NotificationMentionType } from "@/features/shared/notifications/notification-types/notification-mention-type";
import { NotificationReplyType } from "@/features/shared/notifications/notification-types/notification-reply-type";
import { NotificationVoteType } from "@/features/shared/notifications/notification-types/notification-vote-type";
import { NotificationCheckinsType } from "@/features/shared/notifications/notification-types/notification-checkins-type";
import { NotificationPayoutsType } from "@/features/shared/notifications/notification-types/notification-payouts-type";
import { NotificationMonthlyPostsType } from "@/features/shared/notifications/notification-types/notification-monthly-posts-type";
import { NotificationAccountUpdateType } from "@/features/shared/notifications/notification-types/notification-account-update-type";
import { NotificationWeeklyEarningsType } from "@/features/shared/notifications/notification-types/notification-weekly-earnings-type";
import { NotificationScheduledPublishedType } from "@/features/shared/notifications/notification-types/notification-scheduled-published-type";
import i18next from "i18next";
import { Tooltip } from "@ui/tooltip";
import { classNameObject } from "@ui/util";
import { ProfileLink, UserAvatar } from "@/features/shared";
import { useGlobalStore } from "@/core/global-store";
import { useMarkNotificationsMutation } from "@/api/sdk-mutations";
import { usePrevious } from "react-use";
import { FormControl } from "@ui/input";
import { getNotificationImage } from "@/features/shared/notifications/utils";

interface Props {
  notification: ApiNotification;
  entry?: ApiNotification;
  isSelect?: boolean;
  setSelectedNotifications?: (d: string) => void;
  onMounted?: () => void;
  className?: string;
  onLinkClick?: () => void;
  openLinksInNewTab?: boolean;
  // True when this row is rendered inside a deck column, which is narrow and has
  // no notifications dropdown to toggle.
  isDeck?: boolean;
}

export const NotificationListItem = memo(function NotificationListItem({
  notification: primaryNotification,
  entry,
  isSelect,
  className,
  openLinksInNewTab = false,
  onLinkClick,
  setSelectedNotifications,
  onMounted,
  isDeck = false
}: Props) {
  const toggleUIProp = useGlobalStore((state) => state.toggleUiProp);

  const [isChecked, setIsChecked] = useState(false);
  const previousIsSelect = usePrevious(isSelect);

  const notification = useMemo(() => primaryNotification || entry, [primaryNotification, entry]);

  const imageUrl = useMemo(() => getNotificationImage(notification!), [notification]);

  const markNotifications = useMarkNotificationsMutation();

  const onMountedRef = useRef(onMounted);
  onMountedRef.current = onMounted;

  useEffect(() => {
    onMountedRef.current?.();
  }, []);

  useEffect(() => {
    if (previousIsSelect !== isSelect && !isSelect) {
      setIsChecked(false);
    }
  }, [isSelect, previousIsSelect]);

  const markAsRead = () => {
    if (notification!.read === 0) {
      markNotifications.mutateAsync({ id: notification!.id });
    }
  };

  const afterClick = () => {
    // A deck column has no notifications dropdown to close, and opening the
    // navbar one on top of the deck is not what the click asked for. The other
    // deck columns already opt out of this via entry.toggleNotNeeded.
    if (!isDeck && !(entry && (entry as any).toggleNotNeeded)) {
      toggleUIProp("notifications");
    }
    markAsRead();
  };

  const handleChecked = (id: string) => {
    if (isSelect) {
      setIsChecked(!isChecked);
      setSelectedNotifications?.(id);
    }
  };

  const sourceLinkMain = (
    <ProfileLink
      username={notification.source}
      afterClick={afterClick}
      target={openLinksInNewTab ? "_blank" : undefined}
    >
      <UserAvatar username={notification?.source} size="medium" />
    </ProfileLink>
  );
  const sourceLink = (
    <ProfileLink
      username={notification.source}
      afterClick={afterClick}
      target={openLinksInNewTab ? "_blank" : undefined}
    >
      <span className="source-name">@{notification.source}</span>
      {/* mr, not ml: .source-name already carries the leading gap, and the action text
          ("reblogged", "replied", ...) follows immediately with no margin of its own. */}
      <ProBadge username={notification.source} className="mr-1" />
    </ProfileLink>
  );

  return (
    <div
      title={notification.timestamp}
      className={classNameObject({
        "list-item": true,
        "not-read": notification.read === 0,
        [className ?? ""]: !!className
      })}
      role="button"
      tabIndex={0}
      onClick={() => handleChecked(notification!.id)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          handleChecked(notification!.id);
        }
      }}
      key={notification.id}
    >
      <div className={`item-inner ${isDeck ? "p-2 m-0" : ""}`}>
        <div className="flex w-full">
          <div className="source pt-0.5">{sourceLinkMain}</div>

          {(notification.type === "vote" || notification.type === "unvote") && (
            <NotificationVoteType
              onLinkClick={onLinkClick}
              sourceLink={sourceLink}
              afterClick={afterClick}
              notification={notification}
              openLinksInNewTab={openLinksInNewTab}
            />
          )}
          {notification.type === "reply" && (
            <NotificationReplyType
              onLinkClick={onLinkClick}
              sourceLink={sourceLink}
              afterClick={afterClick}
              notification={notification}
              openLinksInNewTab={openLinksInNewTab}
            />
          )}
          {notification.type === "mention" && (
            <NotificationMentionType
              onLinkClick={onLinkClick}
              sourceLink={sourceLink}
              afterClick={afterClick}
              notification={notification}
              openLinksInNewTab={openLinksInNewTab}
            />
          )}
          {notification.type === "favorites" && (
            <NotificationFavouriteType
              onLinkClick={onLinkClick}
              sourceLink={sourceLink}
              afterClick={afterClick}
              notification={notification}
              openLinksInNewTab={openLinksInNewTab}
            />
          )}
          {notification.type === "bookmarks" && (
            <NotificationBookmarkType
              onLinkClick={onLinkClick}
              sourceLink={sourceLink}
              afterClick={afterClick}
              notification={notification}
              openLinksInNewTab={openLinksInNewTab}
            />
          )}
          {(notification.type === "follow" ||
            notification.type === "unfollow" ||
            notification.type === "ignore") && (
            <NotificationFollowType sourceLink={sourceLink} notification={notification} />
          )}
          {notification.type === "reblog" && (
            <NotificationReblogType
              onLinkClick={onLinkClick}
              sourceLink={sourceLink}
              notification={notification}
              afterClick={afterClick}
              openLinksInNewTab={openLinksInNewTab}
            />
          )}
          {notification.type === "transfer" && (
            <NotificationTransferType sourceLink={sourceLink} notification={notification} />
          )}
          {notification.type === "delegations" && (
            <NotificationDelegationsType sourceLink={sourceLink} notification={notification} />
          )}
          {(notification.type === "checkins" || notification.type === "checkin") && (
            <NotificationCheckinsType sourceLink={sourceLink} notification={notification} />
          )}
          {notification.type === "payouts" && (
            <NotificationPayoutsType
              onLinkClick={onLinkClick}
              sourceLink={sourceLink}
              afterClick={afterClick}
              notification={notification}
              openLinksInNewTab={openLinksInNewTab}
            />
          )}
          {(notification.type === "monthly-posts" || notification.type === "monthly_posts") && (
            <NotificationMonthlyPostsType sourceLink={sourceLink} notification={notification} />
          )}
          {notification.type === "spin" && (
            <NotificationSpinType
              sourceLink={sourceLink}
              afterClick={afterClick}
              openLinksInNewTab={openLinksInNewTab}
            />
          )}
          {notification.type === "inactive" && <NotificationInactiveType sourceLink={sourceLink} />}
          {notification.type === "referral" && <NotificationReferralType sourceLink={sourceLink} />}
          {notification.type === "account_update" && (
            <NotificationAccountUpdateType sourceLink={sourceLink} notification={notification} />
          )}
          {notification.type === "weekly_earnings" && (
            <NotificationWeeklyEarningsType sourceLink={sourceLink} notification={notification} />
          )}
          {notification.type === "scheduled_published" && (
            <NotificationScheduledPublishedType
              onLinkClick={onLinkClick}
              sourceLink={sourceLink}
              afterClick={afterClick}
              notification={notification}
              openLinksInNewTab={openLinksInNewTab}
            />
          )}
          {![
            "vote", "unvote", "reply", "mention", "favorites", "bookmarks",
            "follow", "unfollow", "ignore", "reblog", "transfer", "delegations",
            "checkins", "checkin", "payouts", "monthly-posts", "monthly_posts",
            "spin", "inactive", "referral", "account_update", "weekly_earnings",
            "scheduled_published"
          ].includes(notification.type) && (
            <div className="item-content">
              <div className="first-line">
                {sourceLink}
                <span className="item-action opacity-75">
                  {notification.type.replace(/[_-]/g, " ")}
                </span>
              </div>
            </div>
          )}

          {/* Decorative: the row's type component already carries the post link. */}
          {imageUrl && !isDeck && (
            <div className="item-image">
              <img src={imageUrl} alt="" loading="lazy" />
            </div>
          )}
        </div>

        {isSelect ? (
          <div className="checkbox">
            <FormControl type="checkbox" checked={isChecked} onChange={() => {}} />
          </div>
        ) : (
          <div className={`item-control ${isDeck ? "item-control-deck" : ""}`}>
            {notification.read === 0 && (
              <Tooltip content={i18next.t("notifications.mark-read")}>
                <span
                  role="button"
                  tabIndex={0}
                  aria-label={i18next.t("notifications.mark-read")}
                  onClick={() => markAsRead()}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      markAsRead();
                    }
                  }}
                  className="mark-read"
                />
              </Tooltip>
            )}
          </div>
        )}
      </div>
    </div>
  );
});
