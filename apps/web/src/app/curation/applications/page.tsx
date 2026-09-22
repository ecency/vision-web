import { Metadata, ResolvingMetadata } from "next";
import { notFound } from "next/navigation";
import { EcencyConfigManager } from "@/config";
import { PagesMetadataGenerator } from "@/features/metadata";
import { CurationApplicationsView } from "@/features/curation-desk/curation-applications-view";

export async function generateMetadata(props: unknown, parent: ResolvingMetadata): Promise<Metadata> {
  return PagesMetadataGenerator.getForPage("curation");
}

export default function CurationApplicationsPage() {
  // The route goes with the flag, the way the recommendations route does: a tab that
  // is hidden is not a page that answers.
  if (
    !EcencyConfigManager.getConfigValue(({ visionFeatures }) => visionFeatures.curationDesk.applications.enabled)
  ) {
    notFound();
  }
  return <CurationApplicationsView />;
}
