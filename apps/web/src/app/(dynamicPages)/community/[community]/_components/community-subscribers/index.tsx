"use client";

import React, { useMemo, useState } from "react";
import "./_index.scss";
import {
  getCommunitySubscribersInfiniteQueryOptions,
  getAccountsQueryOptions
} from "@ecency/sdk";
import { useInfiniteQuery, useQueries } from "@tanstack/react-query";
import { Community, roleMap, Subscription } from "@/entities";
import { LinearProgress, ProfileLink, UserAvatar } from "@/features/shared";
import { ProBadge } from "@/features/pro";
import { accountReputation } from "@/utils";
import { useActiveAccount } from "@/core/hooks/use-active-account";
import { pencilOutlineSvg } from "@ui/svg";
import { Button } from "@ui/button";
import i18next from "i18next";
import { CommunityRoleEditDialog } from "@/app/(dynamicPages)/community/[community]/_components/community-role-edit";

interface Props {
  community: Community;
}

export function CommunitySubscribers({ community }: Props) {
  const { activeUser } = useActiveAccount();
  const [editingSubscriber, setEditingSubscriber] = useState<Subscription>();

  // Paged: `list_subscribers` caps at 100 rows per call, so a single request
  // showed only the first 100 accounts alphabetically and presented them as the
  // whole roster. Communities routinely run to thousands.
  const {
    data: subscribersRaw,
    isLoading,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage
  } = useInfiniteQuery(getCommunitySubscribersInfiniteQueryOptions(community.name));

  // ✅ normalize query result to an array
  const subscribers = useMemo<Subscription[]>(
      () => (subscribersRaw?.pages?.flat() as Subscription[]) ?? [],
      [subscribersRaw]
  );

  // Account details are fetched one batch per loaded page, not as one growing
  // list. `getAccountsQueryOptions` keys on the usernames it is given, so
  // passing the accumulated roster would mint a new key per page and refetch
  // every account already loaded: 100, then 200, then 300, each cached
  // separately. Page contents never change once fetched, so a per-page batch
  // has a stable key and is fetched exactly once.
  const usernameBatches = useMemo(() => {
    const teamUsernames = community.team
        .filter((x) => !x[0].startsWith("hive-"))
        .map((x) => x[0]);
    const inTeam = new Set(teamUsernames);

    const pageBatches = (subscribersRaw?.pages ?? []).map((page) =>
        (page as Subscription[])
            .map((x) => x[0])
            .filter((username) => !inTeam.has(username))
    );

    return [teamUsernames, ...pageBatches].filter((batch) => batch.length > 0);
  }, [community.team, subscribersRaw]);

  const accountQueries = useQueries({
    queries: usernameBatches.map((batch) => getAccountsQueryOptions(batch))
  });

  // ✅ default to []
  const accounts = useMemo(
      () => accountQueries.flatMap((query) => query.data ?? []),
      [accountQueries]
  );

  const role = useMemo(
      () => community.team.find((x) => x[0] === activeUser?.username),
      [activeUser?.username, community.team]
  );
  const roleInTeam = role ? role[1] : null;
  const canEditTeam = !!(roleInTeam && roleMap[roleInTeam]);
  const roles = roleInTeam ? roleMap[roleInTeam] : [];

  return (
      <div className="community-subscribers mt-4 md:mt-8">
        {isLoading && <LinearProgress />}

        {!isLoading && subscribers.length > 0 && (
            <div className="user-list">
              <div className="list-body">
                {subscribers.map((item) => {
                  const [username, role] = item;
                  const account = accounts.find((x) => x.name === username);
                  const canEditRole = roles.includes(role);

                  return (
                      <div className="list-item" key={username}>
                        <div className="item-main">
                          <ProfileLink username={username}>
                            <UserAvatar username={username} size="small" />
                          </ProfileLink>
                          <div className="item-info">
                            <ProfileLink username={username}>
                              <span className="item-name notranslate">{username}</span>
                            </ProfileLink>
                            {/* .item-name carries the leading gap; the reputation pill that follows has none. */}
                            <ProBadge username={username} className="mr-1" />
                            {account?.reputation !== undefined && (
                                <span className="item-reputation">
                          {accountReputation(account.reputation)}
                        </span>
                            )}
                          </div>
                        </div>

                        {canEditTeam && (
                            <div className="item-extra">
                              {role}
                              {canEditRole && (
                                  <a
                                      href="#"
                                      className="btn-edit-role [&>svg]:size-3"
                                      onClick={(e) => {
                                        e.preventDefault();
                                        setEditingSubscriber(item);
                                      }}
                                  >
                                    {pencilOutlineSvg}
                                  </a>
                              )}
                            </div>
                        )}
                      </div>
                  );
                })}
              </div>
            </div>
        )}

        {hasNextPage && (
            <div className="flex justify-center mt-4">
              <Button
                  disabled={isFetchingNextPage}
                  onClick={() => fetchNextPage()}
                  size="sm"
                  appearance="secondary"
              >
                {i18next.t("g.load-more")}
              </Button>
            </div>
        )}

        {editingSubscriber && (
            <CommunityRoleEditDialog
                community={community}
                user={editingSubscriber[0]}
                role={editingSubscriber[1]}
                roles={roles}
                onHide={() => setEditingSubscriber(undefined)}
            />
        )}
      </div>
  );
}
