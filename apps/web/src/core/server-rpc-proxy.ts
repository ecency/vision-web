import { ConfigManager } from "@ecency/sdk";

/**
 * Server-side read-through RPC proxy (vapi's /private-api/ssr/rpc): the
 * allowlisted reads every render makes (accounts, profiles, communities,
 * per-tag feeds, posts) are answered from one cache per host instead of being
 * fetched by every renderer process on its own. An optimization, not a
 * dependency: the SDK falls back to the node pool on any proxy failure, and
 * skips the nodes the proxy's answer names as throttling or failing.
 *
 * On whenever the deployment hands this process the shared secret (vapi
 * switches its side on from the same value) and the overlay route to vapi
 * (INTERNAL_API_HOST). No separate switch: the secret is the switch, in one
 * place, for both services. SSR_RPC_PROXY=0 is an explicit off for an on-box
 * kill that leaves the secret alone.
 *
 * The timeout sits just above vapi's own lookup budget (1.5s), so a proxy that
 * cannot answer in time is its 504, and the SDK's per-node timeout bounds it
 * further; the prefetch's own abort signal bounds the whole call either way, so
 * the proxy can never extend a render past the SSR cap.
 *
 * Called once per SDK copy: the render bundle (core/sdk-init) and the
 * middleware bundle each carry their own, with their own proxy setting,
 * counters and node health. `label` tells their report lines apart.
 */
const RPC_PROXY_REPORT_MS = 5 * 60 * 1000;

let enabled = false;

export function enableServerRpcProxy(label = "rpc-proxy"): boolean {
  if (enabled) return true;
  const proxyHost = process.env.INTERNAL_API_HOST;
  const proxySecret = process.env.SSR_INTERNAL_SECRET;
  if (process.env.SSR_RPC_PROXY === "0" || !proxyHost || !proxySecret) return false;
  ConfigManager.setServerRpcProxy({
    url: `${proxyHost.replace(/\/+$/, "")}/private-api/ssr/rpc`,
    headers: { "X-Ecency-Internal": proxySecret },
    timeoutMs: 1600
  });
  enabled = true;
  startRpcProxyReport(label);
  return true;
}

/**
 * Per node: what this process asked the node itself (not through the proxy),
 * as ok/failed/429. Added to vapi's own per-node counters, this is the whole
 * host's traffic to each node, which is what a node's rate limit counts.
 */
function nodeCountsPart(): string {
  const counts = ConfigManager.getNodeCallCounts?.() ?? {};
  const parts: string[] = [];
  for (const [node, c] of Object.entries(counts).sort(([a], [b]) => a.localeCompare(b))) {
    let host = node;
    try {
      host = new URL(node).host;
    } catch {
      // keep the raw entry
    }
    parts.push(`${host}=${c.ok}/${c.failed}/${c.rateLimited}`);
  }
  return parts.length > 0 ? ` nodes(ok/failed/429)=${parts.join(",")}` : "";
}

/**
 * One summary line per interval, and only when the counters moved since the
 * last line, so a quiet process writes nothing after its first report. The
 * SDK's fallbacks are otherwise invisible: a read that went to the node pool
 * because the proxy was down, timed out or answered an unusable body renders
 * the page all the same, and the cache's own counters cannot see a request
 * that never reached it. The first line (five minutes after boot, even at
 * zero) shows the reporter is alive. Cumulative, never reset; per process.
 */
function startRpcProxyReport(label: string): void {
  let last = "";
  const tick = () => {
    const s = ConfigManager.getServerRpcProxyStats();
    const r = s.fallbackByReason;
    const line =
      `served=${s.served} fallback=${s.fallback} ` +
      `(status=${r.status} rpcerror=${r.rpcerror ?? 0} ratelimited=${r.ratelimited ?? 0} upstream=${r.upstream ?? 0} timeout=${r.timeout} transport=${r.transport} ` +
      `validate=${r.validate} parse=${r.parse}) skipped=${s.skipped} parked_out=${s.parkedOut ?? 0}` +
      nodeCountsPart();
    if (line === last) return;
    last = line;
    console.log(`[${label}] ${line}`);
  };
  // Node's timer has unref(); a numeric handle elsewhere simply has none.
  const handle = setInterval(tick, RPC_PROXY_REPORT_MS) as { unref?: () => void };
  handle.unref?.();
}
