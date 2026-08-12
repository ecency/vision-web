import { setProxyBase } from '@ecency/render-helper';
import { createRouter, RouterProvider } from '@tanstack/react-router';
import { StrictMode } from 'react';
import ReactDOM from 'react-dom/client';
import './globals.css';
import { applyConfigDom, InstanceConfigManager } from './core';
import { captureSetupParams } from './features/auth/setup-handoff';
import { getRssFeedUrl } from './utils/rss-feed-url';
import { routeTree } from './routeTree.gen';

const router = createRouter({
  routeTree,
  // Path params are percent-encoded by default, which would turn the canonical
  // /@author/permlink into /%40author/permlink. Every Hive frontend uses the
  // '@' form and posts link to each other with it, so it stays literal.
  pathParamsAllowedCharacters: ['@'],
});

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}

function applyConfig() {
  const config = InstanceConfigManager.getConfig();
  const { general, instanceConfiguration } = config.configuration;

  // Set up image proxy base URL
  const imageProxyBase = general.imageProxy || 'https://i.ecency.com';
  setProxyBase(imageProxyBase);

  // Every attribute, custom property, body class and the document title the
  // config drives live in one declaration, which the Configuration Editor's
  // preview applies through the same function. See core/apply-config-dom.ts.
  applyConfigDom(config, { syncSystemTheme: true });

  const instanceType = instanceConfiguration.type ?? 'blog';

  // Apply SEO meta tags
  const meta = instanceConfiguration.meta ?? {};

  if (meta.description) {
    let descriptionMeta = document.querySelector('meta[name="description"]');
    if (!descriptionMeta) {
      descriptionMeta = document.createElement('meta');
      descriptionMeta.setAttribute('name', 'description');
      document.head.appendChild(descriptionMeta);
    }
    descriptionMeta.setAttribute('content', meta.description);
  }

  if (meta.keywords) {
    let keywordsMeta = document.querySelector('meta[name="keywords"]');
    if (!keywordsMeta) {
      keywordsMeta = document.createElement('meta');
      keywordsMeta.setAttribute('name', 'keywords');
      document.head.appendChild(keywordsMeta);
    }
    keywordsMeta.setAttribute('content', meta.keywords);
  }

  const setMetaTag = (attr: string, attrValue: string, content: string) => {
    let tag = document.querySelector(`meta[${attr}="${attrValue}"]`) as HTMLMetaElement | null;
    if (!tag) {
      tag = document.createElement('meta');
      tag.setAttribute(attr, attrValue);
      document.head.appendChild(tag);
    }
    tag.setAttribute('content', content);
  };

  if (meta.title) {
    setMetaTag('property', 'og:title', meta.title);
    setMetaTag('property', 'og:site_name', meta.title);
    setMetaTag('name', 'twitter:title', meta.title);
  }
  if (meta.description) {
    setMetaTag('property', 'og:description', meta.description);
    setMetaTag('name', 'twitter:description', meta.description);
  }
  if (meta.logo) {
    setMetaTag('property', 'og:image', meta.logo);
    setMetaTag('name', 'twitter:image', meta.logo);
  }
  setMetaTag('property', 'og:type', 'website');
  setMetaTag('name', 'twitter:card', 'summary');

  if (meta.favicon) {
    let faviconLink = document.querySelector(
      'link[rel="icon"]',
    ) as HTMLLinkElement;
    if (!faviconLink) {
      faviconLink = document.createElement('link');
      faviconLink.setAttribute('rel', 'icon');
      document.head.appendChild(faviconLink);
    }
    faviconLink.setAttribute('href', meta.favicon);
  }

  // Add RSS feed auto-discovery link
  const rssUrl = getRssFeedUrl(
    instanceType,
    instanceConfiguration.username,
    instanceConfiguration.communityId,
    instanceConfiguration.managed === true,
    config.configuration.general.rssFeedUrl,
  );
  const existingRssLink = document.querySelector('link[rel="alternate"][type="application/rss+xml"]') as HTMLLinkElement | null;
  if (rssUrl) {
    const rssLink = existingRssLink ?? document.createElement('link');
    rssLink.setAttribute('rel', 'alternate');
    rssLink.setAttribute('type', 'application/rss+xml');
    rssLink.setAttribute('title', meta.title || 'RSS Feed');
    rssLink.setAttribute('href', rssUrl);
    if (!existingRssLink) document.head.appendChild(rssLink);
  } else if (existingRssLink) {
    existingRssLink.remove();
  }
}

async function main() {
  // Which build is running, inspectable without tooling: pairs with the
  // hosting API's /health so image skew is observable. The version exists
  // only on release-tag builds; the sha always does.
  document.documentElement.setAttribute('data-build', __BUILD_SHA__);
  if (__BUILD_VERSION__) {
    document.documentElement.setAttribute('data-version', __BUILD_VERSION__);
  }
  // Handoff params are captured before anything renders, so no component's
  // effect order can decide whether the setup intent is seen.
  captureSetupParams();
  // Fetch runtime config before rendering
  await InstanceConfigManager.initialize();

  // applyConfig only decorates the document. A malformed config value must not
  // stop the app from rendering: the floating menu that would let the owner fix
  // the config is part of the app, so aborting here leaves a blank page with no
  // way back in.
  try {
    applyConfig();
  } catch (error) {
    console.error('[Config] Failed to apply configuration:', error);
  }

  const rootElement = document.getElementById('root')!;
  if (!rootElement.innerHTML) {
    const root = ReactDOM.createRoot(rootElement);
    root.render(
      <StrictMode>
        <RouterProvider router={router} />
      </StrictMode>,
    );
  }
}

main();
