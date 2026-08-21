/**
 * SDK Initialization - runs immediately when imported
 *
 * This file configures the SDK with DMCA filtering lists before any queries execute.
 * It must be imported early in both client and server entry points to ensure
 * the DMCA lists are available from the first render.
 */

import { ConfigManager } from "@ecency/sdk";
import defaults from "@/defaults";
import dmcaAccounts from "../../public/dmca/dmca-accounts.json";
import dmcaTags from "../../public/dmca/dmca-tags.json";
import dmcaPosts from "../../public/dmca/dmca-posts.json";
import publicNodes from "../../public/public-nodes.json";

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
ConfigManager.setImageHost(defaults.imageServer);
ConfigManager.setHiveNodes(publicNodes);

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

  // Server-side read-through RPC proxy (vapi's /private-api/ssr/rpc): the
  // allowlisted reads every render makes (accounts, profiles, communities,
  // per-tag feeds, posts) are answered from one cache per host instead of
  // being fetched by every renderer process on its own. An optimization, not
  // a dependency: the SDK falls back to the node pool on any proxy failure.
  // Switched on per deployment (SSR_RPC_PROXY=1) and only when both sides
  // carry the shared secret; INTERNAL_API_HOST is the overlay route to vapi.
  // The timeout sits just above vapi's own lookup budget (1.5s), so a proxy
  // that cannot answer in time is its 504, and the SDK's per-node timeout
  // bounds it further; the prefetch's own abort signal bounds the whole call
  // either way, so the proxy can never extend a render past the SSR cap.
  const proxyHost = process.env.INTERNAL_API_HOST;
  const proxySecret = process.env.SSR_INTERNAL_SECRET;
  if (process.env.SSR_RPC_PROXY === "1" && proxyHost && proxySecret) {
    ConfigManager.setServerRpcProxy({
      url: `${proxyHost.replace(/\/+$/, "")}/private-api/ssr/rpc`,
      headers: { "X-Ecency-Internal": proxySecret },
      timeoutMs: 1600
    });
  }
}

// Initialize DMCA filtering immediately at module load time
// This ensures the lists are available before any React Query fetches execute
// Files are in public/dmca/ for both bundling and mobile app access
ConfigManager.setDmcaLists({
  accounts: dmcaAccounts.accounts ?? [],
  tags: dmcaTags.tags ?? [],
  posts: dmcaPosts.posts ?? [],
});

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
