import { EcencyConfigManager } from "@/config";
import { useActiveAccount } from "@/core/hooks/use-active-account";
import { useGlobalStore } from "@/core/global-store";
import {
  UilArchive,
  UilClock,
  UilDashboard,
  UilDocumentInfo,
  UilFavorite,
  UilImages,
  UilMoneyWithdraw,
  UilQrcodeScan,
  UilSetting,
  UilSignin,
  UilUser,
  UilWallet
} from "@tooni/iconscout-unicons-react";
import i18next from "i18next";
import { ReactNode, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { NavbarSideMainLogout } from "./navbar-side-main-logout";
import { NavbarSideMainMenuItem } from "./navbar-side-main-menu-item";

// Loaded on demand when the user opens mobile login, so `qrcode` (~22 KB) is
// not bundled onto every page - the navbar renders on all routes, including
// read-only post pages where the QR login is never used.
const MobileLoginQrDialog = dynamic(
  () => import("../../mobile-login-qr").then((m) => m.MobileLoginQrDialog),
  // The dialog renders its own modal/spinner once mounted; render nothing while
  // the (small) chunk streams in rather than an out-of-context placeholder.
  { ssr: false, loading: () => null }
);

// These user dialogs are reachable only after the user opens the sidebar menu
// and clicks the matching item. A static import would bundle all five graphs
// (gallery/drafts/bookmarks/schedules/fragments) into the shared navbar chunk
// that loads on every route - including read-only pages where they are never
// used. Defer them; each render is gated on its open flag below, so the chunk
// is fetched on first open, not on page load. Mirrors MobileLoginQrDialog.
const GalleryDialog = dynamic(
  () => import("@/features/shared/gallery").then((m) => m.GalleryDialog),
  { ssr: false, loading: () => null }
);
const DraftsDialog = dynamic(
  () => import("@/features/shared/drafts").then((m) => m.DraftsDialog),
  { ssr: false, loading: () => null }
);
const BookmarksDialog = dynamic(
  () => import("@/features/shared/bookmarks").then((m) => m.BookmarksDialog),
  { ssr: false, loading: () => null }
);
const SchedulesDialog = dynamic(
  () => import("@/features/shared/schedules").then((m) => m.SchedulesDialog),
  { ssr: false, loading: () => null }
);
const FragmentsDialog = dynamic(
  () => import("@/features/shared/fragments").then((m) => m.FragmentsDialog),
  { ssr: false, loading: () => null }
);

interface Props {
  onHide: () => void;
}

interface MenuItem {
  label: string;
  to?: string;
  icon?: ReactNode;
  onClick: () => void;
}

export function NavbarSideMainMenu({ onHide }: Props) {
  const { activeUser } = useActiveAccount();
  const toggleUIProp = useGlobalStore((state) => state.toggleUiProp);

  const [gallery, setGallery] = useState(false);
  const [drafts, setDrafts] = useState(false);
  const [bookmarks, setBookmarks] = useState(false);
  const [schedules, setSchedules] = useState(false);
  const [fragments, setFragments] = useState(false);
  const [mobileLogin, setMobileLogin] = useState(false);

  const mainMenu = useMemo(
    () =>
      [
        {
          label: i18next.t("user-nav.profile"),
          to: `/@${activeUser?.username}`,
          icon: <UilUser className="size-4" />,
          onClick: () => onHide()
        },
        {
          label: i18next.t("user-nav.wallet"),
          to: `/@${activeUser?.username}/wallet`,
          icon: <UilWallet className="size-4" />,
          onClick: () => onHide()
        },
        ...EcencyConfigManager.composeConditionals(
          EcencyConfigManager.withConditional(
            ({ visionFeatures }) => visionFeatures.drafts.enabled,
            () => ({
              label: i18next.t("user-nav.drafts"),
              onClick: () => setDrafts(!drafts),
              icon: <UilDocumentInfo className="size-4" />
            })
          ),
          EcencyConfigManager.withConditional(
            ({ visionFeatures }) => visionFeatures.gallery.enabled,
            () => ({
              label: i18next.t("user-nav.gallery"),
              onClick: () => setGallery(!gallery),
              icon: <UilImages className="size-4" />
            })
          ),
          EcencyConfigManager.withConditional(
            ({ visionFeatures }) => visionFeatures.bookmarks.enabled,
            () => ({
              label: i18next.t("user-nav.bookmarks"),
              onClick: () => setBookmarks(!bookmarks),
              icon: <UilFavorite className="size-4" />
            })
          ),
          EcencyConfigManager.withConditional(
            ({ visionFeatures }) => visionFeatures.schedules.enabled,
            () => ({
              label: i18next.t("user-nav.schedules"),
              onClick: () => setSchedules(!schedules),
              icon: <UilClock className="size-4" />
            })
          ),
          EcencyConfigManager.withConditional(
            ({ visionFeatures }) => visionFeatures.fragments.enabled,
            () => ({
              label: i18next.t("user-nav.fragments"),
              onClick: () => setFragments(!fragments),
              icon: <UilArchive className="size-4" />
            })
          )
        ),
        {
          label: i18next.t("user-nav.settings"),
          to: `/@${activeUser?.username}/settings`,
          onClick: () => onHide(),
          icon: <UilSetting className="size-4" />
        },
        {
          label: i18next.t("user-nav.mobile-login", { defaultValue: "Login to Mobile" }),
          onClick: () => setMobileLogin(true),
          icon: <UilQrcodeScan className="size-4" />
        }
      ] as MenuItem[],
    [activeUser?.username, bookmarks, drafts, fragments, gallery, onHide, schedules]
  );

  return (
    <>
      <div className="px-4 flex flex-col gap-0.5">
        {mainMenu.map(({ label, onClick, icon, to }) => (
          <NavbarSideMainMenuItem to={to} key={label} label={label} onClick={onClick} icon={icon} />
        ))}
        <hr className="my-2 border-[--border-color]" />
        <NavbarSideMainMenuItem
          label={i18next.t("market.swap-title")}
          to="/market/swap"
          onClick={onHide}
          icon={<UilMoneyWithdraw className="size-4" />}
        />
        <NavbarSideMainMenuItem
          label={i18next.t("market.advanced-title")}
          to="/market/advanced"
          onClick={onHide}
          icon={<UilDashboard className="size-4" />}
        />
        <hr className="my-2 border-[--border-color]" />
        <NavbarSideMainMenuItem
          label={i18next.t("g.login-as")}
          onClick={() => {
            toggleUIProp("login");
          }}
          icon={<UilSignin className="size-4" />}
        />
        <NavbarSideMainLogout />
      </div>
      <EcencyConfigManager.Conditional
        condition={({ visionFeatures }) => visionFeatures.gallery.enabled}
      >
        {gallery && <GalleryDialog setShow={(v) => setGallery(v)} show={gallery} />}
      </EcencyConfigManager.Conditional>

      <EcencyConfigManager.Conditional
        condition={({ visionFeatures }) => visionFeatures.drafts.enabled}
      >
        {drafts && <DraftsDialog show={drafts} setShow={(v) => setDrafts(v)} />}
      </EcencyConfigManager.Conditional>

      <EcencyConfigManager.Conditional
        condition={({ visionFeatures }) => visionFeatures.bookmarks.enabled}
      >
        {bookmarks && (
          <BookmarksDialog show={bookmarks && !!activeUser} setShow={(v) => setBookmarks(v)} />
        )}
      </EcencyConfigManager.Conditional>

      <EcencyConfigManager.Conditional
        condition={({ visionFeatures }) => visionFeatures.schedules.enabled}
      >
        {schedules && (
          <SchedulesDialog show={schedules && !!activeUser} setShow={(v) => setSchedules(v)} />
        )}
      </EcencyConfigManager.Conditional>

      <EcencyConfigManager.Conditional
        condition={({ visionFeatures }) => visionFeatures.fragments.enabled}
      >
        {fragments && (
          <FragmentsDialog show={fragments && !!activeUser} setShow={(v) => setFragments(v)} />
        )}
      </EcencyConfigManager.Conditional>

      {mobileLogin && (
        <MobileLoginQrDialog show={mobileLogin} onHide={() => setMobileLogin(false)} />
      )}
    </>
  );
}
