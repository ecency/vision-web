"use client";

import { Button } from "@ui/button";
import { Tooltip } from "@ui/tooltip";
import i18next from "i18next";
import { useGlobalStore } from "@/core/global-store";

import { bellOffSvg, bellSvg } from "@ui/svg";
import { EcencyConfigManager } from "@/config";
import { useQuery } from "@tanstack/react-query";
import { getNotificationsUnreadCountQueryOptions } from "@ecency/sdk";
import { useActiveAccount } from "@/core/hooks";
import { getAccessToken } from "@/utils";
import { AnimationEvent, useEffect, useRef, useState } from "react";

export function NavbarNotificationsButton({ onClick }: { onClick?: () => void }) {
  const { activeUser } = useActiveAccount();
  const toggleUiProp = useGlobalStore((state) => state.toggleUiProp);
  const globalNotifications = useGlobalStore((state) => state.globalNotifications);

  const { data: unread } = useQuery(
    getNotificationsUnreadCountQueryOptions(
      activeUser?.username,
      getAccessToken(activeUser?.username ?? "")
    )
  );

  const [ringing, setRinging] = useState(false);
  // Ref guard: remembers the first unread count seen after mount so the bell
  // only rings when the count INCREASES while the page is open, never on load.
  const prevUnreadRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (typeof unread !== "number") {
      return;
    }
    const prev = prevUnreadRef.current;
    prevUnreadRef.current = unread;
    if (prev !== undefined && unread > prev) {
      setRinging(true);
    }
  }, [unread]);

  return (
    <EcencyConfigManager.Conditional
      condition={({ visionFeatures }) => visionFeatures.notifications.enabled}
    >
      <Tooltip content={i18next.t("user-nav.notifications")}>
        <div className="notifications">
          {unread > 0 && (
            // key remount re-pops the badge on every count change; playing on the
            // initial mount is intentional here (tiny client-only badge, approved
            // exception to the no-initial-animation rule)
            <span key={unread} className="notifications-badge notranslate animate-pop-in">
              {unread.toString().length < 3 ? unread : "..."}
            </span>
          )}
          <Button
            icon={globalNotifications ? bellSvg : bellOffSvg}
            // !size-6: this bell deliberately renders at 24px, diverging from the
            // Button md slot tier (20px) - preserves the retired SCSS rule's size
            iconClassName={`[&>svg]:!size-6${ringing ? " animate-bell-ring" : ""}`}
            onAnimationEnd={(e: AnimationEvent) => {
              if (e.animationName === "anim-bell-ring") {
                setRinging(false);
              }
            }}
            appearance="gray-link"
            aria-label={
              unread > 0
                ? i18next.t("user-nav.notifications-unread", {
                    count: unread,
                    defaultValue: `Notifications, ${unread} unread`
                  })
                : i18next.t("user-nav.notifications")
            }
            onClick={() => {
              toggleUiProp("notifications");
              onClick?.();
            }}
          />
        </div>
      </Tooltip>
    </EcencyConfigManager.Conditional>
  );
}
