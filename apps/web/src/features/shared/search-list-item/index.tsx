import React, { useMemo } from "react";
import { setProxyBase } from "@ecency/render-helper";
import { getEntryCardImageSafely } from "@/core/entries/card-image-safely";
import { searchSummary } from "./search-summary";
import defaults from "@/defaults";
import { SearchResult } from "@/entities";
import {
  EcencySourceBadge,
  EntryLink,
  FormattedCurrency,
  ProfileLink,
  UserAvatar
} from "@/features/shared";
import { TagLink } from "../tag";
import { ProBadge } from "@/features/pro";
import { commentSvg, peopleSvg } from "@ui/svg";
import { accountReputation, dateToFormatted, dateToRelative, transformMarkedContent } from "@/utils";
import Image from "next/image";

setProxyBase(defaults.imageServer);

interface Props {
  res: SearchResult;
}

export function SearchListItem({ res }: Props) {
  const entry = useMemo(
    () => ({
      category: res.category,
      author: res.author,
      permlink: res.permlink
    }),
    [res]
  );
  const dateRelative = useMemo(() => dateToRelative(res.created_at), [res]);
  const dateFormatted = useMemo(() => dateToFormatted(res.created_at), [res]);
  const reputation = useMemo(() => accountReputation(res.author_rep), [res]);
  // Search rows carry the FULL body (nothing slims them), so both the image
  // extractor and the summary renderer run their markdown tier here on every
  // row. Guarded so a crafted body costs this row its thumbnail and its
  // excerpt, not the results page: this list renders inside the client tree,
  // where an uncaught throw is caught by no route error.tsx and swaps the whole
  // app for global-error.
  const img = useMemo(() => getEntryCardImageSafely(res.body, 600, 500), [res.body]);

  const title = useMemo(
    () => transformMarkedContent(res.title_marked ? res.title_marked : res.title),
    [res]
  );
  const summary = useMemo(() => searchSummary(res.body_marked, res.body), [res]);

  return (
    <div className="search-list-item">
      <div className="item-header">
        <div className="item-header-main">
          <div className="author-part">
            <ProfileLink username={res.author}>
              <UserAvatar username={res.author} size="small" />
            </ProfileLink>
            <ProfileLink username={res.author}>
              <div className="author">
                {res.author}
                <span className="author-reputation">({reputation})</span>
                <ProBadge username={res.author} className="ml-1" />
              </div>
            </ProfileLink>
          </div>
          <TagLink tag={res.category} type="link">
            {res.category}
          </TagLink>
          <span className="date ml-2" title={dateFormatted}>
            {dateRelative}
          </span>
          <EcencySourceBadge app={res.app} className="inline-block align-text-bottom ml-1.5" />
        </div>
      </div>
      <div className="item-body">
        <div className={`item-image ${!img ? "item-image-placeholder" : ""}`}>
          <EntryLink entry={entry}>
            <div>
              {img ? (
                <Image width={500} height={500} src={img} alt={res.title} />
              ) : (
                <Image
                  width={64}
                  height={64}
                  src="/assets/noimage.svg"
                  alt={res.title}
                  className="no-img"
                />
              )}
            </div>
          </EntryLink>
        </div>
        <div className="item-summary">
          <EntryLink entry={entry}>
            <div className="item-title">{title}</div>
          </EntryLink>
          <EntryLink entry={entry}>
            <div className="break-all">{summary}</div>
          </EntryLink>
        </div>
        <div className="item-controls">
          <EntryLink entry={entry}>
            <a className="result-payout">
              <FormattedCurrency value={res.payout} />
            </a>
          </EntryLink>
          <EntryLink entry={entry}>
            <a className="result-votes">
              {" "}
              <span
                aria-hidden="true"
                className="inline-flex shrink-0 size-3.5 mr-1 [&>svg]:size-full [&>svg]:!m-0"
              >
                {peopleSvg}
              </span>{" "}
              {res.total_votes}
            </a>
          </EntryLink>
          <EntryLink entry={entry}>
            <a className="result-replies">
              <span
                aria-hidden="true"
                className="inline-flex shrink-0 size-3.5 mr-1 mt-0.5 [&>svg]:size-full [&>svg]:!m-0"
              >
                {commentSvg}
              </span>{" "}
              {res.children}
            </a>
          </EntryLink>
        </div>
      </div>
    </div>
  );
}
