import { QueryClient } from "@tanstack/react-query";
import {
  config as hiveTxConfig,
  setNodes as setHiveTxNodes,
  setRestNodes as setHiveTxRestNodes,
  setRestNodesByApi as setHiveTxRestNodesByApi,
  setUserAgent as setHiveTxUserAgent,
  setResilience as setHiveTxResilience,
  type ResilienceOptions,
} from "../../hive-tx";
import type { APIMethods } from "../../hive-tx/api-types";

// Safe environment variable access for browser builds
// In browser builds, tsup will replace process.env.* with literal values at compile time
const isDevelopment = (() => {
  try {
    return process.env?.NODE_ENV === 'development';
  } catch {
    return false;
  }
})();

const getHeliusApiKey = () => {
  try {
    return process.env?.VITE_HELIUS_API_KEY;
  } catch {
    return undefined;
  }
};

/** Timeout for internal API calls (search, private API). */
export const INTERNAL_API_TIMEOUT_MS = 10_000;

/**
 * How `CONFIG.queryClient` is resolved.
 *
 * This used to be a plain `queryClient: new QueryClient()` property — a single
 * instance created at module import and shared by every caller for the lifetime
 * of the process. That is correct in a browser (one process, one user) but wrong
 * under SSR, where one process serves every request: each server render wrote its
 * fetched data into that one cache and nothing ever removed it, so the heap grew
 * monotonically until the renderer hit its old-space limit and aborted.
 *
 * A host that renders on the server registers a resolver (see
 * `ConfigManager.setQueryClientResolver`) which returns the *current request's*
 * client, so cached data dies with the request that produced it. Hosts that
 * genuinely want one long-lived client keep using `setQueryClient`, and callers
 * that configure nothing fall back to a lazily created instance.
 *
 * The resolver is consulted on every read rather than cached here on purpose:
 * request scoping is the host's concern, and only the host can know when one
 * request ends and the next begins.
 */
let queryClientResolver: (() => QueryClient) | undefined;

/** Created on first use, and only when no resolver has been registered. */
let fallbackQueryClient: QueryClient | undefined;

function resolveQueryClient(): QueryClient {
  if (queryClientResolver) {
    return queryClientResolver();
  }
  return (fallbackQueryClient ??= new QueryClient());
}

export const CONFIG = {
  privateApiHost: "https://ecency.com",
  /**
   * Observer used for bridge calls when nobody is logged in. The bridge applies
   * this account's mute list to the response, marking muted authors' posts and
   * comments `stats.gray` so clients can dim or collapse them. Anonymous
   * visitors therefore inherit Ecency's moderation instead of seeing an
   * unfiltered firehose. Apps may override via `ConfigManager.setDefaultObserver`,
   * which expects a real account rather than "" (see that setter).
   *
   * Note this only *marks* content: the bridge still returns muted authors'
   * posts, so an observer never shortens a feed.
   */
  defaultObserver: "ecency",
  /**
   * First-party client identifier sent as the `X-Ecency-Client` header on
   * search/private API requests. Lets the origin distinguish Ecency's own
   * web/mobile/SSR traffic from third-party integrators (who should use the
   * keyed api.hivesearcher.com backend instead of the public proxy). This is
   * a routing marker, not a secret. Apps may override via
   * `ConfigManager.setClientId` (e.g. "web" or "mobile") for observability.
   */
  clientId: "ecency-sdk",
  imageHost: "https://i.ecency.com",
  /** Current Hive RPC nodes. Reads from the unified hive-tx config. */
  get hiveNodes(): string[] {
    return hiveTxConfig.nodes;
  },
  heliusApiKey: getHeliusApiKey(),
  /**
   * The React Query client all SDK code reads through `getQueryClient()`.
   * Backed by a resolver so an SSR host can scope it per request — see the
   * `queryClientResolver` note above. Assigning replaces the resolver with one
   * that always returns the assigned client, preserving the previous
   * "one client, set once" behaviour for browser and native hosts.
   */
  get queryClient(): QueryClient {
    return resolveQueryClient();
  },
  set queryClient(client: QueryClient) {
    queryClientResolver = () => client;
  },
  pollsApiHost: "https://poll.ecency.com",
  plausibleHost: "https://pl.ecency.com",
  // DMCA filtering - can be configured by the app
  dmcaAccounts: [] as string[],
  dmcaTags: [] as string[],
  dmcaPatterns: [] as string[],
  // Pre-compiled regex patterns for performance and security
  dmcaTagRegexes: [] as RegExp[],
  dmcaPatternRegexes: [] as RegExp[],
  // Track if DMCA has been initialized to avoid duplicate logs
  _dmcaInitialized: false,
};

