import { NextResponse } from "next/server";
import { getAccountSubscriptionsQueryOptions } from "@ecency/sdk";
import { QueryClient } from "@tanstack/react-query";
import { Subscription } from "@/entities";
import {
  CHAT_BAN_PROP,
  ChatBannedError,
  ensureCommunityChannelMembership,
  ensureMattermostUser,
  ensurePersonalToken,
  ensureUserInTeam,
  getMattermostOutageStatus,
  getUserLeftChannels,
  removeUserLeftChannel,
  withMattermostTokenCookie
} from "@/server/mattermost";
import { verifyHsAccessToken } from "@/server/hivesigner-verify";

// Hard ceiling on the entire bootstrap handler. Individual mmFetch calls
// have their own 10s timeout, but a user with 50 communities chains
// 10+ batches sequentially. Without a total cap, worst case is 100s+.
const BOOTSTRAP_TIMEOUT_MS = 30_000;

export async function POST(req: Request) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), BOOTSTRAP_TIMEOUT_MS);
  const signal = AbortSignal.any([req.signal, ac.signal]);

  try {
    // Promise.race guarantees a hard 30s response deadline.
    // The AbortController additionally cancels the underlying work
    // so handleBootstrap doesn't zombie after the timeout fires.
    return await Promise.race([
      handleBootstrap(req, signal),
      new Promise<never>((_, reject) => {
        if (signal.aborted) {
          reject(new DOMException("bootstrap aborted", "AbortError"));
          return;
        }
        signal.addEventListener("abort", () => reject(new DOMException("bootstrap aborted", "AbortError")), { once: true });
      })
    ]);
  } catch (error) {
    if (ac.signal.aborted) {
      console.warn("MM bootstrap: timed out after 30s");
      return NextResponse.json({ error: "bootstrap timed out" }, { status: 504 });
    }
    if (req.signal.aborted) {
      console.warn("MM bootstrap: client disconnected");
      return NextResponse.json({ error: "client disconnected" }, { status: 499 });
    }
    console.error("MM bootstrap: unexpected top-level error", error);
    const message = error instanceof Error ? error.message : "unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  } finally {
    clearTimeout(timer);
  }
}

