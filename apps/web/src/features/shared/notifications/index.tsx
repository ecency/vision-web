"use client";

import { NotificationsContent } from "@/features/shared/notifications/notifications-content";
import { useActiveAccount } from "@/core/hooks/use-active-account";
import { useGlobalStore } from "@/core/global-store";
import { ModalSidebar } from "@ui/modal/modal-sidebar";
import { EcencyConfigManager } from "@/config";

export * from "./notification-list-item";

interface Props {
  openLinksInNewTab?: boolean;
}

export function NotificationsDialog({ openLinksInNewTab = false }: Props) {
  const { activeUser } = useActiveAccount();
  const showNotifications = useGlobalStore((state) => state.uiNotifications);
  const toggleUIProp = useGlobalStore((state) => state.toggleUiProp);

  // Drive the modal directly from the global store — the single source of
  // truth. A mirrored local `show` (synced via effect) leaves a one-render
  // window where it's still stale `false`; the base Modal then fires its
  // `onHide` effect and resets `uiNotifications` right after the bell set it,
  // so the click appears to do nothing and a second click is needed.
  const show = showNotifications && !!activeUser;

  return (
    <EcencyConfigManager.Conditional
      condition={({ visionFeatures }) => visionFeatures.notifications.enabled}
    >
      <ModalSidebar
        className={`notifications-modal min-w-[90%] md:min-w-[32rem] [&_.ecency-sidebar]:overflow-hidden ${openLinksInNewTab ? "in-decks-page" : ""}`}
        show={show}
        setShow={(v) => toggleUIProp("notifications", v)}
        placement="right"
      >
        <NotificationsContent openLinksInNewTab={openLinksInNewTab} />
      </ModalSidebar>
    </EcencyConfigManager.Conditional>
  );
}
