import { EcencySourceBadge, UserAvatar } from "@/features/shared";
import Link from "next/link";
import i18next from "i18next";
import { Spinner } from "@ui/spinner";
import React from "react";
import { WaveEntry } from "@/entities";
import { Button } from "@ui/button";
import { Badge } from "@ui/badge";
import { UilArrowRight, UilMultiply } from "@tooni/iconscout-unicons-react";
import { TimeLabel } from "@/features/shared";
import clsx from "clsx";
import { useActiveAccount } from "@/core/hooks/use-active-account";
import { ProBadge } from "@/features/pro";

interface Props {
  entry: WaveEntry;
  hasParent: boolean;
  pure: boolean;
  status: string;
  interactable: boolean;
  onViewFullThread?: (e: React.MouseEvent) => void;
  now?: number;
  className?: string;
  onClose?: () => void;
}

export function WavesListItemHeader({
  entry,
  status,
  hasParent,
  pure,
  onViewFullThread,
  interactable,
  now,
  className,
  onClose
}: Props) {
  const { activeUser } = useActiveAccount();

  return (
    <div
      className={clsx("flex justify-between px-4 pt-4 pointer", className)}
      role="button"
      tabIndex={0}
      aria-label={i18next.t("waves.view-thread", { defaultValue: "View thread" })}
      onClick={onViewFullThread}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onViewFullThread?.(e as unknown as React.MouseEvent);
        }
      }}
    >
      <div className="flex items-center gap-4">
        <UserAvatar size="deck-item" username={entry.author} />
        <div className="flex flex-col truncate">
          <div className="flex items-center gap-2">
            <Link className="font-semibold text-sm" href={`/@${entry.author}`}>
              {entry.author}
            </Link>
            <ProBadge username={entry.author} />
            {activeUser?.username === entry.author && (
              <Badge className="!py-0 !text-[0.675rem]">{i18next.t("g.you")}</Badge>
            )}
          </div>
          {hasParent && !pure && (
            <>
              <span>{i18next.t("decks.columns.replied-to")}</span>
              <Link href={`/@${entry.parent_author}`}>{entry.parent_author}</Link>
            </>
          )}

          <div className="flex items-center gap-1 text-sm text-gray-600 dark:text-gray-400">
            <TimeLabel created={entry.created} refresh={now} />
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <EcencySourceBadge app={entry.json_metadata?.app} size={16} />
        {onClose ? (
          <Button
            noPadding={true}
            appearance="gray-link"
            size="sm"
            icon={<UilMultiply />}
            onClick={(e: { stopPropagation: () => void; }) => {
              e.stopPropagation();
              onClose();
            }}
            aria-label={i18next.t("g.close")}
            title={i18next.t("g.close")}
          />
        ) : (
          status === "default" &&
          interactable && (
            <Button
              noPadding={true}
              appearance="gray-link"
              icon={<UilArrowRight />}
              iconPlacement="right"
              size="sm"
              aria-label={i18next.t("waves.view-thread", { defaultValue: "View thread" })}
            />
          )
        )}
        {status === "pending" && <Spinner className="size-4" />}
      </div>
    </div>
  );
}