async function handleBootstrap(req: Request, signal: AbortSignal): Promise<NextResponse> {
    // 1) Parse body safely
    let body: any;
    try {
        body = await req.json();
    } catch (e) {
        console.error("MM bootstrap: invalid JSON body", e);
        return NextResponse.json({ error: "invalid json" }, { status: 400 });
    }

    const username = body.username as string | undefined;
    const accessToken = body.accessToken as string | undefined;
    const displayName = (body.displayName as string | undefined) || username;
    const communityTitle = body.communityTitle as string | undefined;
    const community = body.community as string | undefined;

    if (!username) {
        return NextResponse.json({ error: "username missing" }, { status: 400 });
    }

    // 2) Verify access token via HiveSigner. Refresh tokens cannot be validated
    //    against /api/me directly — if the access token is missing or expired
    //    the client refreshes it via hsTokenRenew() and retries.
    if (!accessToken) {
        return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const verification = await verifyHsAccessToken(accessToken, signal);
    if (verification.ok === false) {
        if (verification.reason === "unavailable") {
            // HS itself is down/timing out — return 503 so the React Query
            // retry path kicks in instead of forcing the user to re-login.
            return NextResponse.json(
                { error: "chat service unavailable" },
                { status: 503 }
            );
        }
        return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    if (verification.username.toLowerCase() !== username.toLowerCase()) {
        return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    // 4) Kick off the Hive subscriptions fetch in parallel with Mattermost
    //    provisioning below. Subscriptions only need the username, and the
    //    rest of the bootstrap doesn't need the result until step 5.
    //    Stacking the two sequentially can push long-tail bootstraps past
    //    the upstream timeout for users with many community subscriptions.
    //
    //    A per-request QueryClient is required: the shared getQueryClient()
    //    is scoped to Server Components, not Route Handlers, so it persists
    //    across requests in a long-lived container and serves stale
    //    subscription data — which would auto-join the user to communities
    //    they unsubscribed from. Subscriptions failure is non-fatal (logged,
    //    treated as empty list — same as before).
    const qc = new QueryClient();
    const subscriptionsQuery = getAccountSubscriptionsQueryOptions(username);
    const abortSubscriptions = () => {
        qc.cancelQueries({ queryKey: subscriptionsQuery.queryKey });
    };
    signal.addEventListener("abort", abortSubscriptions, { once: true });
    // Track our own teardown so the .catch below can distinguish a real
    // subscription failure from a cancellation we caused ourselves via the
    // qc.clear() in this function's finally — otherwise an unrelated
    // failure upstream would log a misleading "Unable to load subscriptions".
    let subscriptionsTornDown = false;
    const subscriptionsPromise: Promise<Subscription[]> = qc
        .fetchQuery(subscriptionsQuery)
        .then((s) => (s ?? []) as unknown as Subscription[])
        .catch((error) => {
            // Always settle as []. Signal aborts surface elsewhere via
            // signal.throwIfAborted(); making this promise always-resolve
            // means an early return in step 3 can't leave a dangling
            // unhandled rejection. Skip the log on both abort AND teardown.
            if (!signal.aborted && !subscriptionsTornDown) {
                console.error("MM bootstrap: Unable to load Hive/Ecency subscriptions", error);
            }
            return [] as Subscription[];
        });

    try {
    // 3) Mattermost user / team / personal token.
    //    ensureMattermostUser must come first (it gives us user.id). After
    //    that, ensureUserInTeam and ensurePersonalToken are independent and
    //    fan out via Promise.all. ensurePersonalToken now returns the user
    //    record it already fetched internally, so we get user.props (for
    //    left-channels) without an extra round-trip.
    //
    //    A per-step AbortController lets us tear down the still-running
    //    parallel call if its sibling rejects — otherwise the survivor
    //    would fire-and-forget (the ensure-* helpers are idempotent so the
    //    work is benign, but the upstream round-trips are avoidable).
    let user;
    let personalToken: string;
    let userWithProps;
    const stepAc = new AbortController();
    const stepSignal = AbortSignal.any([signal, stepAc.signal]);
    try {
        user = await ensureMattermostUser(username, signal);
        const [, tokenResult] = await Promise.all([
            ensureUserInTeam(user.id, stepSignal),
            ensurePersonalToken(user.id, stepSignal)
        ]);
        personalToken = tokenResult.token;
        userWithProps = tokenResult.user;
    } catch (e) {
        stepAc.abort();
        // A caller/timeout abort must propagate to the top-level handler so it
        // can distinguish 504 (our 30s hard cap) from 499 (client disconnect).
        // Burying it under a generic outage status here would lose that.
        if (signal.aborted || (e instanceof Error && e.name === "AbortError")) {
            throw e;
        }
        // A live chat ban on a deactivated account is a moderation decision,
        // not an outage: answer 403 with the expiration so the client can say
        // so, instead of the 502 the outage mapping would produce (which reads
        // as "chat is down" and invites a retry loop).
        if (e instanceof ChatBannedError) {
            console.warn("MM bootstrap: refused to reactivate banned account", {
              username,
              bannedUntil: e.bannedUntil
            });
            return NextResponse.json(
                {
                  error: e.message,
                  bannedUntil: e.bannedUntil,
                  reason: e.reason,
                  prop: CHAT_BAN_PROP
                },
                { status: 403 }
            );
        }
        // Don't flatten every failure to 502. A per-call timeout or upstream
        // overload is transient: returning 503/504 lets the client retry
        // instead of treating the chat session as dead and forcing a re-login
        // (the dominant pain for browser-extension integrators that re-bootstrap
        // in parallel). 502 stays reserved for a genuine, non-retryable outage.
        const status = getMattermostOutageStatus(e);
        console.error("MM bootstrap: MM user/team/token error", {
          username,
          status,
          error: e
        });
        return NextResponse.json(
          {
            error:
              status === 504
                ? "chat service timed out"
                : "chat service unavailable"
          },
          { status }
        );
    }

    signal.throwIfAborted();

    // Wait for the in-flight subscriptions fetch (almost always already
    // resolved by the time we get here for typical bootstraps).
    const subscriptions = await subscriptionsPromise;

    const communityIds = subscriptions
        .map((sub: Subscription) => ({
          id: sub?.[0] as string | undefined,
          title: sub?.[1] as string | undefined
        }))
        .filter(
          (value): value is { id: string; title: string | undefined } =>
            Boolean(value.id)
        );

    const uniqueCommunityIds = new Map<string, string | undefined>();
    for (const c of communityIds) {
        if (!uniqueCommunityIds.has(c.id)) {
          uniqueCommunityIds.set(c.id, c.title);
        }
    }

    let channelId: string | null = null;

    // 5) Join channels for communities the user is subscribed to
    //    Skip channels the user has manually left (respect user choice)
    const BATCH_SIZE = 5;

    const leftChannels = getUserLeftChannels(userWithProps);

    signal.throwIfAborted();

    // Ensure channels exist and join for all subscribed communities
    const communityEntries = Array.from(uniqueCommunityIds);
    const channelResults: PromiseSettledResult<{ communityId: string; channelId: string }>[] = [];

    for (let i = 0; i < communityEntries.length; i += BATCH_SIZE) {
      signal.throwIfAborted();
      const batch = communityEntries.slice(i, i + BATCH_SIZE);
      const batchResults = await Promise.allSettled(
        batch.map(async ([communityId, title]) => {
          const normalizedId = communityId.trim().toLowerCase();
          // Skip auto-join if user manually left this channel
          const shouldAutoJoin = !leftChannels.has(normalizedId);
          try {
            const ensuredChannelId = await ensureCommunityChannelMembership(
              user.id,
              communityId,
              title,
              shouldAutoJoin,
              signal
            );
            return { communityId, channelId: ensuredChannelId };
          } catch (err) {
            throw Object.assign(err instanceof Error ? err : new Error(String(err)), { communityId });
          }
        })
      );
      channelResults.push(...batchResults);
    }
    const failedChannels = channelResults.filter(
      (r): r is PromiseRejectedResult => r.status === "rejected"
    );
    if (failedChannels.length > 0) {
      const failedIds = failedChannels.map(r => r.reason?.communityId ?? r.reason?.message ?? "unknown");
      console.warn("MM bootstrap: some channels failed", { username, count: failedChannels.length, failedIds });
    }

    // For explicitly requested community, always auto-join the user
    // and clear the left-channel record since this is an intentional join
    if (community) {
      try {
        channelId = await ensureCommunityChannelMembership(
          user.id,
          community,
          communityTitle || displayName || community,
          true,
          signal
        );
        const normalizedCommunity = community.trim().toLowerCase();
        if (leftChannels.has(normalizedCommunity)) {
          signal.throwIfAborted();
          await removeUserLeftChannel(user.id, normalizedCommunity, signal).catch((e) => {
            console.warn("MM bootstrap: failed to clear left-channel record", { username, community: normalizedCommunity, error: e });
          });
        }
      } catch (e) {
        console.warn("MM bootstrap: explicit community join failed", { username, community, error: e });
      }
    }

    const response = NextResponse.json({
        ok: true,
        userId: user.id,
        channelId,
        token: personalToken
    });
    return withMattermostTokenCookie(response, personalToken);
    } finally {
        // Mark teardown BEFORE clearing the QueryClient so the in-flight
        // subscriptions .catch can tell our own cancellation apart from a
        // real fetch failure.
        subscriptionsTornDown = true;
        signal.removeEventListener("abort", abortSubscriptions);
        qc.clear();
        // Belt-and-braces: attach a no-op consumer so qc.clear()'s
        // cancellation never surfaces as an unhandled rejection on early-
        // return paths.
        subscriptionsPromise.catch(() => {});
    }
}
