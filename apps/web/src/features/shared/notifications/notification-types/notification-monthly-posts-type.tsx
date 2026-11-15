import React, { ReactElement } from "react";
import i18next from "i18next";
import { ApiMonthlyPostsNotification } from "@/entities";

interface Props {
  sourceLink: ReactElement;
  notification: ApiMonthlyPostsNotification;
}

export function NotificationMonthlyPostsType({ sourceLink, notification }: Props) {
  const count = notification.count ?? 0;
  const body =
    count > 0
      ? i18next.t("notification.monthly-posts", { count })
      : notification.title;

  return (
    <div className="item-content">
      <div className="first-line">
        {sourceLink}
        <span className="item-action">
          {i18next.t("notifications.monthly-posts-title", { username: notification.source })}
        </span>
      </div>
      {body && <div className="second-line">{body}</div>}
    </div>
  );
}
