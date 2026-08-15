import { EcencyEntriesCacheManagement } from "@/core/caches";
import { EntryListItem } from "../entry-list-item";
import { useIsAuthorMuted } from "../entry-list-item/use-muted-authors";
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
  // Checked on the bookmark's own author so the styled wrapper below goes too,
  // rather than rendering as an empty bordered card.
  const isMuted = useIsAuthorMuted(author);

  if (!entry || isMuted) {
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
