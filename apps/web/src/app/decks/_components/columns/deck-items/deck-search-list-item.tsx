import React, { Fragment, JSX, useEffect, useRef, useState } from "react";
import { proxifyImageSrc } from "@ecency/render-helper";
import { getEntryCardImageSafely } from "@/core/entries/card-image-safely";
import { postBodyTextSafely } from "@/core/entries/post-body-text-safely";
import { useInViewport } from "react-in-viewport";
import { voteSvg } from "../../icons";
import { EcencyEntriesCacheManagement } from "@/core/caches";
import { dateToRelative, transformMarkedContent, makeEntryPath } from "@/utils";
import {
  EcencySourceBadge,
  EntryLink,
  EntryMenu,
  EntryPayout,
  EntryReblogBtn,
  EntryTipBtn,
  EntryVoteBtn,
  EntryVotes,
  ProfileLink
} from "@/features/shared";
import { useRouter } from "next/navigation";
import Link from "next/link";
import i18next from "i18next";
import { Tooltip } from "@ui/tooltip";
import { commentSvg, pinSvg } from "@ui/svg";
import useMount from "react-use/lib/useMount";
import Image from "next/image";
import { useQuery } from "@tanstack/react-query";
import defaults from "@/defaults";

export interface SearchItemProps {
  avatar: string;
  author: string;
  title: string;
  body: string;
  created: string;
  votesPayment: string;
  likes: string;
  children: string;
  community: string;
  category: string;
  community_title: string;
  url: string;
  index: number;
  json_metadata: any;
  // Search-API rows expose the client as a flat `app` string (json_metadata is
  // optional there); full entries carry it under json_metadata.app instead.
  app?: string;
  entry: any;
  onMounted: () => void;
  onEntryView: () => void;
  onAppear?: () => void;
}

