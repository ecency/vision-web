"use client";

import { useActiveAccount } from "@/core/hooks/use-active-account";
import { error, LoginRequired, success } from "@/features/shared";
import { getAccessToken } from "@/utils";
import {
  getFavoriteTagsQueryOptions,
  normalizeTag,
  useFavoriteTagAdd,
  useFavoriteTagDelete
} from "@ecency/sdk";
import { useQuery } from "@tanstack/react-query";
import { UilCheck, UilPlus } from "@tooni/iconscout-unicons-react";
import { Button } from "@ui/button";
import { Tooltip } from "@ui/tooltip";
import i18next from "i18next";
import { KeyboardEvent, MouseEvent, useCallback, useMemo } from "react";

/**
 * Follow state and actions for one hashtag.
 *
 * Reads the user's whole followed list (one request, cached, at most 100 rows)
 * rather than one check query per tag: a post footer shows up to ten chips at
 * once, and the Topics card thirty.
 */
export function useFollowTag(rawTag: string) {
  const tag = useMemo(() => normalizeTag(rawTag), [rawTag]);
  const { activeUser } = useActiveAccount();
  const username = activeUser?.username;
  const accessToken = useMemo(
    () => (username ? getAccessToken(username) : undefined),
    [username]
  );

  const { data, isPending } = useQuery(getFavoriteTagsQueryOptions(username, accessToken));
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
  const inProgress = isAddPending || isDeletePending || (canMutate && isPending);

  const toggle = useCallback(async () => {
    if (!tag || !canMutate || inProgress) {
      return;
    }
    if (followed) {
      await remove(tag);
    } else {
      await add(tag);
    }
  }, [add, canMutate, followed, inProgress, remove, tag]);

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
  const activate = (e: MouseEvent | KeyboardEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (canMutate) {
      void toggle();
    }
  };

  const control = (
    <span
      role="button"
      tabIndex={0}
      aria-label={label}
      aria-pressed={isLoggedIn ? followed : undefined}
      aria-busy={inProgress || undefined}
      title={label}
      className={
        "ml-1 -mr-0.5 inline-flex shrink-0 items-center justify-center rounded-full size-4 transition-colors " +
        (followed
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
