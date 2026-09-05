import { Metadata, ResolvingMetadata } from "next";
import { PagesMetadataGenerator } from "@/features/metadata";
import { CurationRecommendationsView } from "@/features/curation-desk/curation-recommendations-view";

export async function generateMetadata(props: unknown, parent: ResolvingMetadata): Promise<Metadata> {
  return PagesMetadataGenerator.getForPage("curation");
}

export default function CurationRecommendationsPage() {
  return <CurationRecommendationsView />;
}
