import { Metadata, ResolvingMetadata } from "next";
import { notFound } from "next/navigation";
import { EcencyConfigManager } from "@/config";
import { PagesMetadataGenerator } from "@/features/metadata";
import { Navbar } from "@/features/shared/navbar";
import { ScrollToTop } from "@/features/shared/scroll-to-top";
import { Theme } from "@/features/shared/theme";
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
  return (
    <div className="reading-background">
      <ScrollToTop />
      <Theme />
      <Navbar />
      <div className="app-content">
        <RecoverAccountPage />
      </div>
    </div>
  );
}
