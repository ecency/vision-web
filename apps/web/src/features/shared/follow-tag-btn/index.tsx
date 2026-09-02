"use client";

import { useActiveAccount } from "@/core/hooks/use-active-account";
import { error, LoginRequired, success } from "@/features/shared";
import { getAccessToken } from "@/utils";
import {
  AccountFavoriteTag,
  getFavoriteTagsInfiniteQueryOptions,
  normalizeTag,
  useFavoriteTagAdd,
  useFavoriteTagDelete
} from "@ecency/sdk";
import { useInfiniteQuery, useIsMutating } from "@tanstack/react-query";
import { UilCheck, UilPlus } from "@tooni/iconscout-unicons-react";
import { Button } from "@ui/button";
import { Tooltip } from "@ui/tooltip";
import i18next from "i18next";
import { KeyboardEvent, MouseEvent, useCallback, useMemo } from "react";

/**
 * A user can follow at most this many tags (the server refuses the next one), and
 * the list endpoint pages at this size at most, so one page is the whole list.
 */
export const FOLLOWED_TAGS_PAGE_SIZE = 100;

/** The user's followed tags, as one page covering the cap. */
export function useFollowedTags(username: string | undefined, accessToken: string | undefined) {
  const query = useInfiniteQuery(
    getFavoriteTagsInfiniteQueryOptions(username, accessToken, FOLLOWED_TAGS_PAGE_SIZE)
  );
  const tags = useMemo<AccountFavoriteTag[] | undefined>(
    () => query.data?.pages.flatMap((page) => page.data),
    [query.data]
  );
  return { ...query, tags };
}

/**
 * Follow state and actions for one hashtag.
 *
 * Reads the user's whole followed list (one request, cached) rather than one
 * check query per tag: a post footer shows up to ten chips at once, and the
 * Topics card thirty. The paginated endpoint is used at the cap, since the
 * plain list answers its default page of 20 and would misread the 21st tag.
 */
export function useFollowTag(rawTag: string) {
  const tag = useMemo(() => normalizeTag(rawTag), [rawTag]);
  const { activeUser } = useActiveAccount();
  const username = activeUser?.username;
  const accessToken = useMemo(
    () => (username ? getAccessToken(username) : undefined),
    [username]
  );

  const { tags: data, isPending, isFetching, isError, refetch } = useFollowedTags(username, accessToken);
  // Pending state shared across every control for this user on the page (the tag
  // feed header and the Topics card can both show the same tag), so two clicks
  // cannot both send an add before the list refreshes.
  const isMutating = useIsMutating({ mutationKey: ["accounts", "favorite-tags"] }) > 0;
  const { mutateAsync: add, isPending: isAddPending } = useFavoriteTagAdd(
    username,
    accessToken,
    () => success(i18next.t("follow-tag.added")),
    () => error(i18next.t("g.server-error"))
  );
  const { mutateAsync: remove, isPending: isDeletePending } = useFavoriteTagDelete(
    username,
    accessToken,
    () => success(i18next.t("follow-tag.deleted")),
    () => error(i18next.t("g.server-error"))
  );

  const canMutate = !!username && !!accessToken;
  const followed = useMemo(
    () => !!tag && (data?.some((f) => f.tag === tag) ?? false),
    [data, tag]
  );
  // While the list is being (re)fetched its answer is not known: after an add the
  // SDK invalidates it, and in that window a stale "unfollowed" with an enabled
  // control would accept a second add. isPending alone misses it, since cached
  // data keeps isPending false during a refetch.
  const inProgress =
    isAddPending ||
    isDeletePending ||
    isMutating ||
    (canMutate && (isFetching || (isPending && !isError)));

  const toggle = useCallback(async () => {
    if (!tag || !canMutate || inProgress) {
      return;
    }
    // A list that failed to load says nothing about the tag; a missing list
    // would read every tag as unfollowed and send an add for one the user
    // already follows. Ask again before acting, and act on that answer.
    let list = isError ? undefined : data;
    if (!list) {
      list = (await refetch()).data?.pages.flatMap((page) => page.data);
      if (!list) {
        return;
      }
    }
    // The hooks already toast the failure; a rejection here would only surface
    // as an unhandled promise in every control that fires and forgets.
    try {
      if (list.some((f) => f.tag === tag)) {
        await remove(tag);
      } else {
        await add(tag);
      }
    } catch {
      // reported by the mutation's onError
    }
  }, [add, canMutate, data, inProgress, isError, refetch, remove, tag]);

  return { tag, followed, inProgress, canMutate, isLoggedIn: !!activeUser, toggle };
}

