"use client";

import { useActiveAccount } from "@/core/hooks/use-active-account";
import { Entry } from "@/entities";
import {
  getBookmarksQueryOptions,
  useBookmarkAdd,
  useBookmarkDelete
} from "@ecency/sdk";
import { useQuery } from "@tanstack/react-query";
import { UilBookmark } from "@tooni/iconscout-unicons-react";
import { NotificationBadgeIcon } from "../notification-badge-icon";
import { Button } from "@ui/button";
import { Tooltip } from "@ui/tooltip";
import i18next from "i18next";
import { useMemo, useState } from "react";
import { error, success } from "../feedback";
import { getAccessToken } from "@/utils";
import { useGlobalStore } from "@/core/global-store";

export interface Props {
  entry: Entry;
}

export function BookmarkBtn({ entry }: Props) {
  const { activeUser } = useActiveAccount();
  const username = activeUser?.username;
  const toggleUiProp = useGlobalStore((state) => state.toggleUiProp);
  const accessToken = useMemo(
    () => (username ? getAccessToken(username) : undefined),
    [username]
  );

  const { data: bookmarks = [] } = useQuery({
    ...getBookmarksQueryOptions(username, accessToken),
    enabled: !!username && !!accessToken,
  });

  const bookmarkId = useMemo(() => {
    const bookmark = bookmarks.find(
      (x) => x.author === entry.author && x.permlink == entry.permlink
    );
    return bookmark?._id;
  }, [bookmarks, entry.author, entry.permlink]);

  // Transient success cue: set only in the mutation success callbacks and
  // cleared on animationend, so the pulse never fires on initial render.
  const [bookmarkDone, setBookmarkDone] = useState(false);

  const { mutateAsync: addBookmark, isPending: isAdding } = useBookmarkAdd(
    username,
    accessToken,
    () => {
      success(i18next.t("bookmark-btn.added"));
      setBookmarkDone(true);
    },
    () => error(i18next.t("g.server-error"))
  );
  const { mutateAsync: deleteBookmark, isPending: isDeleting } = useBookmarkDelete(
    username,
    accessToken,
    () => {
      success(i18next.t("bookmark-btn.deleted"));
      setBookmarkDone(true);
    },
    () => error(i18next.t("g.server-error"))
  );

  const bookmarkIcon = (
    <NotificationBadgeIcon>
      <UilBookmark
        className={`size-5${bookmarkDone ? " animate-success-pulse" : ""}`}
        onAnimationEnd={() => setBookmarkDone(false)}
      />
    </NotificationBadgeIcon>
  );

  if (!activeUser) {
    return (
      <div className="bookmark-btn">
        <Tooltip content={i18next.t("bookmark-btn.add")}>
          <Button
            appearance="gray-link"
            size="sm"
            icon={bookmarkIcon}
            onClick={() => toggleUiProp("login")}
            aria-label={i18next.t("bookmark-btn.add")}
          />
        </Tooltip>
      </div>
    );
  }

  if (bookmarkId) {
    return (
      <div className={`bookmark-btn bookmarked ${isDeleting ? "in-progress" : ""}`}>
        <Tooltip content={i18next.t("bookmark-btn.delete")}>
          <Button
            appearance="gray-link"
            size="sm"
            icon={bookmarkIcon}
            onClick={() => deleteBookmark(bookmarkId)}
            aria-label={i18next.t("bookmark-btn.delete")}
            aria-pressed={true}
          />
        </Tooltip>
      </div>
    );
  }

  return (
    <div className={`bookmark-btn ${isAdding ? "in-progress" : ""}`}>
      <Tooltip content={i18next.t("bookmark-btn.add")}>
        <Button
          appearance="gray-link"
          size="sm"
          icon={bookmarkIcon}
          onClick={() => addBookmark({ author: entry.author, permlink: entry.permlink })}
          aria-label={i18next.t("bookmark-btn.add")}
          aria-pressed={false}
        />
      </Tooltip>
    </div>
  );
}
