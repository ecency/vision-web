"use client";

import { ListStyle } from "@/enums";
import { PropsWithChildren } from "react";
import { useGlobalStore } from "@/core/global-store";
import { usePostsFeedQuery } from "@/api/queries";
import { LinearProgress } from "@/features/shared/linear-progress";
import { isCommunity } from "@/utils";

interface Props {
  username: string;
  section: string;
}

export function ProfileEntriesLayout(props: PropsWithChildren<Props>) {
  const listStyle = useGlobalStore((s) => s.listStyle);
  // Must resolve to the same observer as the list components this wraps,
  // otherwise it subscribes to a different query key and reports the fetching
  // state of a feed nobody is rendering.
  const { isFetching } = usePostsFeedQuery(
    props.section,
    isCommunity(props.username) ? props.username : `@${props.username}`
  );

  return (
    <div className="entry-list">
      <div className={`entry-list-body ${listStyle === ListStyle.grid ? "grid-view" : ""}`}>
        {isFetching && <LinearProgress />}
        {props.children}
      </div>
    </div>
  );
}
