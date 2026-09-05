import { PropsWithChildren } from "react";
import { notFound } from "next/navigation";
import { EcencyConfigManager } from "@/config";
import { Navbar } from "@/features/shared/navbar";
import { ScrollToTop } from "@/features/shared/scroll-to-top";
import { RouteErrorBoundary } from "@/features/issue-reporter/route-error-boundary";
import { CurationTabs } from "./_components/curation-tabs";

/**
 * Curation desk shell: Navbar, the view tabs and the route error boundary.
 * Gated by visionFeatures.curationDesk.enabled (notFound when off), which
 * covers every nested route in one place.
 */
export default function CurationLayout({ children }: PropsWithChildren) {
  const enabled = EcencyConfigManager.useConfig(({ visionFeatures }) => visionFeatures.curationDesk.enabled);
  if (!enabled) {
    return notFound();
  }

  return (
    <>
      <ScrollToTop />
      <Navbar />
      <div className="app-content container mx-auto px-2 lg:px-4 pt-[6rem] md:pt-[7rem] pb-8 flex flex-col gap-3">
        <CurationTabs />
        <RouteErrorBoundary>{children}</RouteErrorBoundary>
      </div>
    </>
  );
}
