"use client";

import { AccountActivities } from "@/features/shared/account-activities";
import { Community } from "@/entities";

interface Props {
  community: Community;
}

export function CommunityActivities({ community }: Props) {
  return <AccountActivities account={community.name} />;
}
