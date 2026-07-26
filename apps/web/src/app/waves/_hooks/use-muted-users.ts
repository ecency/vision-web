"use client";

import { getMutedUsersQueryOptions } from "@ecency/sdk";
import { useQuery } from "@tanstack/react-query";
import { useActiveAccount } from "@/core/hooks/use-active-account";

// No limit argument: the query pages the whole mute list. It used to take one,
// but the cache key is the username alone, so this hook's limit of 1000 and the
// entry-list/discussion components' default of 100 wrote over each other in a
// single cache entry and mount order decided which list won.
export function useMutedUsers() {
  const { activeUser } = useActiveAccount();

  return useQuery(getMutedUsersQueryOptions(activeUser?.username));
}
