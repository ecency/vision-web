import { Metadata, ResolvingMetadata } from "next";
import { PagesMetadataGenerator } from "@/features/metadata";
import { CurationMyMarksView } from "@/features/curation-desk/curation-my-marks-view";

export async function generateMetadata(props: unknown, parent: ResolvingMetadata): Promise<Metadata> {
  return PagesMetadataGenerator.getForPage("curation");
}

export default function CurationMarksPage() {
  return <CurationMyMarksView />;
}
