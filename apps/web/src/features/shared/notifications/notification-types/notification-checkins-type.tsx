import React, { ReactElement } from "react";
import i18next from "i18next";
import { ApiCheckinNotification, ApiCheckinsNotification } from "@/entities";

type CheckinNotification = ApiCheckinsNotification | ApiCheckinNotification;

interface Props {
  sourceLink: ReactElement;
  notification: CheckinNotification;
}

export function NotificationCheckinsType({ sourceLink, notification }: Props) {
  const count = notification.count ?? 0;
  // `target` only exists on the websocket payload (BaseWsNotification), not on
  // the REST notification list. Read it defensively and fall back to the
  // notification source — the account the streak belongs to — so the title
  // never renders as a bare "@".
  const username = (notification as { target?: string }).target ?? notification.source;

  return (
    <div className="item-content">
      <div className="first-line">
        {sourceLink}
        <span className="item-action">
          {i18next.t("notifications.checkins-title", { username })}
        </span>
      </div>
      <div className="second-line">
        {i18next.t("notification.checkins", { count })}
      </div>
    </div>
  );
}
