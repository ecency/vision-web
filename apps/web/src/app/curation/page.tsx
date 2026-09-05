import { Metadata, ResolvingMetadata } from "next";
import { PagesMetadataGenerator } from "@/features/metadata";
import { CurationQueueView } from "@/features/curation-desk/curation-queue-view";

export async function generateMetadata(props: unknown, parent: ResolvingMetadata): Promise<Metadata> {
  return PagesMetadataGenerator.getForPage("curation");
}

/**
 * Queue: an anonymous-equivalent server shell with no prefetch, no
 * initialData and no HydrationBoundary. The client view requests page 1 on
 * mount (the app-wide refetchOnMount:false would otherwise never fetch it).
 */
export default function CurationQueuePage() {
  return <CurationQueueView />;
}
