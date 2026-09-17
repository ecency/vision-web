import { EcencyConfigManager } from "@/config";
import { useActiveAccount } from "@/core/hooks/use-active-account";
import { useGlobalStore } from "@/core/global-store";
import { WalletBadge } from "@/features/shared";
import { NavbarMainSidebar } from "@/features/shared/navbar/navbar-main-sidebar";
import { getNotificationsUnreadCountQueryOptions } from "@ecency/sdk";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@ui/button";
import { bellSvg, rocketSvg } from "@ui/svg";
import { useState } from "react";

import { getAccessToken } from "@/utils";
import i18next from "i18next";
import { dotsMenuIconSvg, walletIconSvg } from "@ui/icons";

interface Props {
  setShowPurchaseDialog: (v: boolean) => void;
}

export const DeckToolbarBaseActions = ({ setShowPurchaseDialog }: Props) => {
  const { activeUser } = useActiveAccount();
  const toggleUIProp = useGlobalStore((s) => s.toggleUiProp);

  const { data: unread = 0 } = useQuery(
    getNotificationsUnreadCountQueryOptions(
      activeUser?.username,
      getAccessToken(activeUser?.username ?? "")
    )
  );

  const [showMainSide, setShowMainSide] = useState(false);

  return (
    <div className="base-actions [&_svg]:size-6">
      {activeUser && (
        <>
          <EcencyConfigManager.Conditional
            condition={({ visionFeatures }) => visionFeatures.notifications.enabled}
          >
            <div
              className="notifications"
              role="button"
              tabIndex={0}
              aria-label={i18next.t("notifications.title", { defaultValue: "Notifications" })}
              onClick={() => toggleUIProp("notifications")}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  toggleUIProp("notifications");
                }
              }}
            >
              {unread > 0 && (
                <span className="notifications-badge notranslate">
                  {unread.toString().length < 3 ? unread : "..."}
                </span>
              )}
              {bellSvg}
            </div>
          </EcencyConfigManager.Conditional>
          <EcencyConfigManager.Conditional
            condition={({ visionFeatures }) => visionFeatures.perks.enabled}
          >
            <div
              role="button"
              tabIndex={0}
              aria-label={i18next.t("perks.title", { defaultValue: "Perks" })}
              onClick={() => setShowPurchaseDialog(true)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setShowPurchaseDialog(true);
                }
              }}
            >
              {rocketSvg}
            </div>
          </EcencyConfigManager.Conditional>
          <WalletBadge icon={walletIconSvg} />
        </>
      )}
      <Button appearance="link" onClick={() => setShowMainSide(true)} style={{ height: "56px" }}>
        {dotsMenuIconSvg}
      </Button>
      <NavbarMainSidebar show={showMainSide} setShow={setShowMainSide} />
    </div>
  );
};
