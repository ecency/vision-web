import { ProfileLink, UserAvatar } from "@/features/shared";
import { ProBadge } from "@/features/pro";
import { accountReputation } from "@/utils";
import i18next from "i18next";
import { Friend } from "@/app/(dynamicPages)/profile/[username]/_components/friends/types";

interface Props {
  item: Friend;
}

export function FriendListItem({ item }: Props) {
  return (
    <div className="list-item">
      <div className="item-main">
        <ProfileLink username={item.name}>
          <UserAvatar username={item.name} size="small" />
        </ProfileLink>
        <div className="item-info">
          <ProfileLink username={item.name}>
            <span className="item-name notranslate">{item.name}</span>
          </ProfileLink>
          {/* .item-name carries the leading gap; the reputation pill that follows has none. */}
          <ProBadge username={item.name} className="mr-1" />
          {item?.reputation !== undefined && (
            <span className="item-reputation">{accountReputation(item.reputation)}</span>
          )}
        </div>
      </div>
      <div className="last-seen mt-1">
        <a href="#">{`${i18next.t("friends.active")} ${item.lastSeen}`}</a>
      </div>
    </div>
  );
}
