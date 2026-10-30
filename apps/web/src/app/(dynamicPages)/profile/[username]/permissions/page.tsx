import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { ACTIVE_USER_COOKIE_NAME } from "@/consts";
import { prefetchRequired } from "@/core/react-query";
import { Metadata, ResolvingMetadata } from "next";
import { generateProfileMetadata } from "@/app/(dynamicPages)/profile/[username]/_helpers";
import { ProfilePermissions } from "./_components";
import { getAccountFullQueryOptions } from "@ecency/sdk";

interface Props {
  params: Promise<{ username: string }>;
}

export async function generateMetadata(props: Props, parent: ResolvingMetadata): Promise<Metadata> {
  return generateProfileMetadata(
    (await cookies()).get(ACTIVE_USER_COOKIE_NAME)?.value ?? "Current user",
    "permissions"
  );
}

export default async function PermissionsPage({ params }: Props) {
  const { username } = await params;
  const { get } = await cookies();
  const account = await prefetchRequired(getAccountFullQueryOptions(username.replace(/%40/g, "")));

  if (account.name !== get("active_user")?.value) {
    return redirect(`/@${username.replace(/%40/g, "")}`);
  }

  return <ProfilePermissions />;
}
