"use client";

import { Button } from "@/features/ui";
import i18next from "i18next";

interface Props {
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  onLoadMore: () => void;
}

export function WalletHistoryLoadMore({ hasNextPage, isFetchingNextPage, onLoadMore }: Props) {
  if (!hasNextPage) {
    return null;
  }

  return (
    <div className="p-4 pt-2">
      <Button
        appearance="gray"
        size="sm"
        className="w-full"
        disabled={isFetchingNextPage}
        onClick={onLoadMore}
      >
        {i18next.t(isFetchingNextPage ? "g.loading" : "g.load-more")}
      </Button>
    </div>
  );
}
