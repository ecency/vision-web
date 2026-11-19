"use client";

import { useActiveAccount } from "@/core/hooks/use-active-account";

import { Community } from "@/entities";
import { LoginRequired } from "@/features/shared";
import {
  useSubscribeCommunityMutation,
  useUnsubscribeCommunityMutation
} from "@/api/sdk-mutations";
import {
  AccountSubscription,
  getAccountSubscriptionsQueryOptions,
  normalizeAccountSubscriptions
} from "@ecency/sdk";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, ButtonProps } from "@ui/button";
import { Spinner } from "@ui/spinner";
import i18next from "i18next";
import { useMemo, useState } from "react";

interface Props {
  community: Community;
  buttonProps?: ButtonProps;
}

export function SubscriptionBtn({ buttonProps, community }: Props) {
  const { activeUser } = useActiveAccount();
  const [hover, setHover] = useState(false);
  const [isSettling, setIsSettling] = useState(false);
  const queryClient = useQueryClient();

  const subscriptionsQueryOptions = getAccountSubscriptionsQueryOptions(activeUser?.username);
  const { data: subscriptions } = useQuery(subscriptionsQueryOptions);
  const subscribeMutation = useSubscribeCommunityMutation();
  const unsubscribeMutation = useUnsubscribeCommunityMutation();
  const isPending = subscribeMutation.isPending || unsubscribeMutation.isPending || isSettling;

  // The query normalises its rows, but the cache is shared and can hold what
  // another writer put there, so read it through the same normaliser.
  const subscribed = useMemo(
    () => normalizeAccountSubscriptions(subscriptions).some((x) => x[0] === community.name),
    [subscriptions, community]
  );

  const performAction = async (
    mutation: typeof subscribeMutation | typeof unsubscribeMutation
  ) => {
    const previousData = normalizeAccountSubscriptions(
      queryClient.getQueryData<unknown>(subscriptionsQueryOptions.queryKey)
    );
    const joinedRow: AccountSubscription = [community.name, community.title, "guest", ""];
    const optimisticData =
      mutation === subscribeMutation
        ? [...previousData, joinedRow]
        : previousData.filter((x) => x[0] !== community.name);

    // Optimistic update
    queryClient.setQueryData(subscriptionsQueryOptions.queryKey, optimisticData);

    try {
      setIsSettling(true);
      await mutation.mutateAsync({ community: community.name });
      // SDK's invalidateQueries fires in onSuccess, triggering a refetch that may
      // return stale data (blockchain hasn't confirmed yet). Cancel it and re-apply
      // the optimistic data to prevent the stale refetch from overwriting the UI.
      await queryClient.cancelQueries({ queryKey: subscriptionsQueryOptions.queryKey });
      queryClient.setQueryData(subscriptionsQueryOptions.queryKey, optimisticData);
    } catch {
      // Rollback on error
      queryClient.setQueryData(subscriptionsQueryOptions.queryKey, previousData);
    } finally {
      setIsSettling(false);
    }
  };

  return (
    <>
      {subscribed && (
        <Button
          icon={isPending && <Spinner className="size-3.5" />}
          disabled={isPending}
          onMouseEnter={() => setHover(true)}
          onMouseLeave={() => setHover(false)}
          onClick={() => performAction(unsubscribeMutation)}
          outline={true}
          appearance={hover ? "danger" : "primary"}
          {...buttonProps}
        >
          {hover ? i18next.t("community.unsubscribe") : i18next.t("community.subscribed")}
        </Button>
      )}
      {!subscribed && (
        <LoginRequired>
          <Button
            icon={isPending && <Spinner className="size-3.5" />}
            disabled={isPending}
            onClick={() => performAction(subscribeMutation)}
            {...buttonProps}
          >
            {i18next.t("community.subscribe")}
          </Button>
        </LoginRequired>
      )}
    </>
  );
}
