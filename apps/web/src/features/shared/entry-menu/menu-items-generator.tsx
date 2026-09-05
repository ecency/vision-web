import { useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useAuthorSendTarget } from "@/features/newsletter/author-send-eligibility";
import { UilAward, UilEnvelopeSend } from "@tooni/iconscout-unicons-react";
import { success } from "../feedback";
import { Community, Entry, FullAccount, ROLES } from "@/entities";
import { useCommunityPinCache } from "@/core/caches";
import { canManageCommunityPins as canManageCommunityPinsFor } from "./can-manage-community-pins";
import useMount from "react-use/lib/useMount";
import { bullHornSvg } from "@ui/svg";
import i18next from "i18next";
import { clipboard } from "@/utils/clipboard";
import { useActiveAccount } from "@/core/hooks/use-active-account";
import { useGlobalStore } from "@/core/global-store";
import { useRouter } from "next/navigation";
import { MenuItem } from "@ui/dropdown";
import { isCommunity, safeSpread } from "@/utils";
import {
  UilHistory,
  UilHistoryAlt,
  UilLanguage,
  UilLink,
  UilMapPin,
  UilPen,
  UilShare,
  UilTrash,
  UilVolume,
  UilVolumeOff
} from "@tooni/iconscout-unicons-react";
import { EcencyConfigManager } from "@/config";
import { EntryPageContext, DEFAULT_CONTEXT } from "@/app/(dynamicPages)/entry/[category]/[author]/[permlink]/_components/context";

