import Image from "next/image";
import Link from "next/link";
import { makeEntryPath } from "@/utils/make-path";
import { dateToFullRelative } from "@/utils/parse-date";
import { RelatedItem } from "./entry-related-item";

/**
 * A compact related-post row: small thumbnail + 2-line title + author/date.
 * Pure server component — the `<a href>` is always in the SSR HTML (crawlable),
 * uses the canonical bare /@author/permlink form, and the thumbnail is
 * lazy-loaded at a small fixed size.
 */
export function EntryRelatedRow({ item }: { item: RelatedItem }) {
  return (
    <Link
      href={makeEntryPath(item.category, item.author, item.permlink)}
      className="no-style group flex gap-2.5 items-center py-1.5 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-dark-sky"
    >
      {item.image ? (
        <Image
          src={item.image}
          alt={item.title}
          width={92}
          height={92}
          className="w-[46px] h-[46px] rounded-lg object-cover shrink-0"
        />
      ) : (
        <span
          aria-hidden="true"
          className="w-[46px] h-[46px] rounded-lg shrink-0 bg-gray-200 dark:bg-dark-default"
        />
      )}
      <span className="min-w-0 flex flex-col">
        <span className="text-[13px] text-gray-800 dark:text-gray-200 leading-tight line-clamp-2 group-hover:text-blue-dark-sky group-focus-visible:text-blue-dark-sky dark:group-hover:text-blue-400 dark:group-focus-visible:text-blue-400">
          {item.title}
        </span>
        <span className="text-[11px] text-gray-600 dark:text-gray-400 mt-0.5 truncate">
          {item.author} &middot;{" "}
          <time dateTime={item.created} suppressHydrationWarning>{dateToFullRelative(item.created)}</time>
        </span>
      </span>
    </Link>
  );
}
