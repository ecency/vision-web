import { Metadata, ResolvingMetadata } from "next";
import { notFound } from "next/navigation";
import { EcencyConfigManager } from "@/config";
import { PagesMetadataGenerator } from "@/features/metadata";
import { CurationRecommendationsView } from "@/features/curation-desk/curation-recommendations-view";

export async function generateMetadata(props: unknown, parent: ResolvingMetadata): Promise<Metadata> {
  return PagesMetadataGenerator.getForPage("curation");
}

/**
 * The recommendations sub-flag gates the route itself, not just the buttons:
 * with recommendations off there is no view to reach and no list to read.
 */
export default function CurationRecommendationsPage() {
  const enabled = EcencyConfigManager.useConfig(
    ({ visionFeatures }) => visionFeatures.curationDesk.recommendations.enabled
  );
  if (!enabled) {
    return notFound();
  }

  return <CurationRecommendationsView />;
}
