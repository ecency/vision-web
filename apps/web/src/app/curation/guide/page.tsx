import { Metadata, ResolvingMetadata } from "next";
import { PagesMetadataGenerator } from "@/features/metadata";
import { CurationGuide } from "@/features/curation-desk/curation-guide";

/** Static, indexable, revalidated daily. */
export const revalidate = 86400;

export async function generateMetadata(props: unknown, parent: ResolvingMetadata): Promise<Metadata> {
  return PagesMetadataGenerator.getForPage("curation-guide");
}

export default function CurationGuidePage() {
  return <CurationGuide />;
}
