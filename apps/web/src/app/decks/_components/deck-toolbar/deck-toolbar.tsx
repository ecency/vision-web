import React, { useState } from "react";
import "../_deck-toolbar.scss";
import { DeckToolbarUser } from "./deck-toolbar-user";
import { DeckToolbarBaseActions } from "./deck-toolbar-base-actions";
import { DeckToolbarToggleArea } from "./deck-toolbar-toggle-area";
import { DeckToolbarManager } from "./deck-toolbar-manager";
import { DeckToolbarCreate } from "./deck-toolbar-create";
import { useGlobalStore } from "@/core/global-store";
import { LoginDialog, NotificationHandler } from "@/features/shared";
import { PurchaseQrDialog } from "@/features/shared/purchase-qr";
import { FragmentsDialog } from "@/features/shared/fragments";
import { SchedulesDialog } from "@/features/shared/schedules";
import { BookmarksDialog } from "@/features/shared/bookmarks";
import { DraftsDialog } from "@/features/shared/drafts";
import { GalleryDialog } from "@/features/shared/gallery";
import { NotificationsDialog } from "@/features/shared/notifications";
import { useRouter } from "next/navigation";
import i18next from "i18next";
import { EcencyConfigManager } from "@/config";
import { useActiveAccount } from "@/core/hooks/use-active-account";

interface Props {
  isExpanded: boolean;
  setIsExpanded: (v: boolean) => void;
}

export const DeckToolbar = ({ isExpanded, setIsExpanded }: Props) => {
  const { activeUser } = useActiveAccount();
  const setActiveUser = useGlobalStore((s) => s.setActiveUser);
  const toggleUIProp = useGlobalStore((s) => s.toggleUiProp);

  const router = useRouter();

  const [gallery, setGallery] = useState(false);
  const [drafts, setDrafts] = useState(false);
  const [bookmarks, setBookmarks] = useState(false);
  const [schedules, setSchedules] = useState(false);
  const [fragments, setFragments] = useState(false);
  const [showPurchaseDialog, setShowPurchaseDialog] = useState(false);

  const authorizedItems = [
    {
      label: i18next.t("user-nav.profile"),
      onClick: () => router.push(`/@${activeUser?.username}`)
    },
    ...EcencyConfigManager.composeConditionals(
      EcencyConfigManager.withConditional(
        ({ visionFeatures }) => visionFeatures.drafts.enabled,
        () => ({
          label: i18next.t("user-nav.drafts"),
          onClick: () => setDrafts(true)
        })
      ),
      EcencyConfigManager.withConditional(
        ({ visionFeatures }) => visionFeatures.gallery.enabled,
        () => ({
          label: i18next.t("user-nav.gallery"),
          onClick: () => setGallery(true)
        })
      ),
      EcencyConfigManager.withConditional(
        ({ visionFeatures }) => visionFeatures.bookmarks.enabled,
        () => ({
          label: i18next.t("user-nav.bookmarks"),
          onClick: () => setBookmarks(true)
        })
      ),
      EcencyConfigManager.withConditional(
        ({ visionFeatures }) => visionFeatures.schedules.enabled,
        () => ({
          label: i18next.t("user-nav.schedules"),
          onClick: () => setSchedules(true)
        })
      ),
      EcencyConfigManager.withConditional(
        ({ visionFeatures }) => visionFeatures.fragments.enabled,
        () => ({
          label: i18next.t("user-nav.fragments"),
          onClick: () => setFragments(true)
        })
      )
    ),
    {
      label: i18next.t("user-nav.settings"),
      onClick: () => router.push(`/@${activeUser?.username}/settings`)
    },
    {
      label: i18next.t("g.login-as"),
      onClick: () => toggleUIProp("login")
    },
    {
      label: i18next.t("user-nav.logout"),
      onClick: () => setActiveUser(null)
    }
  ];

  return (
    <div className={"deck-toolbar " + (isExpanded ? "expanded" : "")}>
      <div className="deck-toolbar-content">
        <DeckToolbarUser
          items={authorizedItems}
          isExpanded={isExpanded}
          setIsExpanded={setIsExpanded}
        />
        <DeckToolbarBaseActions setShowPurchaseDialog={setShowPurchaseDialog} />
        <DeckToolbarCreate isExpanded={isExpanded} />
        <DeckToolbarManager isExpanded={isExpanded} />
      </div>
      <DeckToolbarToggleArea isExpanded={isExpanded} setIsExpanded={setIsExpanded} />
      <EcencyConfigManager.Conditional
        condition={({ visionFeatures }) => visionFeatures.gallery.enabled}
      >
        <GalleryDialog show={gallery} setShow={setGallery} />
      </EcencyConfigManager.Conditional>
      <EcencyConfigManager.Conditional
        condition={({ visionFeatures }) => visionFeatures.drafts.enabled}
      >
        <DraftsDialog show={drafts} setShow={setDrafts} />
      </EcencyConfigManager.Conditional>
      <EcencyConfigManager.Conditional
        condition={({ visionFeatures }) => visionFeatures.bookmarks.enabled}
      >
        <BookmarksDialog show={bookmarks} setShow={setBookmarks} />
      </EcencyConfigManager.Conditional>
      <EcencyConfigManager.Conditional
        condition={({ visionFeatures }) => visionFeatures.schedules.enabled}
      >
        <SchedulesDialog show={schedules} setShow={setSchedules} />
      </EcencyConfigManager.Conditional>
      <EcencyConfigManager.Conditional
        condition={({ visionFeatures }) => visionFeatures.fragments.enabled}
      >
        <FragmentsDialog show={fragments} setShow={setFragments} />
      </EcencyConfigManager.Conditional>
      <EcencyConfigManager.Conditional
        condition={({ visionFeatures }) => visionFeatures.notifications.enabled}
      >
        <NotificationHandler />
      </EcencyConfigManager.Conditional>
      {activeUser && <NotificationsDialog openLinksInNewTab={true} />}
      <LoginDialog />
      <PurchaseQrDialog show={showPurchaseDialog} setShow={(v) => setShowPurchaseDialog(v)} />
    </div>
  );
};