type DmcaListsInput = {
  accounts?: string[];
  tags?: string[];
  posts?: string[];
};

export namespace ConfigManager {
  export function setQueryClient(client: QueryClient) {
    CONFIG.queryClient = client;
  }

  /**
   * Register how the SDK should obtain its React Query client, for hosts where
   * a single shared instance is wrong — principally SSR, where one process
   * serves many requests and a shared cache both leaks memory and risks serving
   * one request's data to another.
   *
   * `resolve` is called on every SDK cache access and should return the client
   * belonging to the request currently being handled. In a Next.js App Router
   * host that means wrapping the factory in React's `cache()`, which memoises
   * per request:
   *
   * ```ts
   * ConfigManager.setQueryClientResolver(() => getQueryClient());
   * ```
   *
   * Registering a resolver supersedes any client previously passed to
   * `setQueryClient`; assigning a client afterwards supersedes the resolver.
   */
  export function setQueryClientResolver(resolve: () => QueryClient) {
    queryClientResolver = resolve;
  }

  /**
   * Set the private API host
   * @param host - The private API host URL (e.g., "https://ecency.com" or "" for relative URLs)
   */
  export function setPrivateApiHost(host: string) {
    CONFIG.privateApiHost = host;
  }

  /**
   * Set the first-party client identifier sent as the `X-Ecency-Client` header
   * on search/private API requests (e.g. "web" or "mobile"). Defaults to
   * "ecency-sdk". Used by the origin to tell Ecency's own apps apart from
   * third-party integrators.
   * @param clientId - Short client label
   */
  export function setClientId(clientId: string) {
    CONFIG.clientId = clientId;
  }

  /**
   * Set the observer used for bridge calls made without a logged-in user.
   * Defaults to "ecency"; a third-party integrator should point this at their
   * own moderation account.
   *
   * Must be a real account. There is no empty-string opt-out: consumers resolve
   * it with `||`, and `getDiscussion` separately falls back to the post author,
   * so "" would not disable mute marking, it would silently observe as someone
   * else and disagree with the cache key it was recorded under.
   * @param observer - Hive account whose mute list applies to anonymous reads
   */
  export function setDefaultObserver(observer: string) {
    CONFIG.defaultObserver = observer;
  }

  /**
   * Get a validated base URL for API requests
   * Returns a valid base URL that can be used with new URL(path, baseUrl)
   *
   * Priority:
   * 1. CONFIG.privateApiHost if set (dev/staging or explicit config)
   * 2. window.location.origin if in browser (production with relative URLs)
   * 3. 'https://ecency.com' as fallback for SSR (production default)
   *
   * @returns A valid base URL string
   * @throws Never throws - always returns a valid URL
   */
  export function getValidatedBaseUrl(): string {
    if (CONFIG.privateApiHost) {
      return CONFIG.privateApiHost;
    }

    if (typeof window !== 'undefined' && window.location?.origin) {
      return window.location.origin;
    }

    // Fallback for SSR when privateApiHost is empty (production case)
    return 'https://ecency.com';
  }

  /**
   * Set the polls API host
   * @param host - The polls API host URL (e.g., "https://poll.ecency.com")
   */
  export function setPollsApiHost(host: string) {
    CONFIG.pollsApiHost = host;
  }

  /**
   * Set the image host
   * @param host - The image host URL (e.g., "https://i.ecency.com")
   */
  export function setImageHost(host: string) {
    CONFIG.imageHost = host;
  }

  /**
   * Set Hive RPC nodes, replacing the default list.
   * Delegates to the unified hive-tx `setNodes` (single validated setter,
   * shared with the lean `@ecency/sdk/hive` entry) so node configuration is
   * defined in exactly one place.
   * @param nodes - Array of Hive RPC node URLs
   */
  export function setHiveNodes(nodes: string[]) {
    setHiveTxNodes(nodes);
  }

  /**
   * Set the REST-API node list, replacing the default `restNodes`. Lets an app
   * add/remove REST hosts at runtime (e.g. drop an own node being decommissioned,
   * or widen the public pool) without forking + republishing the SDK. Delegates to
   * the unified hive-tx `setRestNodes` (validated, shared with `@ecency/sdk/hive`).
   * @param nodes - Array of REST-capable node URLs (without a trailing slash)
   */
  export function setRestNodes(nodes: string[]) {
    setHiveTxRestNodes(nodes);
  }

