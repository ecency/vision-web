"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useActiveAccount } from "@/core/hooks/use-active-account";
import { QueryIdentifiers } from "@/core/react-query";
import { newsletterApi } from "./newsletter-api";
import type { DigestCadence, DigestSubscription, DigestType, SubscribeInput } from "./types";

export function digestSubscriptionsKey(username: string | null | undefined) {
  return [QueryIdentifiers.NEWSLETTER_SUBSCRIPTIONS, username ?? "anon"] as const;
}

/** The logged-in account's live digest subscriptions. Disabled for anonymous visitors. */
export function useDigestSubscriptions() {
  const { activeUser } = useActiveAccount();
  const username = activeUser?.username;
  return useQuery({
    queryKey: digestSubscriptionsKey(username),
    enabled: Boolean(username),
    queryFn: () => newsletterApi.list(username as string),
    staleTime: 60_000,
    retry: false
  });
}

/** The live subscription for one digest, if the logged-in account holds one. */
export function useDigestSubscription(type: DigestType, target: string) {
  const query = useDigestSubscriptions();
  const subscription = (query.data ?? []).find(
    (s) => s.type === type && s.target.toLowerCase() === target.toLowerCase()
  );
  return { ...query, subscription };
}

/**
 * The address the service already holds for this account, learned from any live
 * subscription. When known, a further subscribe is one action; when unknown, the person
 * is asked for it. Anonymous visitors are always asked.
 */
export function useKnownDigestAddress(): string | null {
  const { data } = useDigestSubscriptions();
  return data?.find((s) => s.email)?.email ?? null;
}

export function useSubscribeDigest() {
  const { activeUser } = useActiveAccount();
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: ["newsletter", "subscribe"],
    mutationFn: (input: SubscribeInput) => newsletterApi.subscribe(input, activeUser?.username),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: digestSubscriptionsKey(activeUser?.username) });
    }
  });
}

export function useLeaveDigest() {
  const { activeUser } = useActiveAccount();
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: ["newsletter", "leave"],
    mutationFn: (id: string) => newsletterApi.leave(id, activeUser?.username as string),
    onSuccess: (_result, id) => {
      queryClient.setQueryData<DigestSubscription[]>(digestSubscriptionsKey(activeUser?.username), (prev) =>
        (prev ?? []).filter((s) => s.id !== id)
      );
    }
  });
}

export function useUnsubscribeAllDigests() {
  const { activeUser } = useActiveAccount();
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: ["newsletter", "unsubscribe-all"],
    mutationFn: (email: string) => newsletterApi.unsubscribeAll(email, activeUser?.username as string),
    onSuccess: () => {
      queryClient.setQueryData<DigestSubscription[]>(digestSubscriptionsKey(activeUser?.username), []);
    }
  });
}

export const CADENCES: DigestCadence[] = ["weekly", "monthly"];
