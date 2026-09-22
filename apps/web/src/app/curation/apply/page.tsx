import { Metadata, ResolvingMetadata } from "next";
import { notFound } from "next/navigation";
import { EcencyConfigManager } from "@/config";
import { PagesMetadataGenerator } from "@/features/metadata";
import { CurationApplyView } from "@/features/curation-desk/curation-apply-view";

export async function generateMetadata(
  props: unknown,
  parent: ResolvingMetadata
): Promise<Metadata> {
  return PagesMetadataGenerator.getForPage("curation-apply");
}

/**
 * The invitation, gated by its own sub-flag the way recommendations are: with
 * applications off there is nothing to apply to, so the route goes with the tab.
 */
export default function CurationApplyPage() {
  const enabled = EcencyConfigManager.useConfig(
    ({ visionFeatures }) => visionFeatures.curationDesk.applications.enabled
  );
  if (!enabled) {
    return notFound();
  }

  return <CurationApplyView />;
}
