"use client";

import { EcencyConfigManager } from "@/config";
import { createContext, type ReactNode, useContext } from "react";

/**
 * Whether THIS deployment can serve the newsletter feature, decided at request time on the
 * server (NEWSLETTER_API_URL + NEWSLETTER_SERVICE_TOKEN present, see server/newsletter-internal
 * `newsletterConfigured`) and handed to the client tree by `NewsletterRuntimeProvider` from
 * app/providers.tsx. One production image serves every region; a build-time flag cannot say
 * "only where the service is configured", this can. Defaults to off: a tree rendered outside
 * the provider (a stray mount, a test that did not opt in) never shows controls whose routes
 * would answer 503.
 */
const NewsletterRuntimeContext = createContext<boolean>(false);

export function NewsletterRuntimeProvider({
  configured,
  children
}: {
  configured: boolean;
  children: ReactNode;
}) {
  return <NewsletterRuntimeContext.Provider value={configured}>{children}</NewsletterRuntimeContext.Provider>;
}

/**
 * The feature is on when the deployment is configured for it AND the config kill switch
 * (`visionFeatures.newsletter.enabled`, NEXT_PUBLIC_NEWSLETTER_ENABLED=0 to force off) allows.
 */
export function useNewsletterEnabled(): boolean {
  const configured = useContext(NewsletterRuntimeContext);
  const allowed = EcencyConfigManager.getConfigValue(({ visionFeatures }) => visionFeatures.newsletter.enabled);
  return configured && allowed;
}

/** Renders children only when the feature is on. The client-side counterpart of `Conditional`. */
export function NewsletterGate({ children }: { children: ReactNode }) {
  const enabled = useNewsletterEnabled();
  return enabled ? <>{children}</> : null;
}