export function useMenuItemsGenerator(
  entry: Entry,
  community: Community | null | undefined,
  separatedSharing: boolean,
  extraMenuItems?: MenuItem[]
) {
  const { activeUser, account } = useActiveAccount();
  const toggleUIProp = useGlobalStore((state) => state.toggleUiProp);

  // Only a community's own moderators are offered Pin or Unpin, and resolving
  // the state costs a whole community page (see useCommunityPinCache), so nobody
  // else pays for it.
  const canManageCommunityPins = useMemo(
    () => canManageCommunityPinsFor(community, activeUser?.username),
    [activeUser, community]
  );
  const { data: isPinnedCached } = useCommunityPinCache(entry, canManageCommunityPins);
  const isPinned = entry.stats?.is_pinned ?? isPinnedCached;

  const [cross, setCross] = useState(false);
  const [share, setShare] = useState(false);
  const [editHistoryLocal, setEditHistoryLocal] = useState(false);
  const [delete_, setDelete_] = useState(false);
  const [pin, setPin] = useState(false);
  const [pinKey, setPinKey] = useState("");
  const [unpin, setUnpin] = useState(false);
  const [mute, setMute] = useState(false);
  const [promote, setPromote] = useState(false);
  const [recommend, setRecommend] = useState(false);
  const [translate, setTranslate] = useState(false);
  const [sendNewsletter, setSendNewsletter] = useState(false);
  // vision-web#1532: the list this post may be sent to by this viewer, or null.
  const newsletterTarget = useAuthorSendTarget(entry, community);
  const [canMute, setCanMute] = useState(false);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);

  const router = useRouter();
  const { setIsEdit, editHistory: ctxEditHistory, setEditHistory: setEditHistoryCtx } =
    useContext(EntryPageContext);

  const isEntryPage = setEditHistoryCtx !== DEFAULT_CONTEXT.setEditHistory;
  const editHistory = isEntryPage ? ctxEditHistory : editHistoryLocal;

  const toggleEditHistory = useCallback(() => {
    const next = !editHistory;
    if (isEntryPage) {
      setEditHistoryCtx(next);
    } else {
      setEditHistoryLocal(next);
    }
  }, [editHistory, isEntryPage, setEditHistoryCtx, setEditHistoryLocal]);

  useMount(() => {
    generate();
  });

  useEffect(() => {
    setCanMute(
      activeUser && community
        ? !!community.team?.find(
            (m) =>
              m[0] === activeUser.username &&
              [ROLES.OWNER.toString(), ROLES.ADMIN.toString(), ROLES.MOD.toString()].includes(m[1])
          )
        : false
    );
  }, [activeUser, community]);

  const copyAddress = useCallback(() => {
    let u;
    if (activeUser?.username) {
      u = `https://ecency.com/@${entry.author}/${entry.permlink}?referral=${activeUser.username}`;
    } else {
      u = `https://ecency.com/@${entry.author}/${entry.permlink}`;
    }
    clipboard(u);
    success(i18next.t("entry.address-copied"));
  }, [activeUser?.username, entry.author, entry.permlink]);

  const togglePin = useCallback(
    (key = "") => {
      setPin(!pin);
      setPinKey(key);
    },
    [pin]
  );

  const toggleUnpin = useCallback(
    (key = "") => {
      setUnpin(!unpin);
      setPinKey(key);
    },
    [unpin]
  );

  // Same predicate as the pin-cache gate above, kept as a callback for the
  // existing call sites rather than duplicating the role list a third time.
  const isTeamManager = useCallback(() => canManageCommunityPins, [canManageCommunityPins]);

  const generate = useCallback(() => {
    const isComment = !!entry.parent_author;
    const isWave =
      entry.permlink.startsWith("wave-") ||
      (entry.permlink.startsWith("re-ecencywaves-") && entry.parent_author === "ecency.waves");
    const isOwn = !!activeUser && activeUser.username === entry.author;
    const isCross = activeUser && !isComment && isCommunity(entry.category);
    const isDeletable = isOwn && !(entry.children > 0 || entry.net_rshares > 0 || entry.is_paidout);
    const profile = account?.profile;
    const canUnpinCommunity = isTeamManager() && isPinned;
    const canUnpinBlog = isOwn && entry.permlink === profile?.pinned;
    const canPinCommunity = isTeamManager() && !canUnpinCommunity;
    const canPinBlog = isOwn && !canUnpinBlog;

    setMenuItems([
      ...safeSpread(
        () => isOwn,
        () => ({
          label: i18next.t("g.edit"),
          onClick: isComment
            ? () => setIsEdit(true)
            : () => router.push(`/@${entry.author}/${entry.permlink}/edit`),
          icon: <UilPen className="size-4" />
        })
      ),
      ...safeSpread(
        () => isOwn,
        () => ({
          label: i18next.t("entry-menu.edit-classic"),
          onClick: isComment
            ? () => setIsEdit(true)
            : () => router.push(`/@${entry.author}/${entry.permlink}/edit-classic`),
          icon: <UilPen className="size-4" />
        })
      ),
      ...safeSpread(
        () => isCross === true,
        () => ({
          label: i18next.t("entry-menu.cross-post"),
          onClick: () => setCross(!cross),
          icon: <UilHistory className="size-4" />
        })
      ),
      ...safeSpread(
        () => canMute,
        () => ({
          label: !!entry.stats?.gray
            ? i18next.t("entry-menu.unmute")
            : i18next.t("entry-menu.mute"),
          onClick: () => setMute(!mute),
          icon: !!entry.stats?.gray ? <UilVolumeOff className="size-4" /> : <UilVolume className="size-4" />
        })
      ),
      // Fallback translate entry: every top-level post AND waves (waves are
      // technically comments — parent_author "ecency.waves" — so `!isComment`
      // alone would strip it from the one place it works today). Ordinary reply
      // comments stay excluded. The prominent inline banner / chip handles the
      // language-mismatch case; this is the always-available manual option.
      ...safeSpread(
        () => !isComment || isWave,
        () => ({
          label: i18next.t("entry-menu.translate"),
          onClick: () => setTranslate(true),
          icon: <UilLanguage className="size-4" />
        })
      ),
      ...safeSpread(
        () => !!newsletterTarget,
        () => ({
          label: i18next.t("newsletter.send-to-subscribers"),
          onClick: () => setSendNewsletter(true),
          icon: <UilEnvelopeSend className="size-4" />
        })
      ),
      ...(extraMenuItems ?? []),
      ...EcencyConfigManager.composeConditionals(
        EcencyConfigManager.withConditional(
          ({ visionFeatures }) => visionFeatures.editHistory.enabled,
          () => ({
            label: i18next.t("entry-menu.edit-history"),
            onClick: toggleEditHistory,
            icon: <UilHistoryAlt className="size-4" />
          })
        ),
        EcencyConfigManager.withConditional(
          ({ visionFeatures }) => visionFeatures.promotions.enabled,
          () => ({
            label: i18next.t("entry-menu.promote"),
            onClick: activeUser !== null ? () => setPromote(!promote) : () => toggleUIProp("login"),
            icon: bullHornSvg
          })
        ),
        // Recommend to curators: an on-chain custom_json, so it is offered to
        // any logged-in viewer except the post's own author (self rows count 0).
        EcencyConfigManager.withConditional(
          ({ visionFeatures }) =>
            visionFeatures.curationDesk.enabled &&
            visionFeatures.curationDesk.recommendations.enabled &&
            entry.author !== activeUser?.username,
          () => ({
            label: i18next.t("curation-desk.recommend.menu-item"),
            onClick: activeUser !== null ? () => setRecommend(true) : () => toggleUIProp("login"),
            icon: <UilAward className="size-4" />
          })
        ),
        EcencyConfigManager.withConditional(
          ({ privateMode }) => Boolean(parseInt(privateMode, 10)),
          () => ({
            label: i18next.t("entry.address-copy"),
            onClick: copyAddress,
            icon: <UilLink className="size-4" />
          })
        )
      ),
      ...safeSpread(
        () => !separatedSharing,
        () => ({
          label: i18next.t("entry-menu.share"),
          onClick: () => setShare(!share),
          icon: <UilShare className="size-4" />
        })
      ),
      ...safeSpread(
        () => canUnpinCommunity,
        () => ({
          label: i18next.t("entry-menu.unpin-from-community"),
          onClick: () => toggleUnpin("community"),
          icon: <UilMapPin className="size-4" />
        })
      ),
      ...safeSpread(
        () => canUnpinBlog,
        () => ({
          label: i18next.t("entry-menu.unpin-from-blog"),
          onClick: () => toggleUnpin("blog"),
          icon: <UilMapPin className="size-4" />
        })
      ),
      ...safeSpread(
        () => canPinCommunity,
        () => ({
          label: i18next.t("entry-menu.pin-to-community"),
          onClick: () => togglePin("community"),
          icon: <UilMapPin className="size-4" />
        })
      ),
      ...safeSpread(
        () => canPinBlog,
        () => ({
          label: i18next.t("entry-menu.pin-to-blog"),
          onClick: () => togglePin("blog"),
          icon: <UilMapPin className="size-4" />
        })
      ),
      ...safeSpread(
        () => isDeletable,
        () => ({
          label: i18next.t("g.delete"),
          onClick: () => setDelete_(!delete_),
          icon: <UilTrash className="size-4" />
        })
      )
    ]);
  }, [
    activeUser,
    canMute,
    copyAddress,
    cross,
    delete_,
    editHistory,
    entry.author,
    entry.category,
    entry.children,
    entry.is_paidout,
    entry.net_rshares,
    entry.parent_author,
    entry.permlink,
    entry.stats?.gray,
    extraMenuItems,
    isPinned,
    isTeamManager,
    mute,
    newsletterTarget,
    promote,
    router,
    separatedSharing,
    share,
    toggleEditHistory,
    togglePin,
    toggleUIProp,
    toggleUnpin
  ]);

  useEffect(() => {
    generate();
  }, [isPinned, activeUser, community, canMute, separatedSharing, extraMenuItems, generate, newsletterTarget]);

  return {
    menuItems,
    cross,
    setCross,
    share,
    setShare,
    editHistory,
    toggleEditHistory,
    showEditHistoryInMenu: !isEntryPage,
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
  };
}
