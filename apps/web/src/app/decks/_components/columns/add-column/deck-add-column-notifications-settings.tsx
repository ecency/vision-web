import React, { useContext, useEffect, useState } from "react";
import { DeckGridContext } from "../../deck-manager";
import { DeckAddColumnSearchBox } from "./deck-add-column-search-box";
import { SettingsProps, UsernameDataItem } from "./common";
import { ICONS, notificationContentTypesFor } from "../../consts";
import useLocalStorage from "react-use/lib/useLocalStorage";
import { Button } from "@ui/button";
import i18next from "i18next";
import { UserAvatar } from "@/features/shared";
import { PREFIX } from "@/utils/local-storage";
import { useActiveAccount } from "@/core/hooks/use-active-account";

export const DeckAddColumnNotificationsSettings = ({ deckKey }: SettingsProps) => {
  const { add } = useContext(DeckGridContext);
  const { activeUser } = useActiveAccount();

  const [username, setUsername] = useState("");
  const [tag, setTag] = useState("");
  const [contentType, setContentType] = useState<string | null>(null);
  const [recent, setRecent] = useLocalStorage<UsernameDataItem[]>(PREFIX + "_dnr", []);

  // Favourites, bookmarks and scheduled posts are Ecency-only data and are served only to
  // the account they belong to, so offering them for someone else would build a column
  // that can never load.
  const contentTypes = notificationContentTypesFor(username, activeUser?.username);

  // Picking a self-only type and then changing the username to someone else would
  // otherwise leave that choice selected and let the column be created anyway.
  //
  // Skipped while the username is empty: clearing the field to re-pick an account passes
  // through "" on the way, and treating that as a switch would drop a valid selection
  // even when the same account is chosen again.
  useEffect(() => {
    if (!username) {
      return;
    }

    if (contentType && !contentTypes.some(({ type }) => type === contentType)) {
      setContentType(null);
    }
  }, [username, contentTypes, contentType]);

  return (
    <div className="deck-add-column-user-settings p-3">
      <div className="helper-text">{i18next.t("decks.columns.add-username-text")}</div>
      <div className="subtitle py-3">{i18next.t("g.username")}</div>
      {username ? (
        <div
          className="selected-user"
          role="button"
          tabIndex={0}
          onClick={() => setUsername("")}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              setUsername("");
            }
          }}
        >
          <UserAvatar size="medium" username={username} />
          <div className="username">{username}</div>
          <div className="click-to-change">{i18next.t("decks.columns.click-to-change")}</div>
        </div>
      ) : (
        <DeckAddColumnSearchBox
          username={username}
          setUsername={setUsername}
          recentList={recent}
          setRecentList={setRecent}
          setItem={({ tag }) => setTag(tag ?? "")}
        />
      )}
      {username !== "" ? (
        <>
          <div className="subtitle py-3 mt-3">{i18next.t("decks.filters")}</div>
          <div className="content-type-list">
            {contentTypes.map(({ title, type }) => (
              <div
                className={"content-type-item [&>svg]:size-8 " + (contentType === type ? "selected" : "")}
                key={title}
                role="button"
                tabIndex={0}
                aria-pressed={contentType === type}
                onClick={() => setContentType(type)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setContentType(type);
                  }
                }}
              >
                {/*@ts-ignore*/}
                {ICONS.n[type]}
                <div className="title">{title}</div>
              </div>
            ))}
          </div>
        </>
      ) : (
        <></>
      )}
      {username !== "" && contentType !== null ? (
        <Button
          disabled={!username || !contentType}
          className="w-full mt-5 sticky-bottom"
          onClick={() =>
            add({
              key: deckKey,
              type: "n",
              settings: {
                username,
                contentType,
                updateIntervalMs: 60000,
                tag
              }
            })
          }
        >
          {i18next.t("g.continue")}
        </Button>
      ) : (
        <></>
      )}
    </div>
  );
};
