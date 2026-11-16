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
  // The list only renders for a signed-in viewer, so crawlers see an empty shell.
  return { ...metadata, robots: "noindex, follow" };
}

// Only the account is resolved on the server (a missing one is a 404). The list
// itself is fetched client-side: its endpoint is signed with the viewer's code.
export default async function NotificationsPage({ params }: Props) {
  const { username } = await params;
  const account = await prefetchRequired(getAccountFullQueryOptions(username.replace(/%40/g, "")));

  return <ProfileNotifications username={account.name} />;
}
