import type { APIMethods } from './api-types'

/**
 * Unified configuration for Hive blockchain connectivity.
 * This is the single source of truth for node endpoints, timeouts, and chain settings.
 * Mutate this object directly or use ConfigManager.setHiveNodes() for validated updates.
 */
export const config = {
  /**
   * Array of Hive API node endpoints for load balancing and failover.
   */
  /*
   * techcoderx.com is deliberately absent: its condenser_api.get_accounts serves
   * account rows with posting_json_metadata stripped to "" while balances and
   * reputation are correct. That is a well-formed result, so it passes shape
   * validation and the health tracker keeps it ranked by latency alone.
   *
   * Wallet token visibility is read entirely from profile.tokens[].meta.show in
   * that metadata, so a stripped row reads as "this user enabled nothing" and the
   * wallet silently falls back to HIVE/HP/HBD/Points. getAccountFullQueryOptions
   * cross-checks against the hivemind profile and re-reads, but that guard only
   * fires when hivemind reports profile *values* — an account whose metadata is
   * just `tokens` (no name/about/image) has none, so it would slip through.
   * Keeping the node out of the pool removes the dependency on that guard.
   *
   * Note this is RPC-only: the same host serves full metadata over its REST
   * (hafbe) endpoint, so it remains valid in `restNodes`.
   */
  nodes: [
    'https://api.hive.blog',
    'https://api.deathwing.me',
    'https://api.openhive.network',
    'https://api.syncad.com',
    'https://rpc.mahdiyari.info',
  ],

  /**
   * Array of Hive API node endpoints that support REST APIs.
   * Note: Without the trailing /
   */
  restNodes: [
    'https://api.hive.blog',
    'https://rpc.mahdiyari.info',
    'https://api.syncad.com',
    'https://hiveapi.actifit.io',
    'https://api.c0ff33a.uk'
  ],

  /**
   * Per-API REST node override. Some APIs are served by only a subset of
   * nodes; list just those capable hosts here so callREST never burns its
   * (small) retry budget on nodes that 404/503 the API, and a cold start
   * hits a capable node immediately. Any API not listed falls back to
   * `restNodes`. The health tracker still orders *within* this list.
   *
   * hivesense: empirically only ~2 public nodes serve /hivesense-api (the
   * other configured nodes 404/503 it; Ecency's own was decommissioned), so
   * pin them — otherwise the health tracker keeps rediscovering incapable
   * nodes each cooldown and cold starts waste attempts.
   */
  restNodesByApi: {
    hivesense: ['https://api.hive.blog', 'https://api.syncad.com']
  } as Partial<Record<APIMethods, string[]>>,

  /**
   * User-Agent sent on server-side (Node) HTTP requests to Hive nodes.
   *
   * Node's built-in fetch (undici) sends a bare `User-Agent: node` when none is
   * set, which is indistinguishable from any random Node script in node/CDN
   * analytics. A descriptive value lets operators tell their own SSR/server
   * traffic apart from anonymous scrapers. Only applied in Node — browsers
   * forbid overriding User-Agent (it is silently dropped) and React Native sets
   * its own native UA, so client and mobile traffic are untouched. Override via
   * `ConfigManager.setUserAgent()` (or `setUserAgent()` from `@ecency/sdk/hive`).
   */
  userAgent: 'ecency-sdk',

  /**
   * The Hive blockchain chain ID for transaction signing and verification.
   */
  chain_id: 'beeab0de00000000000000000000000000000000000000000000000000000000',

  /**
   * Address prefix used for public key formatting (STM for mainnet).
   */
  address_prefix: 'STM',

  /**
   * Timeout in milliseconds for read API calls (get_content, get_accounts, etc.).
   * Kept short so the health tracker can fail over to another node quickly.
   */
  timeout: 5_000,

  /**
   * Timeout in milliseconds for broadcast API calls.
   * Longer than read timeout because broadcast_transaction_synchronous waits
   * for block inclusion, which depends on the 3-second block interval and
   * network conditions.
   */
  broadcastTimeout: 15_000,

  /**
   * Number of retry attempts for failed API calls before throwing an error.
   * Total attempts = retry + 1. With ~7 nodes in the list, a budget of 5
   * means callRPC iterates through 6 distinct nodes before giving up, so a
   * single sick node (or two) can't surface as an unhandled error to the
   * caller while the rest of the list is healthy.
   */
  retry: 5,

  /**
   * Tail-latency resilience for READ calls. Motivation: on a shared public-node
   * pool a node can slow down or throttle *mid-request*; a fixed `timeout` means
   * the caller only notices after the full window, and under SSR concurrency
   * those stalled renders pile up. Two mechanisms, both scoped to reads only
   * (broadcasts never hedge and keep their fixed `broadcastTimeout`):
   *
   * - Adaptive per-attempt timeout (`adaptiveTimeout`, default ON): when a
   *   node has a usable latency profile (EWMA), the per-attempt timeout becomes
   *   `min(callerTimeout, max(floorMs, factor × EWMA))` — a node running far
   *   above its own baseline is abandoned early and failover starts sooner.
   *   Never *raises* the caller's timeout; unprofiled nodes keep it unchanged.
   *
   * - Hedged requests (`hedge`, default OFF — opt in via `setResilience`): if
   *   the primary attempt is still pending after `max(hedgeDelayFloorMs,
   *   hedgeDelayFactor × EWMA)`, a duplicate request is fired at the next
   *   healthy untried node and the first success wins (the loser is aborted).
   *   A token bucket (`hedgeBucketCapacity` burst, refilled by
   *   `hedgeRefillPerSuccess` per un-hedged success) caps hedges to roughly
   *   `hedgeRefillPerSuccess` of traffic, so only the slow tail hedges — and
   *   under pool-wide slowness the bucket drains and hedging auto-disables
   *   instead of amplifying load into public-node rate limits.
   */
  resilience: {
    adaptiveTimeout: true,
    adaptiveTimeoutFloorMs: 2_000,
    adaptiveTimeoutFactor: 4,
    hedge: false,
    hedgeDelayFloorMs: 750,
    hedgeDelayFactor: 2,
    hedgeBucketCapacity: 10,
    hedgeRefillPerSuccess: 0.1,
    /**
     * Wall-clock budget for one read call across ALL failover attempts, as a
     * multiple of the per-attempt timeout: no NEW attempt starts past
     * `totalBudgetFactor × timeout` (an in-flight attempt still finishes its
     * own window). Bounds the pathological pool-wide-slowness walk — without
     * it a read could hold its caller for (retry+1) × timeout ≈ 30s, which
     * under SSR concurrency is a memory pile-up, the exact incident this
     * feature exists for. Applies to reads only (callRPC / callREST);
     * broadcasts keep their try-each-node-once semantics.
     */
    totalBudgetFactor: 2
  }
}

