import { ConfigManager } from "@ecency/sdk";
import { isServer, QueryClient } from "@tanstack/react-query";
import { cache } from "react";

/**
 * Web-only query identifiers for features that have no SDK equivalent.
 * SDK-backed queries should use QueryKeys from @ecency/sdk instead.
 */
export enum QueryIdentifiers {
  COMMUNITY_THREADS = "community-threads",
  THREADS = "threads",
  ENTRY_PIN_TRACK = "entry-pin-track",
  PROMOTED_ENTRIES = "promoted-entries",
  SWAP_FORM_CURRENCY_RATE = "swap-form-currency-rate",
  THREE_SPEAK_VIDEO_LIST = "three-speak-video-list",
  THREE_SPEAK_VIDEO_LIST_FILTERED = "three-speak-video-list-filtered",
  CONTRIBUTORS = "contributors",
  GIFS = "GIFS",
  MARKET_TRADING_VIEW = "market-trading-view",
  MARKET_BUCKET_SIZE = "market-bucket-size"
}

export function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // With SSR, we usually want to set some default staleTime
        // above 0 to avoid refetching immediately on the client
        staleTime: 60 * 1000, // 60 seconds - prevents immediate refetch after SSR prefetch
        /**
         * How long an unused entry stays before React Query collects it.
         *
         * The server needs a far shorter window than the browser. Every query a
         * render creates schedules a gc timer, and a pending timer is a GC root,
         * so each request's fetched data stays reachable for the whole gcTime no
         * matter that the client itself is per-request. A server process
         * therefore settles at roughly `ingest rate × gcTime`, and at ecency.com
         * volume 10 minutes puts that steady state (~2.9GB measured) on top of
         * the 3072MB `--max-old-space-size` cap: the renderer never reaches
         * equilibrium, it aborts on the way there and Swarm restarts it.
         *
         * 2 minutes leaves the same ceiling ~5x of headroom while staying far
         * longer than any single render (1-5s), which is the only window a
         * server entry has to be reused before it is dehydrated into the
         * payload. The browser keeps 10 minutes, where entries are reused across
         * navigations and the working set is one user's, not every user's.
         */
        gcTime: isServer ? 2 * 60 * 1000 : 10 * 60 * 1000,
        refetchOnWindowFocus: false,
        refetchOnMount: false,
        // Disable retries on server. hive-tx already retries across 7 nodes
        // with health tracking; React Query retrying on top multiplies
        // timeouts (1s × 8 nodes × 3 RQ retries = ~24s per query).
        // Client-side keeps default retries (3) for transient network errors.
        ...(isServer ? { retry: false } : {})
      }
    }
  });
}

export const getQueryClient = isServer
  ? cache(() => makeQueryClient())
  : () => {
      if ((global as any).clientQueryClient) {
        ConfigManager.setQueryClient((global as any).clientQueryClient);
        return (global as any).clientQueryClient as QueryClient;
      }
      (global as any).clientQueryClient = makeQueryClient();

      ConfigManager.setQueryClient((global as any).clientQueryClient);
      return (global as any).clientQueryClient as QueryClient;
    };

// The client branch above hands the SDK its query client on first use, but on
// the server that never happened: `cache()` gives each request its own client
// while SDK internals kept reading the module-level one they were constructed
// with. Every server render therefore wrote into a single process-wide cache
// that nothing ever cleared, and the renderer's heap grew until it aborted.
//
// Registering a resolver instead of a client is what makes this work: `cache()`
// memoises per request, so `getQueryClient()` returns the caller's own client
// and the SDK follows the request it is actually serving.
if (isServer) {
  ConfigManager.setQueryClientResolver(() => getQueryClient());
}

export * from "./query-helpers";
