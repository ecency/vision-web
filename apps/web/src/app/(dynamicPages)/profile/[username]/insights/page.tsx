import { generateProfileMetadata } from "../_helpers";
import { Metadata, ResolvingMetadata } from "next";
import { cookies } from "next/headers";
import { prefetchQuery, prefetchRequired } from "@/core/react-query";
import { getAccountFullQueryOptions, getProMembersQueryOptions } from "@ecency/sdk";
import { isProMember } from "@/features/pro/pro-config";
import { ProfileInsights } from "./_page";
import { InsightsProGate } from "./_insights-pro-gate";

interface Props {
  params: Promise<{ username: string }>;
}

export async function generateMetadata(props: Props, parent: ResolvingMetadata): Promise<Metadata> {
  const { username } = await props.params;
  return generateProfileMetadata(username.replace(/%40/g, ""), "insights");
}

export default async function InsightsPage({ params }: Props) {
  const { username } = await params;
  const { get } = await cookies();

  const account = await prefetchRequired(getAccountFullQueryOptions(username.replace(/%40/g, "")));

  // Own insights stay free; viewing anyone else's is an Ecency Pro perk. Non-Pro viewers get a
  // Go-Pro upsell instead of the data (previously this was a hard owner-only redirect).
  //
  // SECURITY NOTE: this SSR check is a UX optimization only (render the data view vs the upsell)
  // and reads the client-writable `active_user` cookie, so it is deliberately NOT the security
  // boundary. The Insights numbers are served by `/api/profile-insights`, which verifies the
  // viewer's real signed HiveSigner identity (own OR Pro) and 403s otherwise. A forged cookie can
  // only render an empty shell here; it can never fetch another creator's traffic data.
  //
  // Hive usernames are lowercase; normalize the cookie so a non-canonical case never denies an owner.
  const activeUser = get("active_user")?.value?.toLowerCase();
  let canView = !!activeUser && account.name.toLowerCase() === activeUser;
  if (!canView && activeUser) {
    try {
      const proMembers = await prefetchQuery(getProMembersQueryOptions());
      canView = isProMember(proMembers?.members, activeUser);
    } catch {
      canView = false;
    }
  }

  if (!canView) {
    return <InsightsProGate username={account.name} />;
  }

  return <ProfileInsights username={account.name} />;
}
