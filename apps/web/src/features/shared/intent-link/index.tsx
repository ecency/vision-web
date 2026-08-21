"use client";

import Link from "next/link";
import React, { useCallback, useContext, useRef } from "react";
import {
  AppRouterContext,
  type PrefetchOptions
} from "next/dist/shared/lib/app-router-context.shared-runtime";

type LinkProps = React.ComponentProps<typeof Link>;

// Every caller passes a path string; keeping the prop to strings means no
// supported href shape can silently end up with neither kind of prefetch.
export type IntentLinkProps = Omit<LinkProps, "prefetch" | "href"> & { href: string };

// Same kind a Link's viewport prefetch uses (PrefetchKind.AUTO), written as the
// literal so the only runtime import from Next internals is the router context,
// which next/link itself reads.
const AUTO: PrefetchOptions = { kind: "auto" as PrefetchOptions["kind"] };

/**
 * `next/link` that prefetches on intent (hover / touch / focus) instead of on
 * viewport entry.
 *
 * A feed page renders ~120 links (five per card plus the tag and community
 * widgets). With the default `prefetch`, every one of them fires an RSC request
 * as it scrolls into view: ~100 requests and ~1 MB on a desktop /trending, and
 * an origin render for each (#1593). Next's `prefetch={false}` switches ALL
 * prefetching off, including hover, so this pairs it with an explicit
 * `router.prefetch` the moment the reader signals intent, keeping soft
 * navigation as quick as before for the link they actually click.
 *
 * The prefetch uses the same "auto" kind as the default viewport prefetch, so
 * a hover costs the origin exactly what a viewport entry used to, never more.
 */
export function IntentLink({
  href,
  target,
  onMouseEnter,
  onTouchStart,
  onFocus,
  ...rest
}: IntentLinkProps) {
  // Read the context directly rather than via useRouter(): the wrappers that
  // render this are also mounted in tests and in trees without an app router,
  // and a missing router simply means nothing to prefetch.
  const router = useContext(AppRouterContext);
  const prefetched = useRef<string | null>(null);

  const prefetch = useCallback(() => {
    if (!router || !isInternal(href) || opensNewContext(target)) {
      return;
    }
    if (prefetched.current === href || !networkAllowsPrefetch()) {
      return;
    }
    try {
      router.prefetch(href, AUTO);
      // Only a prefetch that was issued counts; a throw leaves the next
      // intent free to retry.
      prefetched.current = href;
    } catch {
      // A failed prefetch only means the click fetches the route instead.
    }
  }, [router, href, target]);

  return (
    <Link
      {...rest}
      href={href}
      target={target}
      prefetch={false}
      onMouseEnter={(e) => {
        onMouseEnter?.(e);
        prefetch();
      }}
      onTouchStart={(e) => {
        onTouchStart?.(e);
        prefetch();
      }}
      onFocus={(e) => {
        onFocus?.(e);
        prefetch();
      }}
    />
  );
}

function isInternal(href: string): boolean {
  return href.startsWith("/") && !href.startsWith("//");
}

// target keywords are case-insensitive in HTML.
function opensNewContext(target: string | undefined): boolean {
  return typeof target === "string" && target.toLowerCase() === "_blank";
}

interface NetworkInformationLike {
  saveData?: boolean;
  effectiveType?: string;
}

// Mirrors the conditions under which next/link itself declines to prefetch.
function networkAllowsPrefetch(): boolean {
  if (typeof navigator === "undefined") {
    return false;
  }
  const connection = (navigator as Navigator & { connection?: NetworkInformationLike }).connection;
  if (!connection) {
    return true;
  }
  if (connection.saveData) {
    return false;
  }
  return !/2g/.test(connection.effectiveType ?? "");
}