interface FollowTagBtnProps {
  tag: string;
  size?: "xs" | "sm";
}

/** The Follow / Following button on a tag feed's header. */
export function FollowTagBtn({ tag, size = "sm" }: FollowTagBtnProps) {
  const { tag: normalized, followed, inProgress, canMutate, isLoggedIn, toggle } = useFollowTag(tag);

  if (!normalized) {
    return null;
  }

  const label = i18next.t(followed ? "follow-tag.delete" : "follow-tag.add");
  const text = i18next.t(followed ? "follow-tag.following" : "follow-tag.follow");

  if (!isLoggedIn) {
    // Visible to a signed-out reader; activating it opens the login modal.
    return (
      <LoginRequired promptOnAnon>
        <Button
          size={size}
          appearance="primary"
          icon={followed ? <UilCheck /> : <UilPlus />}
          iconPlacement="left"
          aria-label={label}
        >
          {text}
        </Button>
      </LoginRequired>
    );
  }

  return (
    <Tooltip content={label}>
      <Button
        size={size}
        appearance={followed ? "pressed" : "primary"}
        icon={followed ? <UilCheck /> : <UilPlus />}
        iconPlacement="left"
        isLoading={inProgress}
        disabled={!canMutate}
        onClick={() => toggle()}
        aria-label={label}
        aria-pressed={followed}
      >
        {text}
      </Button>
    </Tooltip>
  );
}

interface FollowTagChipToggleProps {
  tag: string;
}

/**
 * The small follow control at the trailing edge of a tag chip. It sits inside
 * the chip's link, so it stops the click before the link navigates, the same
 * way the Topics card's dismiss control does. Renders nothing for a value that
 * is not a followable tag (a community, or a tag outside the allowed shape).
 */
export function FollowTagChipToggle({ tag }: FollowTagChipToggleProps) {
  const { tag: normalized, followed, inProgress, canMutate, isLoggedIn, toggle } = useFollowTag(tag);

  if (!normalized) {
    return null;
  }

  const label = i18next.t(followed ? "follow-tag.delete" : "follow-tag.add");
  // Signed in without an access token is a supported state (the favorite button
  // renders disabled for it too), and so is "busy": the list still loading or
  // refetching, or a mutation in flight. Either way the control must say it
  // cannot be activated rather than look enabled and swallow the click. Busy
  // keeps focus, so a control the user just activated does not lose it.
  const noToken = isLoggedIn && !canMutate;
  const disabled = noToken || (isLoggedIn && inProgress);
  const activate = (e: MouseEvent | KeyboardEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!disabled) {
      void toggle();
    }
  };

  const control = (
    <span
      role="button"
      tabIndex={noToken ? -1 : 0}
      aria-label={label}
      aria-pressed={isLoggedIn ? followed : undefined}
      aria-busy={inProgress || undefined}
      aria-disabled={disabled || undefined}
      title={label}
      className={
        "ml-1 -mr-0.5 inline-flex shrink-0 items-center justify-center rounded-full size-4 transition-colors " +
        (noToken
          ? "cursor-not-allowed text-gray-400 opacity-50 dark:text-gray-500"
          : disabled
            ? "cursor-wait text-gray-400 opacity-50 dark:text-gray-500"
            : followed
              ? "text-blue-dark-sky dark:text-blue-dark-sky"
              : "text-gray-500 hover:text-blue-dark-sky dark:text-gray-400 dark:hover:text-blue-dark-sky")
      }
      onClick={activate}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          activate(e);
        }
      }}
    >
      {followed ? <UilCheck className="size-3.5" /> : <UilPlus className="size-3.5" />}
    </span>
  );

  return isLoggedIn ? control : <LoginRequired promptOnAnon>{control}</LoginRequired>;
}
