import { setProxyBase } from '@ecency/render-helper';
import { createRouter, RouterProvider } from '@tanstack/react-router';
import { StrictMode } from 'react';
import ReactDOM from 'react-dom/client';
import './globals.css';
import { InstanceConfigManager } from './core';
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

  // Apply background styles. classList.add throws on a token containing
  // whitespace or an empty string, and the value is owner-typed, so a stray tab
  // pasted into the field would otherwise abort the whole boot.
  const backgroundClasses = general.styles?.background;
  if (backgroundClasses) {
    for (const className of backgroundClasses.split(/\s+/)) {
      if (!className) continue;
      try {
        document.body.classList.add(className);
      } catch {
        console.warn('[Config] Ignoring invalid background class:', className);
      }
    }
  }

  // Apply theme
  const configuredTheme = general.theme;
  if (configuredTheme === 'system') {
    const prefersDark = window.matchMedia(
      '(prefers-color-scheme: dark)',
    ).matches;
    document.documentElement.setAttribute(
      'data-theme',
      prefersDark ? 'dark' : 'light',
    );
  } else {
    document.documentElement.setAttribute('data-theme', configuredTheme);
  }

  // Apply style template
  const styleTemplate = general.styleTemplate ?? 'medium';
  document.documentElement.setAttribute('data-style-template', styleTemplate);

  // Apply sidebar placement
  const sidebarConfig = instanceConfiguration.layout?.sidebar ?? {};
  const sidebarPlacement = sidebarConfig.placement ?? 'right';
  document.documentElement.setAttribute(
    'data-sidebar-placement',
    sidebarPlacement,
  );

  // Apply list type
  const listType = instanceConfiguration.layout?.listType ?? 'grid';
  document.documentElement.setAttribute('data-list-type', listType);

  // Apply instance type
  const instanceType = instanceConfiguration.type ?? 'blog';
  document.documentElement.setAttribute('data-instance-type', instanceType);

  // Apply sidebar section visibility
  document.documentElement.setAttribute(
    'data-show-followers',
    sidebarConfig.followers?.enabled !== false ? 'true' : 'false',
  );
  document.documentElement.setAttribute(
    'data-show-following',
    sidebarConfig.following?.enabled !== false ? 'true' : 'false',
  );
  document.documentElement.setAttribute(
    'data-show-hive-info',
    sidebarConfig.hiveInformation?.enabled !== false ? 'true' : 'false',
  );

  // Listen for system theme changes when theme is set to "system"
  if (configuredTheme === 'system') {
    window
      .matchMedia('(prefers-color-scheme: dark)')
      .addEventListener('change', (e) => {
        document.documentElement.setAttribute(
          'data-theme',
          e.matches ? 'dark' : 'light',
        );
      });
  }

  // Apply SEO meta tags
  const meta = instanceConfiguration.meta ?? {};

  if (meta.title) {
    document.title = meta.title;
  }

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
  const rssUrl = getRssFeedUrl(instanceType, instanceConfiguration.username, instanceConfiguration.communityId);
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
