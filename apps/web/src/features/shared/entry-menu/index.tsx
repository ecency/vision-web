"use client";

import React, { useEffect, useRef, useState } from "react";
import { success } from "../feedback";
import { useMenuItemsGenerator } from "./menu-items-generator";
import { Entry } from "@/entities";
import { getCommunityCache, useCommunityPin } from "@/core/caches";
import { useActiveAccount } from "@/core/hooks/use-active-account";
import { useGlobalStore } from "@/core/global-store";
import { useDeleteComment, usePinToBlog } from "@/api/mutations";
import { usePathname, useRouter } from "next/navigation";
import { dotsHorizontal } from "@ui/svg";
import i18next from "i18next";
import { Dropdown, DropdownItemWithIcon, DropdownMenu, DropdownToggle } from "@ui/dropdown";
import { Button, ModalConfirm } from "@/features/ui";
import { UilShareAlt } from "@tooni/iconscout-unicons-react";
import { useQuery } from "@tanstack/react-query";
import dynamic from "next/dynamic";

// Each of these modals only mounts after a kebab-menu action (strictly
// boolean-gated in the JSX below) — never at first paint and never
// SSR-meaningful in this "use client" component. Lazy-load them so they
// don't ship in the post page's first client chunk. Mirrors the house
// pattern in entry-votes/index.tsx.
const EntryShare = dynamic(
  () => import("@/features/shared/entry-share").then((m) => ({ default: m.EntryShare })),
  { ssr: false }
);
const CrossPost = dynamic(
  () => import("@/features/shared/entry-menu/cross-post").then((m) => ({ default: m.CrossPost })),
  { ssr: false }
);
const EditHistory = dynamic(
  () => import("@/features/shared/edit-history").then((m) => ({ default: m.EditHistory })),
  { ssr: false }
);
const MuteBtn = dynamic(
  () => import("@/features/shared/mute-btn").then((m) => ({ default: m.MuteBtn })),
  { ssr: false }
);
const Promote = dynamic(
  () => import("@/features/shared/promote").then((m) => ({ default: m.Promote })),
  { ssr: false }
);
// By file, not through the curation-desk barrel, and on demand: the dialog is
// only mounted after the menu item is clicked.
const CurationRecommendDialog = dynamic(
  () =>
    import("@/features/curation-desk/curation-recommend-btn").then((m) => ({
      default: m.CurationRecommendDialog
    })),
  { ssr: false }
);
const EntryTranslate = dynamic(
  () => import("@/features/shared/entry-translate").then((m) => ({ default: m.EntryTranslate })),
  { ssr: false }
);
// Loaded on demand and by file, not through the newsletter barrel: that barrel
// imports @/features/shared for its toasts, and a static import here would
// close a cycle through this very module.
const AuthorSendDialog = dynamic(
  () => import("@/features/newsletter/author-send-dialog").then((m) => ({ default: m.AuthorSendDialog })),
  { ssr: false }
);

interface Props {
  entry: Entry;
  extraMenuItems?: any[];
  separatedSharing?: boolean;
  alignBottom?: boolean;
  pinEntry?: (entry: Entry | null) => void;
  // Dense action rows (waves, deck columns) render the menu icons at 16px
  // instead of the Button slot's 20px. Feed/entry-page menus stay at 20.
  compact?: boolean;
}

