import { useGlobalStore } from "@/core/global-store";
import { UserAvatar } from "@/features/shared/user-avatar";
import { AnonUserButtons } from "@/features/shared/navbar/anon-user-buttons";
import { NavbarMainSidebar } from "@/features/shared/navbar/navbar-main-sidebar";
import { NavbarMainSidebarToggle } from "@/features/shared/navbar/navbar-main-sidebar-toggle";
import { NavbarSearchToggle } from "@/features/shared/navbar/navbar-search-toggle";
import { NavbarNotificationsButton } from "@/features/shared/navbar/navbar-notifications-button";
import { NavbarPerksButton } from "@/features/shared/navbar/navbar-perks-button";
import { NavbarSide } from "@/features/shared/navbar/sidebar/navbar-side";
import { UilComment, UilEditAlt } from "@tooni/iconscout-unicons-react";
import { Button } from "@ui/button";
import { Tooltip } from "@ui/tooltip";
import { classNameObject } from "@ui/util";
import i18next from "i18next";
import { useState } from "react";
import { NavbarTextMenu } from "./navbar-text-menu";
import { NavbarAskEsie } from "./navbar-ask-esie";
import { useHydrated } from "@/api/queries";
import { useMattermostUnread } from "@/features/chat/mattermost-api";
import { useActiveAccount } from "@/core/hooks/use-active-account";

interface Props {
  step?: number;
  transparentVerify: boolean;
  setStepOne?: () => void;
  setSmVisible: (v: boolean) => void;
  mainBarExpanded: boolean;
  setMainBarExpanded: (v: boolean) => void;
}

export function NavbarDesktop({
  step,
  transparentVerify,
  setStepOne,
  mainBarExpanded,
  setMainBarExpanded
}: Props) {
  const { activeUser } = useActiveAccount();
  const hydrated = useHydrated();
  const toggleUIProp = useGlobalStore((state) => state.toggleUiProp);
  const uiNotifications = useGlobalStore((state) => state.uiNotifications);
  const { data: unread } = useMattermostUnread(Boolean(activeUser && hydrated));

  const [showSidebar, setShowSidebar] = useState(false);

  return (
    <div
      className={`navbar-desktop-shell hidden md:flex w-full select-none relative ${
        !transparentVerify && step === 1 ? "transparent" : ""
      } `}
    >
      <div
        className={classNameObject({
          "ecency-navbar-desktop max-w-[1600px] w-full mx-auto flex items-center justify-between px-4 py-3": true,
          transparent: !transparentVerify && step === 1
        })}
      >
        <NavbarMainSidebarToggle onClick={() => setMainBarExpanded(true)} />
        <div className="flex-1" />
        <NavbarTextMenu />
        <div className="flex-spacer" />
        <NavbarAskEsie />
        {(step !== 1 || transparentVerify) && <NavbarSearchToggle />}
        <div className="navbar-actions flex items-center ml-3 gap-3">
          <NavbarPerksButton subdued />
          <Tooltip content={i18next.t("navbar.post")}>
            <Button
              href="/publish"
              appearance={activeUser ? "primary" : "gray-link"}
              className="navbar-write-button"
              iconPlacement="left"
              icon={<UilEditAlt />}
              aria-label={i18next.t("navbar.write")}
            >
              <span className="hidden lg:inline">{i18next.t("navbar.write")}</span>
            </Button>
          </Tooltip>
          <Tooltip content={i18next.t("chat.title")}>
            <div key={`desktop-chat-${activeUser?.username || "anon"}`} className="relative">
              <Button
                href="/chats"
                appearance="gray-link"
                className="relative"
                icon={<UilComment />}
                aria-label={i18next.t("chat.title")}
              />
              {!unread?.truncated && unread?.totalUnread ? (
                <span className="navbar-chat-badge notranslate">{unread.totalUnread}</span>
              ) : null}
            </div>
          </Tooltip>
          {hydrated && activeUser && (
            <NavbarNotificationsButton key={`desktop-notifications-${activeUser.username}`} />
          )}
        </div>
        <div className="btn-menu">
          <AnonUserButtons />
          {hydrated && activeUser && (
            <button
              key={`desktop-avatar-${activeUser.username}`}
              type="button"
              className="cursor-pointer ml-4"
              aria-label={i18next.t("user-menu.title", { defaultValue: "Open user menu" })}
              aria-expanded={showSidebar}
              onClick={() => {
                setShowSidebar(true);
                if (uiNotifications) {
                  toggleUIProp("notifications");
                }
              }}
            >
              <UserAvatar size="medium" username={activeUser.username} />
            </button>
          )}
        </div>
      </div>
      {hydrated && activeUser && (
        <NavbarSide
          key={`desktop-${activeUser.username}`}
          show={showSidebar}
          setShow={setShowSidebar}
        />
      )}
      <NavbarMainSidebar
        show={mainBarExpanded}
        setShow={setMainBarExpanded}
        setStepOne={setStepOne}
      />
    </div>
  );
}
