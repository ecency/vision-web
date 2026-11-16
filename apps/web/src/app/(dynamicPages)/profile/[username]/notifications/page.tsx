import { prefetchRequired } from "@/core/react-query";
import { getAccountFullQueryOptions } from "@ecency/sdk";
import { Metadata, ResolvingMetadata } from "next";
import { generateProfileMetadata } from "@/app/(dynamicPages)/profile/[username]/_helpers";
import { ProfileNotifications } from "./_page";

interface Props {
  params: Promise<{ username: string }>;
}

export async function generateMetadata(props: Props, parent: ResolvingMetadata): Promise<Metadata> {
  const { username } = await props.params;
  const metadata = await generateProfileMetadata(username.replace(/%40/g, ""), "notifications");
  // An activity log: rows of links to other pages, nothing to rank on its own.
  return { ...metadata, robots: "noindex, follow" };
}

// Only the account is resolved on the server (a missing one is a 404). The list
// is fetched client-side, like the community activity tab it shares.
export default async function NotificationsPage({ params }: Props) {
  const { username } = await params;
  const account = await prefetchRequired(getAccountFullQueryOptions(username.replace(/%40/g, "")));

  return <ProfileNotifications username={account.name} />;
}
