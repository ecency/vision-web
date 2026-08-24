import React, { useMemo } from "react";
import { ProfileLink } from "@/features/shared/profile-link";
import { UserAvatar } from "@/features/shared/user-avatar";
import { chevronUpSvg } from "@ui/svg";
import { downVotingPower, votingPower } from "@ecency/sdk";
import i18next from "i18next";
import { useActiveAccount } from "@/core/hooks";

export function NavbarSideUserInfo() {
  const { username, account, isLoading } = useActiveAccount();

  const { upPower, downPower } = useMemo(() => {
    // Show loading state while fetching account data
    if (isLoading || !account) {
      return { upPower: null, downPower: null };
    }

    const voting = votingPower(account);
    const downVoting = downVotingPower(account);

    return {
      upPower: voting,
      downPower: downVoting
    };
  }, [account, isLoading]);

  return (
    <div className="flex items-center gap-3 max-w-[16rem] truncate">
      <ProfileLink username={username!}>
        <UserAvatar username={username!} size="medium" />
      </ProfileLink>
      <div>
        <div className="font-semibold">{username}</div>
        <div className="flex flex-col text-xs">
          <div className="flex items-center">
            <div className="[&>svg]:size-4 text-blue-dark-sky">
              {chevronUpSvg}
              {upPower === null ? "--" : upPower.toFixed(2)}%
            </div>
            <div className="[&>svg]:size-4 [&>svg]:rotate-180 text-red">
              {chevronUpSvg}
              {downPower === null ? "--" : downPower.toFixed(2)}%
            </div>
          </div>
          <div className="opacity-50">{i18next.t("user-nav.vote-power")}</div>
        </div>
      </div>
    </div>
  );
}
