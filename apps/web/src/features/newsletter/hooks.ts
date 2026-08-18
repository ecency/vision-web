"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useActiveAccount } from "@/core/hooks/use-active-account";
import { QueryIdentifiers } from "@/core/react-query";
import { newsletterApi } from "./newsletter-api";
import { useNewsletterEnabled } from "./runtime";
import type { DigestCadence, DigestSubscription, DigestType, SubscribeInput } from "./types";

export function digestSubscriptionsKey(username: string | null | undefined) {
  return [QueryIdentifiers.NEWSLETTER_SUBSCRIPTIONS, username ?? "anon"] as const;
}
export const newsletterKeys = {
  confirmInspect: (token: string) => [QueryIdentifiers.NEWSLETTER_CONFIRM_INSPECT, token] as const,
  unsubscribeInspect: (token: string) => [QueryIdentifiers.NEWSLETTER_UNSUBSCRIBE_INSPECT, token] as const,
  mutation: (name: "subscribe" | "leave" | "unsubscribe-all") =>
    [QueryIdentifiers.NEWSLETTER_SUBSCRIPTIONS, name] as const
};

/** The signed-in username, or a thrown error: mutations here are never anonymous. */
function requireUsername(username: string | null | undefined): string {
  if (!username) throw new Error("newsletter: not signed in");
  return username;
}

/**
 * The logged-in account's live digest subscriptions. Disabled for anonymous
 * visitors, and disabled when the feature is off: callers render nothing then,
 * and a request that predictably 503s on an unconfigured deployment is noise.
 */
export function useDigestSubscriptions() {
  const { activeUser } = useActiveAccount();
  const enabled = useNewsletterEnabled();
  const username = activeUser?.username;
  return useQuery({
    queryKey: digestSubscriptionsKey(username),
    enabled: enabled && Boolean(username),
    queryFn: () => newsletterApi.list(requireUsername(username)),
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
    mutationKey: newsletterKeys.mutation("subscribe"),
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
    mutationKey: newsletterKeys.mutation("leave"),
    mutationFn: (id: string) => newsletterApi.leave(id, requireUsername(activeUser?.username)),
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
    mutationKey: newsletterKeys.mutation("unsubscribe-all"),
    mutationFn: (email: string) => newsletterApi.unsubscribeAll(email, requireUsername(activeUser?.username)),
    // Only THAT address stops. An account can hold subscriptions under more than
    // one address; those stay, and must stay visible.
    onSuccess: (_result, email) => {
      queryClient.setQueryData<DigestSubscription[]>(digestSubscriptionsKey(activeUser?.username), (prev) =>
        (prev ?? []).filter((s) => s.email.toLowerCase() !== email.toLowerCase())
      );
    }
  });
}

export const CADENCES: DigestCadence[] = ["weekly", "monthly"];