/** Shape of the `config.resilience` bag (see its doc comment). */
export type ResilienceOptions = typeof config.resilience

/**
 * Server-side read-through proxy for RPC reads (see `setServerRpcProxy`).
 * `methods` is the allowlist the proxy serves; a read outside it goes straight
 * to the node pool as before.
 */
export interface ServerRpcProxyOptions {
  /** Absolute URL of the proxy endpoint (POST `{api, method, params}`). */
  url: string
  /** Headers sent with every proxy call (the shared internal secret). */
  headers: Record<string, string>
  /** Per-call timeout in ms; on expiry the read falls back to the node pool. */
  timeoutMs: number
  /** Fully qualified method names (`bridge.get_post`) the proxy may answer;
   * omitted = DEFAULT_SERVER_RPC_PROXY_METHODS. An empty list is ignored. */
  methods?: string[]
  /**
   * After this many consecutive proxy misses the proxy is skipped for
   * `cooldownMs`, so a proxy that is down costs one failed call per cooldown
   * window rather than one per read. Default 3 / 10s. A served call resets it.
   */
  failureThreshold?: number
  cooldownMs?: number
}

/** Default allowlist: the reads a server render makes and the proxy caches. */
export const DEFAULT_SERVER_RPC_PROXY_METHODS: readonly string[] = [
  'bridge.get_ranked_posts',
  'bridge.get_account_posts',
  'bridge.get_post',
  'bridge.get_discussion',
  'bridge.get_profile',
  'bridge.get_profiles',
  'bridge.get_community',
  'bridge.list_communities',
  'condenser_api.get_accounts',
  'condenser_api.get_content',
  'condenser_api.get_dynamic_global_properties',
  'condenser_api.get_trending_tags'
]

/**
 * Active proxy configuration, or null (the default: every read goes to the node
 * pool). Lives outside `config` so the browser bundle never carries it; it is
 * only ever consulted under Node.
 */
export interface ServerRpcProxyState extends Required<ServerRpcProxyOptions> {
  methodSet: Set<string>
}

export let serverRpcProxy: ServerRpcProxyState | null = null

/**
 * Route allowlisted server-side reads through a read-through cache in front
 * of the node pool. One cache per host answers the reads every renderer
 * process used to make on its own; a miss there is one upstream call shared by
 * every concurrent reader. The proxy is an optimization, never a dependency:
 * any failure (non-200, timeout, transport error, a response the caller's
 * validator rejects) falls straight through to the existing node loop, so the
 * worst case is the latency of a failed proxy call on top of what happens
 * today. Has no effect outside Node. Pass null to switch it off.
 */
