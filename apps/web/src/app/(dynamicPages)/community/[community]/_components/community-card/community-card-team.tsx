"use client";

import i18next from "i18next";
import { accountGroupSvg } from "@ui/svg";
import React, { useMemo } from "react";
import { Community } from "@/entities";
import { DialogInfo } from "../../_types";
import { ProfileLink } from "@/features/shared";
import { ProBadge } from "@/features/pro";

interface Props {
  community: Community;
  toggleInfo: (info: DialogInfo) => void;
}

export function CommunityCardTeam({ community, toggleInfo }: Props) {
  const team = useMemo(
    () =>
      community.team.map((m, i) => {
        if (m[0].startsWith("hive-")) {
          return <div key={i} />;
        }

        return (
          <div className="team-member" key={i}>
            <ProfileLink username={m[0]}>
              <span className="username">{`@${m[0]}`}</span>
            </ProfileLink>
            {/* .username carries the leading gap; the role label that follows has none. */}
            <ProBadge username={m[0]} className="mr-1" />
            <span className="role">{m[1]}</span>
            {m[2] !== "" && <span className="extra">{m[2]}</span>}
          </div>
        );
      }),
    [community.team]
  );

  return (
    <div className="community-section section-team">
      <div
        className="section-header [&>svg]:size-3.5 md:[&>svg]:size-4"
        role="button"
        tabIndex={0}
        onClick={() => toggleInfo({ title: i18next.t("community-card.team"), content: team })}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            toggleInfo({ title: i18next.t("community-card.team"), content: team });
          }
        }}
      >
        {accountGroupSvg} {i18next.t("community-card.team")}
      </div>
      <div className="section-content">{team.map((item) => item)}</div>
    </div>
  );
}
