import defaults from "@/defaults";
import { shouldUseDefaultBase } from "@/utils/host-utils";
import { headers } from "next/headers";

type HeaderReader = {
  get(name: string): string | null;
};

const getForwardedProto = (headersList: HeaderReader): string => {
  const proto = (
    headersList.get("x-forwarded-proto") ||
    headersList.get("x-forwarded-scheme") ||
    headersList.get("x-forwarded-protocol") ||
    "https"
  )
    .split(",")[0]
    .trim()
    .toLowerCase();
  return proto === "http" ? "http" : "https";
};

const getForwardedHost = (headersList: HeaderReader): string | null => {
  const value = headersList.get("x-forwarded-host") || headersList.get("host");
  return value ? value.split(",")[0].trim().toLowerCase() : null;
};

/**
 * Only the site's own host (the configured base's host, or a subdomain of it)
 * may name the base URL written into links and metadata. Request headers are
 * set by whoever sends the request, so any other value is ignored.
 */
const isOwnHost = (host: string): boolean => {
  const own = new URL(defaults.base).hostname.toLowerCase();
  const hostname = host.replace(/:\d+$/, "");
  return /^[a-z0-9.-]+$/.test(hostname) && (hostname === own || hostname.endsWith(`.${own}`));
};

export const getServerAppBase = async (): Promise<string> => {
  const envBase = process.env.NEXT_PUBLIC_APP_BASE || process.env.APP_BASE;
  if (envBase) {
    return envBase;
  }

  try {
    const headersList = await headers();
    const host = getForwardedHost(headersList);
    if (host) {
      if (shouldUseDefaultBase(host) || !isOwnHost(host)) {
        return defaults.base;
      }

      const proto = getForwardedProto(headersList);
      // The host name only: a port in a request header is not the site's.
      return `${proto}://${host.replace(/:\d+$/, "")}`;
    }
  } catch (e) {
    // headers() is only available within request/route handlers and server components
    // In tests or build time we may not have access, so gracefully fall back to env/defaults
  }

  return defaults.base;
};
