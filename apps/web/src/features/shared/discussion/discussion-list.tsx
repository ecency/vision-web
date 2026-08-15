"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useLocation, useMount, useUnmount } from "react-use";
import { DiscussionItem } from "./discussion-item";
import { Community, Entry, ROLES } from "@/entities";
import { getMutedUsersQueryOptions, getBotsQueryOptions } from "@ecency/sdk";
import { useQuery } from "@tanstack/react-query";
import i18next from "i18next";
import { useActiveAccount } from "@/core/hooks/use-active-account";
import { htmlPositionManager } from "@/utils/html-position-manager";

interface Props {
    hideControls: boolean;
    root: Entry;
    parent: Entry;
    isRawContent: boolean;
    community: Community | null;
    discussionList: Entry[];
}

export function DiscussionList({
   parent,
   root,
   hideControls,
   isRawContent,
   community,
   discussionList
}: Props) {
    const [isHiddenPermitted, setIsHiddenPermitted] = useState(false);

    const { activeUser } = useActiveAccount();

    const location = useLocation();
    const { data: mutedUsers = [] } = useQuery(getMutedUsersQueryOptions(activeUser?.username));
    const { data: botsList = [] } = useQuery(getBotsQueryOptions());

    const canMute = useMemo(() => {
        return !!activeUser && !!community &&
            community.team.some(
                ([user, role]) =>
                    user === activeUser.username &&
                    [ROLES.OWNER.toString(), ROLES.ADMIN.toString(), ROLES.MOD.toString()].includes(role)
            );
    }, [activeUser, community]);

    const filtered = useMemo(
        () =>
            discussionList.filter(
                (x) => x.parent_author === parent.author && x.parent_permlink === parent.permlink
            ),
        [discussionList, parent]
    );

    const hiddenContent = useMemo(
        () =>
            filtered.filter(
                (item) =>
                    item.parent_author === parent.author &&
                    ((!!activeUser && mutedUsers.includes(item.author)) || item.author_reputation < 0)
            ),
        [activeUser, filtered, mutedUsers, parent.author]
    );

    // Identify a comment by author/permlink. `bridge.get_discussion` returns no
    // `post_id`, so the previous `fd.post_id === md.post_id` check compared
    // `undefined` with `undefined` and matched every comment: a single hidden
    // reply emptied the whole list.
    const hiddenKeys = useMemo(
        () => new Set(hiddenContent.map((item) => `${item.author}/${item.permlink}`)),
        [hiddenContent]
    );

    const data = useMemo(() => {
        const visibleContent = filtered.filter(
            (md) => !hiddenKeys.has(`${md.author}/${md.permlink}`)
        );
        return isHiddenPermitted ? [...visibleContent, ...hiddenContent] : visibleContent;
    }, [filtered, hiddenContent, hiddenKeys, isHiddenPermitted]);

    const botsFreeData = useMemo(
        () =>
            data.filter((entry) =>
                botsList.includes(entry.author) ? entry.children > 0 : true
            ),
        [botsList, data]
    );

    useMount(() => {
        htmlPositionManager.addReference();
    });
    useUnmount(() => {
        htmlPositionManager.removeReference();
    });

    useEffect(() => {
        if (!location.hash) return;

        const permlink = location.hash.replace("#", "");
        const anchorId = `anchor-${permlink}`;

        const tryScroll = () => {
            const el = document.getElementById(anchorId);
            if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
        };

        tryScroll();

        const timeout = setTimeout(tryScroll, 1000); // retry after render
        return () => clearTimeout(timeout);
    }, [discussionList, location]);

    return filtered.length > 0 ? (
        <div className="discussion-list">
            {botsFreeData.map((d) => (
                <DiscussionItem
                    root={root}
                    discussionList={discussionList}
                    community={community}
                    key={`${d.author}-${d.permlink}`}
                    entry={d}
                    hideControls={hideControls}
                    isRawContent={isRawContent}
                    botsList={botsList}
                    mutedUsers={mutedUsers}
                    canMute={canMute}
                />
            ))}
            {!isHiddenPermitted && hiddenContent.length > 0 && (
                <div className="hidden-warning flex justify-between flex-1 items-center mt-3">
                    <div className="flex-1">
                        {i18next.t("discussion.reveal-muted-long-description")}
                    </div>
                    <div
                        role="button"
                        tabIndex={0}
                        onClick={() => setIsHiddenPermitted(true)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            setIsHiddenPermitted(true);
                          }
                        }}
                        className="pointer p-3"
                    >
                        <b>{i18next.t("g.show")}</b>
                    </div>
                </div>
            )}
        </div>
    ) : null;
}
