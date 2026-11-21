import { Metadata, ResolvingMetadata } from "next";
import { notFound } from "next/navigation";
import { PagesMetadataGenerator } from "@/features/metadata";
import { adventPhase } from "@/features/advent/season";
import { AdventPage } from "./_page";

// The page follows the date alone: from 29 November to 31 December (UTC).
// Rendered per request so the date is today's, never a build's.
export const dynamic = "force-dynamic";

export async function generateMetadata(props: unknown, parent: ResolvingMetadata): Promise<Metadata> {
  return PagesMetadataGenerator.getForPage("advent");
}

export default function Page() {
  if (adventPhase(Date.now()) === "hidden") notFound();
  return <AdventPage />;
}
