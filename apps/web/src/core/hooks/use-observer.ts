"use client";

import { useGlobalStore } from "@/core/global-store";
import { DEFAULT_OBSERVER } from "@/consts/observer";

/**
 * The observer to send on bridge reads from a client component: the logged-in
 * user when there is one, otherwise Ecency's shared moderation account.
 *
 * Hydration-safe by construction. `activeUser` is null during the SSR pass and
 * stays null through the first client render, because `client-init.tsx`
 * restores it from localStorage inside `useMount`, which runs after hydration.
 * So the first client render resolves to DEFAULT_OBSERVER, exactly matching the
 * server-rendered markup and the dehydrated query cache. The store then
 * rehydrates, this returns the username, and React Query refetches under the
 * new key. Reading the active-user cookie directly during render would instead
 * resolve to the username on the client and DEFAULT_OBSERVER on the server,
 * which is precisely the mismatch this avoids.
 */
export function useObserver() {
  const activeUser = useGlobalStore((s) => s.activeUser);
  return activeUser?.username ?? DEFAULT_OBSERVER;
}
