import { useGlobalStore } from "@/core/global-store";
import { UserAvatar } from "@/features/shared";
import { AnonUserButtons } from "@/features/shared/navbar/anon-user-buttons";
import { NavbarMainSidebar } from "@/features/shared/navbar/navbar-main-sidebar";
import { NavbarMainSidebarToggle } from "@/features/shared/navbar/navbar-main-sidebar-toggle";
import { NavbarSearchShell } from "@/features/shared/navbar/navbar-search-shell";
import { NavbarNotificationsButton } from "@/features/shared/navbar/navbar-notifications-button";
import { NavbarPerksButton } from "@/features/shared/navbar/navbar-perks-button";
import { NavbarSide } from "@/features/shared/navbar/sidebar/navbar-side";
import { UilComment, UilEditAlt, UilQuestionCircle } from "@tooni/iconscout-unicons-react";
import { Button } from "@ui/button";
import { Tooltip } from "@ui/tooltip";
import { classNameObject } from "@ui/util";
import i18next from "i18next";
import { useEffect, useState } from "react";
import { NavbarTextMenu } from "./navbar-text-menu";
import { useHydrated } from "@/api/queries";
import { useMattermostUnread } from "@/features/chat/mattermost-api";
import { useActiveAccount } from "@/core/hooks/use-active-account";

import { Search } from "@/features/shared/navbar/navbar-search-dynamic";

interface Props {
  step?: number;
  transparentVerify: boolean;
  setStepOne?: () => void;
  setSmVisible: (v: boolean) => void;
  mainBarExpanded: boolean;
  setMainBarExpanded: (v: boolean) => void;
  experimental?: boolean; // Use this flag for testing something
}

export function NavbarDesktop({
  step,
  transparentVerify,
  setStepOne,
  mainBarExpanded,
  setMainBarExpanded,
  experimental = false
}: Props) {
  const { activeUser } = useActiveAccount();
  const hydrated = useHydrated();
  const toggleUIProp = useGlobalStore((state) => state.toggleUiProp);
  const uiNotifications = useGlobalStore((state) => state.uiNotifications);
  const { data: unread } = useMattermostUnread(Boolean(activeUser && hydrated));

  const [showSidebar, setShowSidebar] = useState(false);

  // SSR-safe desktop detection: false on the server and on phones, true only
  // once a >=768px viewport is confirmed on the client. Gates the heavy Search
  // so its chunk is never fetched on mobile.
  const [isDesktop, setIsDesktop] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const update = () => setIsDesktop(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  return (
    <div
      className={`hidden md:flex w-full select-none relative ${
        !transparentVerify && step === 1 ? "transparent" : ""
      } `}
    >
      <div
        className={classNameObject({
          "ecency-navbar-desktop max-w-[1600px] w-full mx-auto flex items-center justify-between px-4 py-3":
            true,
          "bg-white dark:bg-dark-700 border-b border-[--border-color]": !experimental,
          "ecency-navbar-desktop-experemental glass-box rounded-2xl bg-white/80 dark:bg-dark-200/80 backdrop-blur-sm dark:backdrop-blur-md":
            experimental,
          transparent: !transparentVerify && step === 1
        })}
      >
        <NavbarMainSidebarToggle onClick={() => setMainBarExpanded(true)} />
        <div className="flex-1" />
        <NavbarTextMenu />
        <div className="flex-spacer" />
        <Tooltip content="FAQ and documetation">
          <Button
            className="after:!hidden"
            href="https://docs.ecency.com"
            target="_blank"
            icon={<UilQuestionCircle />}
            appearance="gray-link"
            aria-label={i18next.t("entry-index.faq")}
          />
        </Tooltip>
        {(step !== 1 || transparentVerify) && (
          // Slot is always rendered so it reserves its flex space (no layout
          // shift when Search mounts). Only the heavy Search itself is gated on
          // isDesktop, so its chunk never loads on mobile; until it mounts the
          // pixel-identical server-rendered shell keeps the input visible from
          // the first paint (#1664).
          <div className="max-w-[400px] w-full">
            {isDesktop ? <Search /> : <NavbarSearchShell />}
          </div>
        )}
        <div className="flex items-center ml-3 gap-3">
          <NavbarPerksButton />
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
                <span className="navbar-chat-badge notranslate">
                  {unread.totalUnread}
                </span>
              ) : null}
            </div>
          </Tooltip>
          <Tooltip content={i18next.t("navbar.post")}>
            <Button
              href="/publish"
              appearance="gray-link"
              icon={<UilEditAlt />}
              aria-label={i18next.t("navbar.post")}
            />
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
        <NavbarSide key={`desktop-${activeUser.username}`} show={showSidebar} setShow={setShowSidebar} />
      )}
      <NavbarMainSidebar
        show={mainBarExpanded}
        setShow={setMainBarExpanded}
        setStepOne={setStepOne}
      />
    </div>
  );
}
