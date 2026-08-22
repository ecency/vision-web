"use client";

import React, {
  RefObject,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createRoot } from "react-dom/client";
import {
  findPostLinkElements,
  isInvalidPermlinkLink,
  isWaveLikePost,
} from "../functions";

// In-memory session cache
const simpleCache = new Map<
  string,
  {
    title: string;
    description: string | undefined;
    image: string | undefined;
  }
>();

export function HivePostLinkRenderer({ link }: { link: string }) {
  const [data, setData] = useState<{
    title: string;
    description?: string;
    image?: string;
  }>();

  const url = useMemo(() => {
    try {
      return new URL(link, "https://ecency.com");
    } catch {
      return null;
    }
  }, [link]);
  const cacheKey = url?.pathname.toLowerCase() ?? "";

  const fetchData = useCallback(async () => {
    if (!cacheKey) return;
    if (simpleCache.has(cacheKey)) {
      setData(simpleCache.get(cacheKey));
      return;
    }
    if (isInvalidPermlinkLink(cacheKey)) {
      console.warn("[Ecency Renderer] Skipping invalid post link:", cacheKey);
      return;
    }

    try {
      // One small JSON call to our own oEmbed provider instead of fetching and
      // DOM-parsing the entire post HTML page just for three meta tags. The
      // provider derives title/description/image from the same source as the
      // post's og: tags, so the card is unchanged — just far cheaper and
      // CF-cacheable. Relative URL → resolves against the current origin.
      const response = await fetch(
        `/api/oembed?url=${encodeURIComponent(`https://ecency.com${cacheKey}`)}&format=json`,
        { method: "GET" },
      );
      if (!response.ok) return;
      const oembed = await response.json();

      if (oembed?.title) {
        const preview = {
          title: oembed.title as string,
          description:
            typeof oembed.description === "string"
              ? oembed.description.substring(0, 71)
              : undefined,
          image:
            typeof oembed.thumbnail_url === "string" ? oembed.thumbnail_url : undefined,
        };

        simpleCache.set(cacheKey, preview);
        setData(preview);
      }
    } catch (e) {
      console.error(`[Ecency Renderer] Failed to fetch preview: ${link}`, e);
    }
  }, [cacheKey, link]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const enhancedHref = useMemo(() => {
    if (!url) return link;
    const referral = url.searchParams.get("referral");
    return `${url.pathname}${referral ? `?referral=${referral}` : ""}${url.hash}`;
  }, [url, link]);

  return (
    <a
      href={enhancedHref}
      className="er-post-link-link"
      target="_blank"
      rel="noopener"
    >
      {data ? (
        <>
          <div
            className="er-post-link-link-image"
            style={{ backgroundImage: `url(${data.image})` }}
          />
          <div className="er-post-link-link-text-content">
            <div className="er-post-link-link-title">
              {data.title}
            </div>
            <div className="er-post-link-link-description">
              {data.description + "..."}
            </div>
          </div>
        </>
      ) : (
        link
      )}
    </a>
  );
}

export function HivePostLinkExtension({
  containerRef,
}: {
  containerRef: RefObject<HTMLElement | null>;
}) {
  const rootsRef = useRef<ReturnType<typeof createRoot>[]>([]);

  useEffect(() => {
    rootsRef.current.forEach(r => r.unmount());
    rootsRef.current = [];

    const container = containerRef.current;
    if (!container) {
      return;
    }

    findPostLinkElements(container)
      .filter((el) => !isWaveLikePost(el.getAttribute("href") ?? ""))
      .filter((el) => {
        try {
          const url = new URL(
            el.getAttribute("href") ?? "",
            "https://ecency.com",
          );
          return !isInvalidPermlinkLink(url.pathname);
        } catch {
          return false;
        }
      })
      .forEach((element) => {
        try {
          // Prevent multiple injections
          if ((element as HTMLElement).dataset.enhanced === "true") return;

          // Verify element is still connected to the DOM before manipulation
          if (!element.isConnected || !element.parentNode) {
            console.warn("Hive post link element is not connected to DOM, skipping");
            return;
          }

          (element as HTMLElement).dataset.enhanced = "true";

          const container = document.createElement("div");
          container.classList.add("er-post-link");

          const href = element.getAttribute("href") ?? "";
          const root = createRoot(container);
          rootsRef.current.push(root);
          root.render(<HivePostLinkRenderer link={href} />);

          // Final safety check before replacing
          if (element.isConnected && element.parentElement) {
            element.parentElement.replaceChild(container, element);
          }
        } catch (error) {
          console.warn("Error enhancing Hive post link element:", error);
        }
      });

    return () => {
      rootsRef.current.forEach(r => r.unmount());
      rootsRef.current = [];
    };
  }, []);

  return null;
}
