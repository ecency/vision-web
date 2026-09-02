import React, { ReactElement } from "react";
import i18next from "i18next";
import Link from "next/link";
import { ApiTagsNotification } from "@/entities";
import { EntryLink } from "@/features/shared";
import { getNotificationEntryCategory } from "../utils";

interface Props {
  sourceLink: ReactElement;
  onLinkClick?: () => void;
  afterClick: () => void;
  notification: ApiTagsNotification;
  openLinksInNewTab: boolean;
}

/**
 * A post carrying a hashtag the user follows. A per-post row names the author
 * and links the post; a bundle row (busy tag, one row an hour) names the tag
 * and links its feed, since there is no single post behind it.
 */
export function NotificationTagsType({
  sourceLink,
  onLinkClick,
  notification,
  afterClick,
  openLinksInNewTab
}: Props) {
  const tag = notification.tag;
  const isBundle = !notification.permlink;
  const target = openLinksInNewTab ? "_blank" : undefined;

  if (isBundle) {
    return (
      <div className="item-content">
        <div className="first-line">
          <span className="source-name notranslate">#{tag}</span>
          <span className="item-action">
            {i18next.t("notifications.tags-bundle-str", { count: notification.count ?? 0 })}
          </span>
        </div>
        <div className="second-line">
          <Link
            href={`/created/${tag}`}
            className="post-link"
            target={target}
            onClick={afterClick}
          >
            {i18next.t("notifications.tags-bundle-link", { tag })}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="item-content">
      <div className="first-line">
        {sourceLink}
        <span className="item-action">{i18next.t("notifications.tags-str", { tag })}</span>
      </div>
      <div className="second-line">
        {!!onLinkClick ? (
          <a
            className="post-link"
            role="button"
            tabIndex={0}
            onClick={onLinkClick}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onLinkClick?.();
              }
            }}
          >
            {notification.title ?? notification.permlink}
          </a>
        ) : (
          <EntryLink
            entry={{
              category: getNotificationEntryCategory(notification) ?? tag,
              author: notification.author ?? notification.source,
              permlink: notification.permlink!
            }}
            target={target}
          >
            <div
              className="post-link"
              role="button"
              tabIndex={0}
              onClick={afterClick}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  afterClick();
                }
              }}
            >
              {notification.title ?? notification.permlink}
            </div>
          </EntryLink>
        )}
      </div>
    </div>
  );
}