  /**
   * Merge per-API REST node overrides. For each API a non-empty valid list pins it
   * to those hosts (so `callREST` never wastes its retry budget on a node that
   * 404/503s the API); an empty list removes the pin (falls back to `restNodes`).
   * Other APIs' pins (e.g. the built-in `hivesense`) are preserved. Delegates to the
   * unified hive-tx `setRestNodesByApi`.
   * @param map - Partial map of REST API name → capable node URLs
   */
  export function setRestNodesByApi(map: Partial<Record<APIMethods, string[]>>) {
    setHiveTxRestNodesByApi(map);
  }

  /**
   * Set the User-Agent sent on server-side (Node) requests to Hive nodes.
   * Lets an app label its own SSR/server traffic (otherwise Node's fetch sends a
   * bare `node` UA). No effect in browsers (User-Agent is a forbidden header) or
   * React Native (keeps its native UA). Delegates to the unified hive-tx setter.
   * @param userAgent - The User-Agent string (e.g. "ecency-web-ssr (+https://ecency.com)")
   */
  export function setUserAgent(userAgent: string) {
    setHiveTxUserAgent(userAgent);
  }

  /**
   * Tune read-call tail-latency resilience: adaptive per-attempt timeouts
   * (default on) and hedged requests (default OFF — a duplicate request races
   * the next healthy node when the primary stalls, bounded by a token bucket so
   * only the slow tail hedges and pool-wide slowness self-disables it). Partial:
   * only the fields provided are changed; invalid values are ignored
   * field-by-field. Delegates to the unified hive-tx `setResilience`.
   * @param opts - e.g. `{ hedge: true }` to opt into hedged reads
   */
  export function setResilience(opts: Partial<ResilienceOptions>) {
    setHiveTxResilience(opts);
  }

  /**
   * Static analysis: Check for known ReDoS-vulnerable patterns
   * @param pattern - Raw regex pattern string
   * @returns Object with risk level and reason
   */
  function analyzeRedosRisk(pattern: string): { safe: boolean; reason?: string } {
    // Check 1: Nested quantifiers (e.g., (a+)+, (a*)+, (a{1,})+)
    if (/(\([^)]*[*+{][^)]*\))[*+{]/.test(pattern)) {
      return { safe: false, reason: "nested quantifiers detected" };
    }

    // Check 2: Alternation with overlapping terms (e.g., (a|a)+, (ab|a)+)
    if (/\([^|)]*\|[^)]*\)[*+{]/.test(pattern)) {
      return { safe: false, reason: "alternation with quantifier (potential overlap)" };
    }

