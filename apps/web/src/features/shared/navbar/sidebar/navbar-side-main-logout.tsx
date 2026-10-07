import { useActiveAccount } from "@/core/hooks/use-active-account";
import { useGlobalStore } from "@/core/global-store";
import { Button, Popover, PopoverContent } from "@/features/ui";
import { useRef, useState } from "react";
import { NavbarSideMainMenuItem } from "./navbar-side-main-menu-item";
import i18next from "i18next";
import { UilSignout } from "@tooni/iconscout-unicons-react";
import { useClickAway } from "react-use";
import { usePathname, useRouter } from "next/navigation";
import { isPathInSection } from "@/utils/path-section";

export function NavbarSideMainLogout() {
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const pathname = usePathname();

  const { activeUser } = useActiveAccount();
  const setActiveUser = useGlobalStore((state) => state.setActiveUser);
  const deleteUser = useGlobalStore((state) => state.deleteUser);

  const [showLogoutPopover, setShowLogoutPopover] = useState(false);

  useClickAway(ref, () => showLogoutPopover && setShowLogoutPopover(false));

  const handleLogout = (clearData: boolean) => {
    const username = activeUser?.username;
    const isOnOwnProfile = !!username && isPathInSection(pathname, `/@${username}`);

    setActiveUser(null);
    if (clearData && username) {
      deleteUser(username);
    }

    // If on own profile, redirect to home to avoid stale profile state
    if (isOnOwnProfile) {
      router.push("/");
    }
  };

  return (
    <Popover
      show={showLogoutPopover}
      setShow={setShowLogoutPopover}
      directContent={
        <NavbarSideMainMenuItem
          label={i18next.t("user-nav.logout")}
          onClick={() => setShowLogoutPopover(!showLogoutPopover)}
          icon={<UilSignout className="size-4" />}
        />
      }
    >
      <div ref={ref}>
        <PopoverContent className="flex flex-col gap-2">
          <Button size="sm" appearance="gray" onClick={() => handleLogout(false)}>
            {i18next.t("user-nav.just-logout")}
          </Button>
          <Button size="sm" appearance="danger" onClick={() => handleLogout(true)}>
            {i18next.t("user-nav.logout-and-clear")}
          </Button>
        </PopoverContent>
      </div>
    </Popover>
  );
}