export const SearchListItem = ({
  author,
  community,
  community_title,
  json_metadata,
  app,
  created,
  index,
  url,
  category,
  entry: initialEntry,
  onMounted,
  onEntryView,
  onAppear
}: SearchItemProps) => {
  const ref = useRef<HTMLDivElement | null>(null);
  const { inViewport } = useInViewport(ref);
  const { data: entry = initialEntry } = useQuery(EcencyEntriesCacheManagement.getEntryQuery(initialEntry));

  const router = useRouter();

  const [title, setTitle] = useState(entry.title);
  const [body, setBody] = useState(
    entry.body_marked ? transformMarkedContent(entry.body_marked) : postBodyTextSafely(entry.body, 200)
  );
  const [image, setImage] = useState(
    getEntryCardImageSafely(entry.body, 600, 500)
  );

  useEffect(() => {
    setTitle(entry.title_marked ? transformMarkedContent(entry.title_marked) : entry.title);
    setBody(
      entry.body_marked
        ? transformMarkedContent(entry.body_marked)
        : postBodyTextSafely(entry.body, 200)
    );
  }, [entry]);

  useMount(() => {
    onMounted();
  });

  useEffect(() => {
    if (inViewport && onAppear) {
      onAppear();
    }
  }, [inViewport, onAppear]);

  let isPinned = community && entry && entry.stats?.is_pinned;

  const formatMessage = (patterns: string[]): JSX.Element => {
    const { msg } = entry;

    const parts = msg.split(new RegExp(`(${patterns.join("|")})`, "gi"));

    return (
      <>
        {parts.map((part: any, i: number) => {
          if (part.trim() === "") {
            return null;
          }

          if (patterns.includes(part.toLowerCase())) {
            // post link
            if (part.includes("/")) {
              const s = part.split("/");
              return <Fragment key={i}>{part}</Fragment>;
            }

            // user link
            return (
              <div key={i} className="mr-1">
                <ProfileLink username={part.replace("@", "")}>{part}</ProfileLink>
              </div>
            );
          }

          return <span key={i}>{part}</span>;
        })}
      </>
    );
  };

  const safeUrl = makeEntryPath(entry.category, entry.author, entry.permlink);

  if (entry.msg) {
    let mentions = entry.msg.match(/@[\w.\d-]+/gi);
    if (!mentions) {
      return null;
    }

    let formatPatterns = [];

    // @username/permlink
    if (entry.url.startsWith("@")) {
      formatPatterns.push(entry.url);
    }

    // @usernames
    formatPatterns = [...formatPatterns, ...mentions];

    const username = mentions[0].replace("@", "");
    const msg = formatMessage(formatPatterns);
    return (
      <div
        ref={ref}
        className={`p${index === 1 ? "b" : "y"}-${
          json_metadata && json_metadata.image ? "5" : "4"
        } flex flex-col border-b border-[--border-color]`}
      >
        <div className="flex">
          {username && (
            <Image
              width={1000}
              height={1000}
              src={`${defaults.imageServer}/u/${username}/avatar/medium`}
              alt={username}
              className="rounded-[50%] search-item-avatar"
            />
          )}
          <div className="ml-3 deck-body">
            <div
              role="button"
              tabIndex={0}
              onClick={() => safeUrl !== "#" && router.push(safeUrl)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  if (safeUrl !== "#") router.push(safeUrl);
                }
              }}
              className="pointer text-dark-default dark:text-white"
            >
              <div className="flex items-start flex-grow-1 hot-item-link">{msg}</div>
            </div>
          </div>

          <div className="ml-auto">{dateToRelative(entry.date)}</div>
        </div>
      </div>
    );
  }

  return (
    <div ref={ref} className="flex flex-col border-b border-[--border-color] p-3">
      <div className="deck-body flex flex-col w-full">
        <div className="text-dark-default flex flex-col">
          <div className="flex items-center grow hot-item-link dark:text-gray-400">
            {author && (
              <Image
                width={1000}
                height={1000}
                src={`${defaults.imageServer}/u/${author}/avatar/medium`}
                alt={title}
                className="rounded-[50%] search-item-avatar mr-3"
              />
            )}
            {author && (
              <div>
                <Link target="_blank" href={`/@${author}`}>
                  {author}
                </Link>
              </div>
            )}
            {community && (
              <div className="ml-1 grow truncate">
                {" "}
                {i18next.t("entry.published")}{" "}
                <Link target="_blank" href={`/created/${community}`}>
                  {" "}
                  {community_title}{" "}
                </Link>
              </div>
            )}
            {!community && (
              <div className="ml-2 grow">
                {" "}
                {i18next.t("entry.published")}{" "}
                <Link href={`/created/${category}`}> #{category} </Link>
              </div>
            )}
            {isPinned && (
              <Tooltip content={i18next.t("entry-list-item.pinned")}>
                <span className="deck-pinned [&>svg]:size-3.5">{pinSvg}</span>
              </Tooltip>
            )}
            <EcencySourceBadge app={json_metadata?.app ?? app} className="mr-2" />
            <div className="date mb-3">
              <EntryLink target="_blank" entry={entry}>
                <small>{`${dateToRelative(created)}`}</small>
              </EntryLink>
            </div>
          </div>
          <div
            role="button"
            tabIndex={0}
            onClick={() => onEntryView()}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onEntryView();
              }
            }}
            className="pointer"
          >
            {title && (
              <div className="flex">
                <div className="hot-item-link dark:text-white font-bold mt-3">{title}</div>
              </div>
            )}

            {image && (
              <div
                className="search-post-image flex self-center mt-3"
                style={{
                  backgroundImage: `url(${proxifyImageSrc(image)})`
                }}
              />
            )}
            <div className="mt-3 hot-item-post-count deck-item-body text-gray-600 dark:text-gray-400">
              {body}
            </div>
          </div>
        </div>
        <div className="item-controls mt-3 flex items-center">
          <EntryVoteBtn entry={entry} isPostSlider={false} />
          <EntryPayout entry={entry} />
          <EntryVotes entry={entry} icon={voteSvg} iconSizeClass="[&>svg]:size-4" />
          <Link
            href={safeUrl === "#" ? "#" : `${safeUrl}#discussion`}
            className="text-gray-600 dark:text-gray-400"
          >
            <div className="flex items-center comments">
              <div aria-hidden="true" className="inline-flex shrink-0 size-4 [&>svg]:size-full mr-1">
                {commentSvg}
              </div>
              <div>{entry.children}</div>
            </div>
          </Link>

          <EntryReblogBtn entry={entry} />
          <EntryTipBtn entry={entry} />
          <EntryMenu alignBottom={false} entry={entry} compact={true} />
        </div>
      </div>
    </div>
  );
};
