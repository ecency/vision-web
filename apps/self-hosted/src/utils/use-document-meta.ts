import { useEffect } from "react";
import { InstanceConfigManager } from "@/core";

interface DocumentMeta {
  title?: string;
  description?: string;
  ogTitle?: string;
  ogDescription?: string;
  ogImage?: string;
  ogType?: string;
  ogUrl?: string;
  twitterCard?: "summary" | "summary_large_image";
}

function getMetaContent(
  property: string,
  attribute: "name" | "property" = "property"
): string | null {
  const tag = document.querySelector(
    `meta[${attribute}="${property}"]`
  ) as HTMLMetaElement | null;
  return tag?.getAttribute("content") ?? null;
}

function setMetaTag(
  property: string,
  content: string,
  attribute: "name" | "property" = "property"
) {
  let tag = document.querySelector(
    `meta[${attribute}="${property}"]`
  ) as HTMLMetaElement | null;
  if (!tag) {
    tag = document.createElement("meta");
    tag.setAttribute(attribute, property);
    document.head.appendChild(tag);
  }
  tag.setAttribute("content", content);
}

function restoreOrRemoveMeta(
  property: string,
  previous: string | null,
  attribute: "name" | "property" = "property"
) {
  if (previous !== null) {
    setMetaTag(property, previous, attribute);
  } else {
    const tag = document.querySelector(`meta[${attribute}="${property}"]`);
    if (tag) tag.remove();
  }
}

/**
 * Sets document title and OG/Twitter meta tags. Restores previous values on unmount.
 */
export function useDocumentMeta(meta: DocumentMeta) {
  // Subscribed, not a one-shot read: the Configuration Editor's preview serves
  // a draft through the store, and the page title must follow it in and back
  // out again when preview ends.
  const defaultTitle = InstanceConfigManager.useConfig(
    ({ configuration }) => configuration.instanceConfiguration.meta.title || "Blog",
  );

  useEffect(() => {
    const previousTitle = document.title;

    // Snapshot current meta values before overwriting
    const snapshots: Array<[string, string | null, "name" | "property"]> = [];

    const applyMeta = (
      property: string,
      content: string | undefined,
      attribute: "name" | "property" = "property"
    ) => {
      if (!content) return;
      snapshots.push([property, getMetaContent(property, attribute), attribute]);
      setMetaTag(property, content, attribute);
    };

    // Set title
    if (meta.title) {
      document.title = `${meta.title} | ${defaultTitle}`;
    }

    // OG tags
    applyMeta("og:title", meta.ogTitle || meta.title);
    applyMeta("og:description", meta.ogDescription || meta.description);
    applyMeta("og:image", meta.ogImage);
    applyMeta("og:type", meta.ogType);
    applyMeta("og:url", meta.ogUrl);

    // Twitter card tags
    applyMeta("twitter:card", meta.twitterCard, "name");
    applyMeta("twitter:title", meta.ogTitle || meta.title, "name");
    applyMeta("twitter:description", meta.ogDescription || meta.description, "name");
    applyMeta("twitter:image", meta.ogImage, "name");

    // Cleanup: restore previous values
    return () => {
      document.title = previousTitle;
      for (const [property, previous, attribute] of snapshots) {
        restoreOrRemoveMeta(property, previous, attribute);
      }
    };
  }, [defaultTitle, meta.title, meta.description, meta.ogTitle, meta.ogDescription, meta.ogImage, meta.ogType, meta.ogUrl, meta.twitterCard]);
}
