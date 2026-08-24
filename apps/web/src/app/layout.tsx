import "@/styles/style.scss";
import "@/core/sdk-init"; // Initialize SDK DMCA filters immediately (SSR)
import Providers from "@/app/providers";
import { HiringConsoleLog } from "@/app/_components/hiring-console-log";
import { cookies } from "next/headers";
import { Theme } from "@/enums";
import { BannerManager } from "@/features/banners";
import { ServiceWorkerRecovery } from "@/features/pwa-install";
import React from "react";
import Script from "next/script";
import { Inter, Lora } from "next/font/google";
import { Metadata, Viewport } from "next";
import defaults from "@/defaults.json";
import { JsonLd, buildOrganizationJsonLd } from "@/features/structured-data";

export const metadata: Metadata = {
  metadataBase: new URL(defaults.base),
  // Consistent brand signal in every SERP <title>. Pages return a bare title
  // (e.g. a post title) and get " | Ecency" appended; pages that already carry
  // their own brand opt out with `title.absolute`.
  title: {
    template: `%s | ${defaults.name}`,
    default: defaults.title
  },
  applicationName: defaults.name,
  appleWebApp: {
    capable: true,
    title: defaults.name,
    statusBarStyle: "default"
  },
  icons: {
    icon: [
      { url: "/assets/logo-512x512.svg", type: "image/svg+xml", sizes: "any" },
      { url: "/assets/logo-192x192.png", sizes: "192x192", type: "image/png" },
      { url: "/assets/logo-384x384.png", sizes: "384x384", type: "image/png" },
      { url: "/assets/logo-512x512.png", sizes: "512x512", type: "image/png" }
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }]
  },
  openGraph: {
    siteName: defaults.name,
    images: [
      {
        url: "/og.jpg",
        width: 1200,
        height: 630,
        alt: defaults.name,
      },
    ],
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    site: defaults.twitterHandle,
    creator: defaults.twitterHandle,
    images: ["/og.jpg"],
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#131111" }
  ]
};

/*
  Only Inter's latin subset is preloaded. The generated @font-face rules keep
  every subset via unicode-range, so cyrillic text still upgrades to the
  webfont after a fallback-first paint. The four preloaded woff2 (~126 KB,
  priority High) were racing the last render-blocking stylesheet on the same
  connection and delaying first paint (#1600).
*/
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap"
});

/* Lora only styles entry/publish serif text, all of it below or at the fold
   edge; painting it with the fallback serif first is acceptable, so no
   preload at all. */
const lora = Lora({
  subsets: ["latin"],
  weight: ["400", "700"],
  variable: "--font-lora",
  display: "swap",
  preload: false
});

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const theme = (await cookies()).get("theme")?.value;

  return (
    // The dark class goes on BOTH <html> and <body>, deliberately.
    //
    // <html> is what five checkout components probe via
    // `document.documentElement.classList.contains("dark")` — with the class on
    // body alone that check always read false and they rendered light.
    //
    // <body> must KEEP it: styles/theme-day.scss assigns the light custom
    // properties, `background: white` and `color` directly to `body`, while
    // theme-night.scss applies its dark values under `.dark`. With the class only
    // on <html>, body's own light declarations beat the merely-inherited dark
    // ones, so Tailwind dark variants would activate while the body, Bootstrap
    // surfaces and every CSS-variable consumer stayed light. Keeping it on body
    // preserves that cascade exactly as it was.
    <html
      lang="en"
      className={`${lora.variable} ${inter.variable} ${theme === Theme.night ? "dark" : ""}`}
    >
      <head>
        {/*
          Global CONFIG stub for Twitter/X in-app browser compatibility.
          Loaded from external file to comply with CSP policies.
          See /public/scripts/config-stub.js for details.
        */}
        <script async src="/scripts/chunk-reload.js" />
        {/*
          Guards React against in-page translators (Google/Chrome Translate)
          that wrap text nodes in <font> tags and crash the commit phase with a
          NotFoundError on insertBefore/removeChild. beforeInteractive installs
          the Node.prototype patch before React hydrates, so it's in place for
          the first commit.
        */}
        <Script src="/scripts/translate-dom-guard.js" strategy="beforeInteractive" />
        <script async src="/scripts/config-stub.js" />
        <link rel="dns-prefetch" href="https://i.ecency.com" />
        <link rel="dns-prefetch" href="https://ecency.com" />
        {/* Non-CORS preconnect: cover/avatar <img> and next/image requests to
            i.ecency.com are credentialed and can't reuse an anonymous (crossorigin)
            socket, so warm the credentialed connection they actually use. */}
        <link rel="preconnect" href="https://i.ecency.com" />
        <link rel="preconnect" href="https://ecency.com" crossOrigin="anonymous" />
        <JsonLd data={buildOrganizationJsonLd()} />
      </head>
      {/* The /embed analytics skip that used to wrap this was dead code: it was
          added (c5391e8b69) while /embed was a Next page, and the next day
          db2d671035 replaced that page with a self-contained route handler.
          Route handlers never render this layout, so the guard could not fire —
          and the headers() call behind it was the app's second forced-dynamic
          read (see #1262). */}
      <Script defer data-domain="ecency.com" data-api="/pl/api/event" src="/pl/js/script.js" />
      <body className={theme === Theme.night ? "dark" : ""}>
        <BannerManager />
        <ServiceWorkerRecovery />
        <HiringConsoleLog />
        <Providers><main id="main-content">{children}</main></Providers>
        <div id="modal-overlay-container" />
        <div id="modal-dialog-container" />
        <div id="popper-container" />
      </body>
    </html>
  );
}
