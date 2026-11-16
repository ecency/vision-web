import { ReadingListLoading } from "@/features/shared/reading-layout/reading-list-loading";

// Leaf boundary like the other profile tabs (see followers/loading.tsx): the
// page awaits the account before it renders, and only this tab is covered.
export default function NotificationsLoading() {
  return <ReadingListLoading />;
}
