import { EcencyEntriesCacheManagement } from "@/core/caches";
import { EntryListItem } from "../entry-list-item";
import { useQuery } from "@tanstack/react-query";

interface Props {
  author: string;
  permlink: string;
  i: number;
}

export function BookmarkItem({ author, permlink, i }: Props) {
  const { data: entry } = useQuery(EcencyEntriesCacheManagement.getEntryQueryByPath(
    author,
    permlink
  ));
  // Muted authors are filtered out by BookmarksList, which owns the list and its
  // empty state; dropping them here instead would leave the wrapper below as an
  // empty bordered card.
  if (!entry) {
    return <></>;
  }
  return (
    <div
      style={{ animationDelay: `${Math.min(i, 5) * 50}ms` }}
      className="animate-fade-in-up border border-[--border-color] rounded-lg px-4 bg-white"
    >
      <EntryListItem entry={entry} order={0} />
    </div>
  );
}
