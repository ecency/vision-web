import { ProfileReferrals } from "../_components";
import { Redirect } from "@/features/shared/redirect";
import { EcencyConfigManager } from "@/config";
import { prefetchRequired } from "@/core/react-query";
import { getAccountFullQueryOptions } from "@ecency/sdk";
import { Metadata, ResolvingMetadata } from "next";
import { generateProfileMetadata } from "@/app/(dynamicPages)/profile/[username]/_helpers";

interface Props {
  params: Promise<{ username: string }>;
}

export async function generateMetadata(props: Props, parent: ResolvingMetadata): Promise<Metadata> {
  const { username } = await props.params;
  return generateProfileMetadata(username.replace(/%40/g, ""), "referrals");
}

export default async function ReferralsPage({ params }: Props) {
  const { username } = await params;
  const account = await prefetchRequired(getAccountFullQueryOptions(username.replace(/%40/g, "")));

  return (
    <EcencyConfigManager.Conditional
      condition={({ visionFeatures }) => visionFeatures.referrals.enabled}
      fallback={<Redirect path="/" />}
    >
      <ProfileReferrals account={account} />
    </EcencyConfigManager.Conditional>
  );
}
