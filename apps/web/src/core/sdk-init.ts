/**
 * SDK Initialization - runs immediately when imported
 *
 * This file configures the SDK with DMCA filtering lists before any queries execute.
 * It must be imported early in both client and server entry points to ensure
 * the DMCA lists are available from the first render.
 */

import { ConfigManager } from "@ecency/sdk";
import defaults from "@/defaults";
// One loader for the takedown lists, which route handlers call on their own
// because they never execute the root layout (#1862). A call and not a bare
// side-effect import, because webpack prunes those here: see core/dmca-lists.
import { loadDmcaLists } from "@/core/dmca-lists";
import publicNodes from "../../public/public-nodes.json";
import { enableServerRpcProxy } from "@/core/server-rpc-proxy";

// Configure SDK API host based on environment.
//
// Client-side (browser on ecency.com): empty string for relative URLs
// Server-side (SSR): use INTERNAL_API_HOST if set (Docker internal route to vapi,
//   skips Cloudflare round-trip) or fall back to public URL
// Client-side (non-production): absolute public URL
const isMainProductionClient =
  typeof window !== "undefined" &&
  (window.location.hostname === "ecency.com" || window.location.hostname.endsWith(".ecency.com"));

const isServer = typeof window === "undefined";
const privateApiHost = isMainProductionClient
  ? ""
  : isServer
    ? (process.env.INTERNAL_API_HOST || "https://ecency.com")
    : "https://ecency.com";
ConfigManager.setPrivateApiHost(privateApiHost);
// The newsletter relay is our OWN /api/newsletter route handlers, so in the
// browser those requests stay same-origin on EVERY deployment (localhost and
// custom hostnames included) instead of following privateApiHost to
// ecency.com. SSR never calls the relay, and Node cannot fetch a relative
// URL anyway, so the override is browser-only.
if (!isServer) {
  ConfigManager.setNewsletterHost("");
}
ConfigManager.setImageHost(defaults.imageServer);
ConfigManager.setHiveNodes(publicNodes);
loadDmcaLists();

// Label server-side (SSR) Hive requests so this traffic is identifiable in node
// analytics instead of the bare `node` User-Agent that Node's fetch sends by
// default. No effect in the browser (User-Agent is a forbidden header there).
if (isServer) {
  ConfigManager.setUserAgent("ecency-web-ssr (+https://ecency.com)");

  // Opt into hedged reads — SERVER ONLY, deliberately. When a public node
  // stalls mid-request, a duplicate races the next healthy node after a short
  // data-driven delay and the first success wins; the SDK's token bucket keeps
  // hedges to the slow tail (~10% max) and pool-wide slowness drains the
  // bucket (auto-disable). That per-process safety property only holds where
  // processes are few (3 SSR replicas ⇒ worst transient burst ≈ 30 requests).
  // In browsers it would be N-thousand uncoordinated buckets, all bursting at
  // the same next-ranked public node during a fleet-wide slowdown — exactly
  // the amplification the bucket exists to prevent. Browsers keep adaptive
  // per-attempt timeouts (SDK default, subtractive-only) and normal failover.
  // This bounds SSR render time when a node slows or throttles under a spike,
  // instead of stalled renders piling up into heap exhaustion.
  ConfigManager.setResilience({ hedge: true });

  // Server-side read-through RPC proxy (vapi's /private-api/ssr/rpc): see
  // core/server-rpc-proxy. Middleware runs in its own bundle with its own SDK
  // copy and switches it on there too.
  enableServerRpcProxy();
}

// NOTE: Web broadcast adapter is NOT initialized here.
// Mutation hooks should retrieve and pass the shared web adapter singleton
// when calling SDK mutations.
//
// Example usage in a hook:
// ```typescript
// import { useVote } from '@ecency/sdk';
// import { getWebBroadcastAdapter } from '@/providers/sdk';
//
// export function useVoteMutation() {
//   const currentUser = useGlobalStore(state => state.activeUser);
//   const adapter = getWebBroadcastAdapter();
//
//   return useVote(currentUser?.username, { adapter });
// }
// ```
