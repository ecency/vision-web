import React, { useMemo } from "react";
import "./index.scss";
import { IntentLink } from "@/features/shared/intent-link";
import { Community } from "@/entities";
import { ProfileLink, UserAvatar } from "@/features/shared";
import { SubscriptionBtn } from "../../communities/_components/subscription-btn";
import { AllFilter } from "@/enums";
import { formattedNumber, makePath } from "@/utils";
import i18next from "i18next";

interface Props {
  community: Community;
  small?: boolean;
  vertical?: boolean;
}

export function CommunityListItem({ community, small, vertical }: Props) {
  const subscribers = useMemo(
    () => formattedNumber(community.subscribers, { fractionDigits: 0 }),
    [community]
  );
  const authors = useMemo(
    () => formattedNumber(community.num_authors, { fractionDigits: 0 }),
    [community]
  );
  const posts = useMemo(
    () => formattedNumber(community.num_pending, { fractionDigits: 0 }),
    [community]
  );

  return (
    <div className={"community-list-item " + (small ? "small" : "") + (vertical ? "vertical" : "")}>
      <div className="item-content">
        <h2 className="item-title">
          <div className="item-details">
            <UserAvatar username={community.name} size={small ? "small" : "medium"} />
            <IntentLink href={makePath(AllFilter.hot, community.name)}>{community.title}</IntentLink>
          </div>
          {small && (
            <div className="item-controls">
              <SubscriptionBtn
                community={community}
                buttonProps={{ full: true, size: small ? "sm" : undefined }}
              />
            </div>
          )}
        </h2>
        <div className={"item-about " + (small ? "truncate" : "")}>{community.about}</div>
        <div className="item-stats">
          <div className="stat">{i18next.t("communities.n-subscribers", { n: subscribers })}</div>
          <div className="stat">{i18next.t("communities.n-authors", { n: authors })}</div>
          <div className="stat">{i18next.t("communities.n-posts", { n: posts })}</div>
        </div>
        {community.admins && (
          <div className="item-admins">
            {i18next.t("communities.admins")}
            {community.admins.map((x, i) => (
              <ProfileLink key={x} username={x}>
                <span className="admin">{x}</span>
              </ProfileLink>
            ))}
          </div>
        )}
      </div>
      {!small && (
        <div className="item-controls">
          <SubscriptionBtn
            community={community}
            buttonProps={{ full: true, size: small ? "sm" : undefined }}
          />
        </div>
      )}
    </div>
  );
}

export * from "./community-list-item-loading";
