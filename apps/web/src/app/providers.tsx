import { PropsWithChildren } from "react";
import { ClientProviders } from "@/app/client-providers";
import { NewsletterRuntimeProvider } from "@/features/newsletter/runtime";
import { newsletterFeatureEnabled } from "@/server/newsletter-internal";

export default function Providers({ children }: PropsWithChildren) {
  // Server component: read deployment config here, hand the client tree a boolean.
  return (
    <NewsletterRuntimeProvider configured={newsletterFeatureEnabled()}>
      <ClientProviders>{children}</ClientProviders>
    </NewsletterRuntimeProvider>
  );
}
