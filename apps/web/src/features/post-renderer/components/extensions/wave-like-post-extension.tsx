"use client";

import React, { RefObject, useEffect, useMemo, useRef } from "react";
import { createRoot } from "react-dom/client";
import { useQuery, QueryClientProvider } from "@tanstack/react-query";
import { getPostQueryOptions, QueryKeys } from "@ecency/sdk";
import { getQueryClient } from "@/core/react-query";
import { makeEntryPath } from "@/utils";
import { findPostLinkElements, isWaveLikePost } from "../functions";
import { EcencyRenderer } from "../ecency-renderer";
import { Logo } from "../icons";
import defaults from "@/defaults";
import i18next from "i18next";

// Quoted waves embed inline only one level deep; a quote-of-a-quote renders as a
// compact stub (avatar + link) instead of recursively rendering full bodies.
const MAX_EMBED_DEPTH = 1;

export function WaveLikePostRenderer({ link, depth = 1 }: { link: string; depth?: number }) {
  const [author, permlink] = useMemo(() => {
    try {
      const pathname = new URL(link, "https://ecency.com").pathname;
      const segments = pathname.split("/").filter((seg) => seg.length > 0);

      // Find the index of the username segment (starts with @)
      const usernameIndex = segments.findIndex((seg) => seg.startsWith("@"));

      if (usernameIndex === -1) {
        // No @ segment found, try to find after "waves" prefix
        const wavesIndex = segments.findIndex((seg) => seg === "waves");
        if (wavesIndex !== -1 && segments.length > wavesIndex + 2) {
          const username = segments[wavesIndex + 1];
          const perm = segments[wavesIndex + 2];
          return [username.replace("@", ""), perm];
        }
        console.warn(`[WaveLikePost] Could not parse author from link: ${link}`);
        return [null, null];
      }

      // Extract author (strip @) and permlink (next segment)
      const username = segments[usernameIndex];
      const perm = segments[usernameIndex + 1];

      if (!username || !perm) {
        console.warn(`[WaveLikePost] Missing author or permlink in link: ${link}`);
        return [null, null];
      }

      return [username.replace("@", ""), perm];
    } catch (error) {
      console.error(`[WaveLikePost] Failed to parse link: ${link}`, error);
      return [null, null];
    }
  }, [link]);

  const tooDeep = depth > MAX_EMBED_DEPTH;
  const { data: post } = useQuery({
    ...getPostQueryOptions(author ?? "", permlink ?? ""),
    queryKey: QueryKeys.posts.entry(makeEntryPath("", author ?? "", permlink ?? "")),
    // Skip the fetch entirely when we're only going to render the stub.
    enabled: !!author && !!permlink && !tooDeep,
  });

  const host = useMemo(() => {
    if (
      post?.permlink?.startsWith("re-ecencywaves") ||
      post?.permlink?.startsWith("wave-")
    ) {
      return "ecency.waves";
    }

    if (post?.permlink?.startsWith("re-leothreads")) {
      return "threads";
    }

    if (post?.permlink?.startsWith("re-liketu-moments")) {
      return "moments";
    }

    return "";
  }, [post]);

  // Return early if link parsing failed
  if (!author || !permlink) {
    return <></>;
  }

  // Beyond the inline-embed depth: a compact stub (no fetch, no body) so a
  // quote-of-a-quote doesn't recurse into deeply nested full cards.
  if (tooDeep) {
    return (
      <a
        href={`/waves/${author}/${permlink}`}
        className="er-wave-renderer er-wave-renderer--stub"
        aria-label={`Open wave by @${author}`}
      >
        <img
          src={`${defaults.imageServer}/u/${author}/avatar/small`}
          alt={author}
          className="er-wave-renderer--author-avatar"
        />
        <span className="er-wave-renderer--stub-label">
          @{author} · {i18next.t("waves.view-wave", { defaultValue: "View wave" })}
        </span>
      </a>
    );
  }

  // Post not loaded yet
  if (!post) {
    return <></>;
  }

  const waveLink = `/waves/${post.author}/${post.permlink}`;

  return (
    <article className="er-wave-renderer">
      <a
        href={waveLink}
        aria-label={`Open wave by @${post.author}`}
        className="er-wave-renderer__overlay"
      />
      <div className="er-wave-renderer--author">
        <img
          src={`${defaults.imageServer}/u/${post.author}/avatar/small`}
          alt={post.author}
          className="er-wave-renderer--author-avatar"
        />
        <div className="er-wave-renderer--author-content">
          <a
            className="er-wave-renderer--author-content-link"
            href={`/@${post.author}/posts`}
          >
            @{post.author}
          </a>
          <div className="er-wave-renderer--author-content-host">
            #{host}
          </div>
        </div>
      </div>
      <a
        href="https://ecency.com"
        className="er-wave-renderer--logo"
        aria-label="Ecency"
        dangerouslySetInnerHTML={{ __html: Logo }}
      />
      <div className="er-wave-renderer--body">
        <EcencyRenderer value={post.body} embedDepth={depth} />
      </div>
    </article>
  );
}

export function WaveLikePostExtension({
  containerRef,
  embedDepth = 0,
}: {
  containerRef: RefObject<HTMLElement | null>;
  embedDepth?: number;
}) {
  const rootsRef = useRef<ReturnType<typeof createRoot>[]>([]);

  useEffect(() => {
    rootsRef.current.forEach(r => r.unmount());
    rootsRef.current = [];

    const container = containerRef.current;
    if (!container) {
      return;
    }

    const queryClient = getQueryClient();

    findPostLinkElements(container)
      .filter((el) => isWaveLikePost(el.getAttribute("href") ?? ""))
      .forEach((element) => {
        try {
          // Verify element is still connected to the DOM before manipulation
          if (!element.isConnected || !element.parentNode) {
            console.warn("Wave-like post element is not connected to DOM, skipping");
            return;
          }

          const container = document.createElement("div");
          container.classList.add("er-wave");

          // Use createRoot instead of hydrateRoot (no server-rendered content to hydrate)
          const root = createRoot(container);
          rootsRef.current.push(root);
          root.render(
            <QueryClientProvider client={queryClient}>
              <WaveLikePostRenderer
                link={element.getAttribute("href") ?? ""}
                depth={embedDepth + 1}
              />
            </QueryClientProvider>
          );

          // Final safety check before replacing
          if (element.isConnected && element.parentElement) {
            element.parentElement.replaceChild(container, element);
          }
        } catch (error) {
          console.warn("Error enhancing wave-like post element:", error);
        }
      });

    return () => {
      rootsRef.current.forEach(r => r.unmount());
      rootsRef.current = [];
    };
  }, [embedDepth]);

  return <></>;
}