export const setServerRpcProxy = (opts: ServerRpcProxyOptions | null): void => {
  if (opts === null) {
    serverRpcProxy = null
    return
  }
  if (!opts || typeof opts !== 'object') return
  const url = typeof opts.url === 'string' ? opts.url.trim() : ''
  if (!/^https?:\/\//i.test(url)) return
  const headers: Record<string, string> = {}
  if (opts.headers && typeof opts.headers === 'object') {
    for (const [k, v] of Object.entries(opts.headers)) {
      if (typeof v === 'string' && v && !/[\u0000-\u001f\u007f]/.test(v) && !/[\u0000-\u001f\u007f]/.test(k)) {
        headers[k] = v
      }
    }
  }
  const timeoutMs =
    typeof opts.timeoutMs === 'number' && Number.isFinite(opts.timeoutMs) && opts.timeoutMs > 0
      ? opts.timeoutMs
      : 2_000
  const methods =
    opts.methods === undefined
      ? [...DEFAULT_SERVER_RPC_PROXY_METHODS]
      : Array.isArray(opts.methods)
        ? opts.methods.filter((m): m is string => typeof m === 'string' && m.includes('.'))
        : []
  // Nothing to route through the proxy: keep whatever was configured before.
  if (methods.length === 0) return
  const pos = (v: unknown, fallback: number): number =>
    typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : fallback
  serverRpcProxy = {
    url,
    headers,
    timeoutMs,
    methods,
    failureThreshold: Math.floor(pos(opts.failureThreshold, 3)),
    cooldownMs: pos(opts.cooldownMs, 10_000),
    methodSet: new Set(methods)
  }
}

/**
 * Validated setter for the Hive RPC node list — replaces `config.nodes`.
 * Trims, drops non-http(s) entries, and de-dupes (order-preserving). A no-op
 * if nothing valid remains, so a bad input can't empty the list.
 *
 * Lives here, in the React-free `hive-tx` core, on purpose: it must be
 * reachable from BOTH the full `@ecency/sdk` entry (via
 * `ConfigManager.setHiveNodes`, which delegates here) and the lean
 * `@ecency/sdk/hive` server/CLI entry — without dragging react-query or the
 * DMCA/ReDoS surface of `ConfigManager` into the lean entry. Within a single
 * bundle this mutates the one `config` instance `callRPC` reads; the
 * cross-bundle single-instance guarantee is a separate (build-level) concern.
 */
/**
 * Trim, drop non-string / non-http(s), and de-dupe (order-preserving) a node
 * list. Shared by `setNodes` and the REST-node setters below so all three
 * normalize identically.
 */
const sanitizeNodeList = (nodes: unknown): string[] =>
  Array.isArray(nodes)
    ? [
        ...new Set(
          nodes
            .filter((n): n is string => typeof n === 'string')
            // Trim, then strip trailing slashes so REST paths concatenate cleanly:
            // `callREST` builds `node + '/status-api'`, and a `https://host/` node would
            // otherwise yield `https://host//status-api`, which several HAF nodes 404.
            // De-dupe AFTER normalizing so `host` and `host/` collapse to one entry.
            .map((n) => n.trim().replace(/\/+$/, ''))
            .filter((n) => n.length > 0 && /^https?:\/\/.+/.test(n))
        )
      ]
    : []

export const setNodes = (nodes: string[]): void => {
  const validNodes = sanitizeNodeList(nodes)
  if (!validNodes.length) return
  config.nodes = validNodes
}

/**
 * Validated setter for the REST-API node list — replaces `config.restNodes`.
 * Same shape/guarantees as `setNodes` (trim, drop non-http(s), de-dupe, no-op on
 * empty). Exists because `restNodes` is otherwise baked into the SDK: an app that
 * wants to add/remove a REST host (e.g. drop an own node it is decommissioning, or
 * widen the public pool) previously had to fork + republish the SDK. With this, the
 * REST pool is app-configurable at runtime exactly like the read pool. Lives in the
 * React-free `hive-tx` core so both the full `@ecency/sdk` entry and the lean
 * `@ecency/sdk/hive` entry can reach it.
 */
export const setRestNodes = (nodes: string[]): void => {
  const valid = sanitizeNodeList(nodes)
  if (!valid.length) return
  config.restNodes = valid
}

/**
 * Merge validated per-API REST node overrides into `config.restNodesByApi`.
 * For each entry: a non-empty, valid list pins that API to those hosts; an empty or
 * all-invalid list REMOVES the pin so the API falls back to `restNodes`. Other APIs'
 * existing pins (e.g. the built-in `hivesense`) are preserved. Lets an app pin the
 * APIs it actually uses to known-capable hosts (so `callREST` never burns its small
 * retry budget on a node that 404/503s the API) without an SDK republish.
 */
export const setRestNodesByApi = (
  map: Partial<Record<APIMethods, string[]>>
): void => {
  if (!map || typeof map !== 'object') return
  const next: Partial<Record<APIMethods, string[]>> = { ...config.restNodesByApi }
  for (const [api, list] of Object.entries(map)) {
    const valid = sanitizeNodeList(list)
    if (valid.length) {
      next[api as APIMethods] = valid
    } else {
      delete next[api as APIMethods]
    }
  }
  config.restNodesByApi = next
}

/**
 * Validated setter for the User-Agent sent on server-side (Node) requests.
 * Trims the input and ignores an empty value so a bad input can't blank out the
 * header. Like `setNodes`, it lives in the React-free `hive-tx` core so it is
 * reachable from both the full `@ecency/sdk` entry (via
 * `ConfigManager.setUserAgent`) and the lean `@ecency/sdk/hive` server/CLI entry.
 */
export const setUserAgent = (ua: string): void => {
  // Defensive against plain-JS / React Native callers that may pass a non-string
  // despite the `string` type (avoids throwing on `.trim()`).
  if (typeof ua !== 'string') return
  const value = ua.trim()
  // Ignore blank values, and reject control characters (CR, LF, and other
  // C0/DEL controls). An invalid header value would otherwise be stored and make
  // every subsequent fetch throw, and rejecting CR/LF closes a header-injection
  // vector for any caller that builds the UA from untrusted input.
  if (!value || /[\u0000-\u001f\u007f]/.test(value)) return
  config.userAgent = value
}

/**
 * Validated partial setter for `config.resilience` (adaptive read timeouts +
 * hedged requests — see the field's doc comment). Booleans must be booleans;
 * numeric fields must be finite and positive, with the refill rate additionally
 * capped at 1 so a typo can't turn the tail-hedge into a traffic doubler
 * (refill ≤ 1 ⇒ hedges can never exceed un-hedged successes). Invalid values
 * are ignored field-by-field, so one bad entry can't block the rest. Lives in
 * the React-free `hive-tx` core (like the other setters) so both `@ecency/sdk`
 * (via `ConfigManager.setResilience`) and the lean `@ecency/sdk/hive` entry
 * can reach it.
 */
export const setResilience = (opts: Partial<ResilienceOptions>): void => {
  if (!opts || typeof opts !== 'object') return
  const r = config.resilience
  const bool = (v: unknown): v is boolean => typeof v === 'boolean'
  const pos = (v: unknown): v is number =>
    typeof v === 'number' && Number.isFinite(v) && v > 0
  if (bool(opts.adaptiveTimeout)) r.adaptiveTimeout = opts.adaptiveTimeout
  // Floor must stay ≥ the tracker's slow-failure recording floor (2s): the
  // safety argument for adaptive timeouts is that an abort at the window IS
  // recorded as a slow sample, growing the EWMA so the window self-corrects
  // upward. A floor below 2s would abort without recording — the window could
  // never converge and a too-tight profile would starve that call forever.
  if (pos(opts.adaptiveTimeoutFloorMs)) {
    r.adaptiveTimeoutFloorMs = Math.max(opts.adaptiveTimeoutFloorMs, 2_000)
  }
  if (pos(opts.adaptiveTimeoutFactor)) r.adaptiveTimeoutFactor = opts.adaptiveTimeoutFactor
  if (bool(opts.hedge)) r.hedge = opts.hedge
  if (pos(opts.hedgeDelayFloorMs)) r.hedgeDelayFloorMs = opts.hedgeDelayFloorMs
  if (pos(opts.hedgeDelayFactor)) r.hedgeDelayFactor = opts.hedgeDelayFactor
  if (pos(opts.hedgeBucketCapacity)) r.hedgeBucketCapacity = opts.hedgeBucketCapacity
  // Refill must stay ≤ 1: at 1 token per success the hedge rate could reach
  // 100% of traffic, defeating the "tail only" contract. Cap rather than reject
  // so a caller asking for "more hedging" gets the safe maximum.
  if (pos(opts.hedgeRefillPerSuccess)) {
    r.hedgeRefillPerSuccess = Math.min(opts.hedgeRefillPerSuccess, 1)
  }
  // Below 1 the budget could not even cover the configured per-attempt window.
  if (pos(opts.totalBudgetFactor)) {
    r.totalBudgetFactor = Math.max(opts.totalBudgetFactor, 1)
  }
}
