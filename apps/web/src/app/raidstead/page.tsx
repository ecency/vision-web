import { RaidsteadPage } from "@/app/raidstead/_page";
import { Metadata, ResolvingMetadata } from "next";
import { PagesMetadataGenerator } from "@/features/metadata";
import { EcencyConfigManager } from "@/config";
import { notFound } from "next/navigation";

export async function generateMetadata(
  props: unknown,
  parent: ResolvingMetadata
): Promise<Metadata> {
  return PagesMetadataGenerator.getForPage("raidstead");
}

export default EcencyConfigManager.withConditionalComponent(
  ({ visionFeatures }) => visionFeatures.raidstead.enabled,
  () => <RaidsteadPage />,
  () => notFound()
);
