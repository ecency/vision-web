import { Metadata, ResolvingMetadata } from "next";
import { notFound } from "next/navigation";
import { EcencyConfigManager } from "@/config";
import { PagesMetadataGenerator } from "@/features/metadata";
import { RecoverAccountPage } from "./_page";

export async function generateMetadata(
  props: unknown,
  parent: ResolvingMetadata
): Promise<Metadata> {
  return PagesMetadataGenerator.getForPage("recover-account");
}

export default function Page() {
  const enabled = EcencyConfigManager.getConfigValue(
    ({ visionFeatures }) => visionFeatures.accountRecovery.enabled
  );
  if (!enabled) {
    return notFound();
  }
  return <RecoverAccountPage />;
}
