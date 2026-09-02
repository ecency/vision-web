import { error, success } from "@/features/shared";
import { makePathTag } from "@/features/shared/tag";
import { useActiveAccount } from "@/core/hooks/use-active-account";
import { getAccessToken } from "@/utils";
import { AccountFavoriteTag, useFavoriteTagDelete } from "@ecency/sdk";
import { Button } from "@ui/button";
import { UilTrash } from "@tooni/iconscout-unicons-react";
import i18next from "i18next";
import Link from "next/link";
import React, { useCallback, useMemo } from "react";

interface Props {
  item: AccountFavoriteTag;
  onHide: () => void;
  i: number;
}

export function FavoriteTagItem({ item, onHide, i }: Props) {
  const { activeUser } = useActiveAccount();
  const username = activeUser?.username;
  const accessToken = useMemo(
    () => (username ? getAccessToken(username) : undefined),
    [username]
  );

  const { mutateAsync: unfollow, isPending: isDeletePending } = useFavoriteTagDelete(
    username,
    accessToken,
    () => success(i18next.t("follow-tag.deleted")),
    () => error(i18next.t("g.server-error"))
  );

  const remove = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
      unfollow(item.tag);
    },
    [item.tag, unfollow]
  );

  return (
    <div className="animate-fade-in-up" style={{ animationDelay: `${Math.min(i, 5) * 50}ms` }}>
      <Link href={makePathTag("created", item.tag)} onClick={onHide}>
        <div className="bg-white rounded-lg border border-[--border-color] p-2 md:p-4 flex items-center justify-between gap-2 md:gap-4">
          <span className="font-bold notranslate truncate">#{item.tag}</span>
          <Button
            icon={<UilTrash />}
            appearance="gray-link"
            size="sm"
            isLoading={isDeletePending}
            onClick={remove}
            aria-label={i18next.t("follow-tag.delete")}
          />
        </div>
      </Link>
    </div>
  );
}