    // Check 3: Catastrophic backtracking patterns (e.g., (a*)*b, (a+)+b)
    if (/\([^)]*[*+][^)]*\)[*+]/.test(pattern)) {
      return { safe: false, reason: "repeated quantifiers (catastrophic backtracking risk)" };
    }

    // Check 4: Greedy quantifiers followed by optional patterns (e.g., .*.*x, .+.+x)
    if (/\.\*\.\*/.test(pattern) || /\.\+\.\+/.test(pattern)) {
      return { safe: false, reason: "multiple greedy quantifiers on wildcards" };
    }

    // Check 5: Unbounded ranges with wildcards (e.g., .{1,999999})
    const unboundedRange = /\.?\{(\d+),(\d+)\}/g;
    let match;
    while ((match = unboundedRange.exec(pattern)) !== null) {
      const [, min, max] = match;
      const range = parseInt(max, 10) - parseInt(min, 10);
      if (range > 1000) {
        return { safe: false, reason: `excessive range: {${min},${max}}` };
      }
    }

    return { safe: true };
  }

  /**
   * Runtime test: Execute regex against adversarial inputs with timeout
   * @param regex - Compiled regex
   * @returns Object indicating if regex passed runtime test
   */
  function testRegexPerformance(regex: RegExp): { safe: boolean; reason?: string } {
    // Test inputs designed to trigger ReDoS in vulnerable patterns
    const adversarialInputs = [
      // Nested quantifier attack
      "a".repeat(50) + "x",
      // Alternation attack
      "ab".repeat(50) + "x",
      // Wildcard attack
      "x".repeat(100),
      // Mixed attack
      "aaa".repeat(30) + "bbb".repeat(30) + "x",
    ];

    const maxExecutionTime = 5; // 5ms hard limit per test

    for (const input of adversarialInputs) {
      const start = Date.now();
      try {
        regex.test(input);
        const duration = Date.now() - start;

        if (duration > maxExecutionTime) {
          return {
            safe: false,
            reason: `runtime test exceeded ${maxExecutionTime}ms (took ${duration}ms on input length ${input.length})`
          };
        }
      } catch (err) {
        return { safe: false, reason: `runtime test threw error: ${err}` };
      }
    }

    return { safe: true };
  }

  /**
   * Safely compile a regex pattern with defense-in-depth validation
   * @param pattern - Raw regex pattern string
   * @param maxLength - Maximum allowed pattern length (default 200)
   * @returns Compiled RegExp or null if invalid/unsafe
   */
  function safeCompileRegex(pattern: string, maxLength = 200): RegExp | null {
    // Use the module-level isDevelopment constant

    try {
      // Layer 1: Basic validation
      if (!pattern) {
        if (isDevelopment) {
          console.warn(`[SDK] DMCA pattern rejected: empty pattern`);
        }
        return null;
      }

      if (pattern.length > maxLength) {
        if (isDevelopment) {
          console.warn(`[SDK] DMCA pattern rejected: length ${pattern.length} exceeds max ${maxLength} - pattern: ${pattern.substring(0, 50)}...`);
        }
        return null;
      }

      // Layer 2: Static ReDoS analysis
      const staticAnalysis = analyzeRedosRisk(pattern);
      if (!staticAnalysis.safe) {
        if (isDevelopment) {
          console.warn(`[SDK] DMCA pattern rejected: static analysis failed (${staticAnalysis.reason}) - pattern: ${pattern.substring(0, 50)}...`);
        }
        return null;
      }

      // Layer 3: Compilation attempt
      let regex: RegExp;
      try {
        regex = new RegExp(pattern);
      } catch (compileErr) {
        if (isDevelopment) {
          console.warn(`[SDK] DMCA pattern rejected: compilation failed - pattern: ${pattern.substring(0, 50)}...`, compileErr);
        }
        return null;
      }

      // Layer 4: Runtime performance testing
      const runtimeTest = testRegexPerformance(regex);
      if (!runtimeTest.safe) {
        if (isDevelopment) {
          console.warn(`[SDK] DMCA pattern rejected: runtime test failed (${runtimeTest.reason}) - pattern: ${pattern.substring(0, 50)}...`);
        }
        return null;
      }

      return regex;
    } catch (err) {
      if (isDevelopment) {
        console.warn(`[SDK] DMCA pattern rejected: unexpected error - pattern: ${pattern.substring(0, 50)}...`, err);
      }
      return null;
    }
  }

  /**
   * Set DMCA filtering lists
   * @param lists - DMCA lists object containing accounts/tags/posts arrays
   */
  export function setDmcaLists(
    lists: DmcaListsInput = {}
  ) {
    const coerceList = (value: unknown): string[] =>
      Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];

    // Ensure we have a valid object to work with
    const input = lists || {};

    const resolved = {
      accounts: coerceList(input.accounts),
      tags: coerceList(input.tags),
      patterns: coerceList(input.posts),
    };

    CONFIG.dmcaAccounts = resolved.accounts;
    CONFIG.dmcaTags = resolved.tags;
    CONFIG.dmcaPatterns = resolved.patterns;

    // Pre-compile tag regex patterns (tags can be regex)
    CONFIG.dmcaTagRegexes = resolved.tags
      .map((pattern) => safeCompileRegex(pattern))
      .filter((r): r is RegExp => r !== null);

    // Post patterns are plain strings for exact matching, not regex
    // No compilation needed - they will be used with simple string comparison
    CONFIG.dmcaPatternRegexes = [];

    const rejectedTagCount = resolved.tags.length - CONFIG.dmcaTagRegexes.length;

    // Only log once to avoid noise during builds/hot reloads
    // Only show in development mode to avoid cluttering production console
    // Use the module-level isDevelopment constant

    if (!CONFIG._dmcaInitialized && isDevelopment) {
      console.log(`[SDK] DMCA configuration loaded:`);
      console.log(`  - Accounts: ${resolved.accounts.length}`);
      console.log(`  - Tag patterns: ${CONFIG.dmcaTagRegexes.length}/${resolved.tags.length} compiled (${rejectedTagCount} rejected)`);
      console.log(`  - Post patterns: ${resolved.patterns.length} (using exact string matching)`);

      if (rejectedTagCount > 0) {
        console.warn(`[SDK] ${rejectedTagCount} DMCA tag patterns were rejected due to security validation. Check warnings above for details.`);
      }
    }

    CONFIG._dmcaInitialized = true;
  }
}
