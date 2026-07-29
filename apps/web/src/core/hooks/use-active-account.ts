"use client";

import { useQuery } from "@tanstack/react-query";
import { getAccountFullQueryOptions } from "@ecency/sdk";
import { FullAccount } from "@/entities";
import { useGlobalStore } from "@/core/global-store";

/**
 * Hook to access the active user's account data with proper loading states.
 *
 * This hook replaces the need for checking `__loaded` flag by using React Query's
 * native loading states. Components should check `isLoading` instead of `__loaded`.
 *
 * @returns {Object} Account state
 * @returns {ActiveUser | null} activeUser - The raw active user object from the global store
 * @returns {string | null} username - The active username
 * @returns {FullAccount | null | undefined} account - The full account data (undefined during loading, null if no user)
 * @returns {boolean} isLoading - True during initial fetch
 * @returns {boolean} isPending - True when query is disabled or loading
 * @returns {boolean} isError - True if fetch failed
 * @returns {Error | null} error - Error object if fetch failed
 * @returns {Function} refetch - Manual refetch function
 * @returns {boolean} isSuccess - True when data is successfully loaded
 *
 * @example
 * ```tsx
 * function VotingPower() {
 *   const { account, isLoading } = useActiveAccount();
 *
 *   if (isLoading) {
 *     return <Spinner />;
 *   }
 *
 *   if (!account) {
 *     return null;
 *   }
 *
 *   const power = votingPower(account);
 *   return <span>{power}%</span>;
 * }
 * ```
 */
export function useActiveAccount() {
  const activeUser = useGlobalStore((s) => s.activeUser);
  const username = activeUser?.username ?? null;

  const query = useQuery({ ...getAccountFullQueryOptions(username ?? undefined), throwOnError: false });
  const account: FullAccount | null | undefined =
      username ? (query.data as FullAccount | null | undefined) : null;

  return {
    activeUser,
    username: username ?? null,
    account,
    isLoading: !!username && query.isLoading,
    isPending: !username || query.isPending,
    isError: query.isError,
    isSuccess: !!username && query.isSuccess,
    error: query.error,
    refetch: query.refetch
  };
}
