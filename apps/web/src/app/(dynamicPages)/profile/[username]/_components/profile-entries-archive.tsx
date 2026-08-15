import { Entry, FullAccount } from "@/entities";
import { EntryListContent } from "@/features/shared/entry-list-content";
import { EntryArchivePager } from "@/features/shared/entry-archive-pager";
import { ProfileEntriesLayout } from "@/app/(dynamicPages)/profile/[username]/_components/profile-entries-layout";
import { stripActiveVotesFromValue } from "@/core/react-query/strip-active-votes";

interface Props {
  section: string;
  account: FullAccount;
  entries: Entry[];
  /** Cursor token ("author/permlink") for the next older page, or null. */
  olderCursor: string | null;
  currentUser?: string;
}

/**
 * A cursor archive page for an author's section feed: a fully server-rendered
 * list (no infinite scroll) plus a crawlable "Older"/"Latest" pager, so a
 * crawler can walk the author's history beyond the sitemap's recent window.
 */
export function ProfileEntriesArchive({
  section,
  account,
  entries,
  olderCursor,
  currentUser
}: Props) {
  const stripped = stripActiveVotesFromValue(entries, currentUser);
  return (
    <ProfileEntriesLayout section={section} username={account.name}>
      <EntryListContent
        account={account}
        username={`@${account.name}`}
        loading={false}
        entries={stripped}
        sectionParam={section}
        isPromoted={false}
        showEmptyPlaceholder={false}
      />
      <EntryArchivePager
        basePath={`/@${account.name}/${section}`}
        olderCursor={olderCursor}
        showLatest={true}
      />
    </ProfileEntriesLayout>
  );
}