export const EntryMenu = ({
  entry,
  separatedSharing = false,
  alignBottom,
  extraMenuItems,
  pinEntry,
  compact = false
}: Props) => {
  const { activeUser } = useActiveAccount();
  const router = useRouter();
  const pathname = usePathname();

  const menuRef = useRef<HTMLDivElement>(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  useEffect(() => {
    // Only apply z-index and overflow styles if we're within a waves context
    // This prevents errors on category pages and other contexts where .waves-list-item doesn't exist
    if (!menuRef.current) return;

    const parent = menuRef.current.closest(".waves-list-item") as HTMLElement | null;
    if (parent && parent.style) {
      try {
        parent.style.zIndex = dropdownOpen ? "10" : "";
        parent.style.overflow = dropdownOpen ? "visible" : "";
      } catch (error) {
        // Silently handle any style assignment errors
        console.warn("EntryMenu: Could not apply styles to parent element", error);
      }
    }
  }, [dropdownOpen]);

  const { data: community } = useQuery(getCommunityCache(entry.category));
  const { mutateAsync: pinToBlog } = usePinToBlog(entry, () => pinEntry?.(pin ? entry : null));
  const { mutateAsync: pinToCommunity } = useCommunityPin(entry, community);
  // Navigate away only when the user is on the deleted entry's own page —
  // there the page's content just vanished. Deleting from a feed, waves or
  // deck list must keep the user where they are (the item disappears from the
  // list via cache invalidation, plus a success toast).
  const { mutateAsync: deleteAction } = useDeleteComment(entry, () => {
    if (pathname?.endsWith(`/@${entry.author}/${entry.permlink}`)) {
      router.push("/");
    }
  });

  const {
    menuItems,
    cross,
    setCross,
    share,
    setShare,
    editHistory,
    toggleEditHistory,
    showEditHistoryInMenu,
    delete_,
    setDelete_,
    pin,
    setPin,
    pinKey,
    setPinKey,
    unpin,
    setUnpin,
    mute,
    setMute,
    promote,
    setPromote,
    recommend,
    setRecommend,
    translate,
    setTranslate,
    sendNewsletter,
    setSendNewsletter,
    newsletterTarget
  } = useMenuItemsGenerator(entry, community, separatedSharing, extraMenuItems);

  return (
    <div className="entry-menu" ref={menuRef}>
      <Button
        icon={<UilShareAlt className={compact ? "!size-4" : undefined} />}
        appearance="gray-link"
        onClick={() => setShare(true)}
        aria-label={i18next.t("entry-menu.share")}
      />
      <Dropdown show={dropdownOpen} setShow={setDropdownOpen}>
        <DropdownToggle>
          <Button
            appearance="gray-link"
            size="sm"
            icon={
              compact ? (
                <span className="inline-flex !size-4 [&>svg]:size-full">{dotsHorizontal}</span>
              ) : (
                dotsHorizontal
              )
            }
            aria-label={i18next.t("g.menu", { defaultValue: "Menu" })}
            aria-haspopup="menu"
            aria-expanded={dropdownOpen}
          />
        </DropdownToggle>
        <DropdownMenu align="right">
          {menuItems.map((item, i) => (
            <DropdownItemWithIcon
              key={i}
              icon={item.icon}
              label={item.label}
              onClick={item.onClick}
            />
          ))}
        </DropdownMenu>
      </Dropdown>

      {activeUser && cross && (
        <CrossPost
          entry={entry}
          onHide={() => setCross(false)}
          onSuccess={(community) => {
            setCross(false);
            router.push(`/created/${community}`);
          }}
        />
      )}
      {share && <EntryShare entry={entry} onHide={() => setShare(false)} />}
      {sendNewsletter && newsletterTarget && (
        <AuthorSendDialog
          target={newsletterTarget}
          author={entry.author}
          permlink={entry.permlink}
          show={sendNewsletter}
          onHide={() => setSendNewsletter(false)}
        />
      )}
      {editHistory && showEditHistoryInMenu && (
        <EditHistory entry={entry} onHide={toggleEditHistory} />
      )}
      {delete_ && (
        <ModalConfirm
          onConfirm={() => {
            deleteAction();
            setDelete_(false);
          }}
          onCancel={() => setDelete_(false)}
        />
      )}
      {pin && (
        <ModalConfirm
          onConfirm={() => {
            if (pinKey === "community") {
              pinToCommunity(true);
            } else if (pinKey === "blog") {
              pinToBlog({ pin: true });
            }
            setPin(false);
            setPinKey("");
          }}
          onCancel={() => {
            setPin(false);
            setPinKey("");
          }}
        />
      )}
      {unpin && (
        <ModalConfirm
          onConfirm={() => {
            if (pinKey === "community") {
              pinToCommunity(false);
            } else if (pinKey === "blog") {
              pinToBlog({ pin: false });
            }
            setUnpin(false);
            setPinKey("");
          }}
          onCancel={() => {
            setUnpin(false);
            setPinKey("");
          }}
        />
      )}
      {community && activeUser && mute && (
        <MuteBtn
          onlyDialog={true}
          entry={entry}
          community={community}
          onSuccess={(entry, mute) => {
            setMute(false);

            if (pin) {
              success(i18next.t("entry-menu.mute-success"));
            } else {
              success(i18next.t("entry-menu.unmute-success"));
            }
          }}
          onCancel={() => setMute(false)}
        />
      )}
      {activeUser && promote && <Promote entry={entry} onHide={() => setPromote(false)} />}
      {activeUser && recommend && (
        <CurationRecommendDialog
          author={entry.author}
          permlink={entry.permlink}
          onHide={() => setRecommend(false)}
        />
      )}
      {translate && (
        <EntryTranslate entry={entry} onHide={() => setTranslate(false)} />
      )}
    </div>
  );
};
