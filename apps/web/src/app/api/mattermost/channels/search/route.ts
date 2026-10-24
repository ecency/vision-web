import { NextResponse } from "next/server";
import {
  ensureChannelForCommunity,
  getMattermostTeamId,
  getMattermostTokenFromCookies,
  handleMattermostError,
  isMattermostUnauthorizedError,
  mmUserFetch
} from "@/server/mattermost";
import { isMattermostDefaultChannel } from "../helpers";
import { findHiveCommunity, searchHiveCommunities } from "@/server/hive-community";
import { takeChannelCreateSlot } from "@/server/chat-channel-create-budget";

interface MattermostChannelSummary {
  id: string;
  name: string;
  display_name: string;
  type: string;
}

interface ChannelSearchPayload {
  term?: string;
  public?: boolean;
  private?: boolean;
}

const HIVE_COMMUNITY_ID = /^hive-\d+$/i;
const MAX_HIVE_MATCHES = 3;
// Hive's title search also matches descriptions; ask for a few more and keep
// only communities whose title really contains the query.
const HIVE_SEARCH_LIMIT = 10;
const HIVE_LOOKUP_TIMEOUT_MS = 5_000;

// Short per-process cache so repeated and prefix searches don't re-ask Hive.
const HIVE_MATCHES_TTL_MS = 60_000;
const MAX_CACHE_ENTRIES = 1_000;
type Community = { name: string; title?: string };
const hiveMatchesCache = new Map<string, { at: number; value: Community[] }>();

function readHiveMatches(key: string): Community[] | undefined {
  const hit = hiveMatchesCache.get(key);
  if (hit && Date.now() - hit.at < HIVE_MATCHES_TTL_MS) return hit.value;
  hiveMatchesCache.delete(key);
  return undefined;
}

function writeHiveMatches(key: string, value: Community[]): void {
  if (hiveMatchesCache.size >= MAX_CACHE_ENTRIES) hiveMatchesCache.clear();
  hiveMatchesCache.set(key, { at: Date.now(), value });
}

/** Communities that clearly match: the exact id, or a title containing the query. */
async function lookUpHiveCommunities(query: string, signal: AbortSignal): Promise<Community[]> {
  const key = query.toLowerCase();
  const cached = readHiveMatches(key);
  if (cached) return cached;
  let matches: Community[];
  if (HIVE_COMMUNITY_ID.test(key)) {
    const community = await findHiveCommunity(key, signal);
    matches = community ? [community] : [];
  } else if (key.length >= 3) {
    matches = (await searchHiveCommunities(query, HIVE_SEARCH_LIMIT, signal))
      .filter((c) => c.title?.toLowerCase().includes(key))
      .slice(0, MAX_HIVE_MATCHES);
  } else {
    return [];
  }
  // A failed or aborted Hive call also reads as "no match", so only remember
  // real matches. Empty results are cheap to ask for again.
  if (matches.length > 0) writeHiveMatches(key, matches);
  return matches;
}

class CreateRefusedError extends Error {}

// Bootstrap only auto-joins a user's first few subscribed communities, so a
// community channel may not exist yet. Look the query up on Hive and make sure
// its clear matches have a channel, so they can be found and joined from search
// (the mobile app has no other way to reach them). Creating a missing channel
// spends the user's hourly budget. Never fails the search.
async function findHiveCommunityChannels(
  query: string,
  knownNames: Set<string>,
  token: string,
  signal: AbortSignal
): Promise<MattermostChannelSummary[]> {
  const communities = await lookUpHiveCommunities(query, signal);
  const missing = communities.filter((c) => !knownNames.has(c.name.toLowerCase()));
  if (!missing.length) return [];

  let userId: Promise<string> | undefined;
  const allowCreate = async (): Promise<boolean> => {
    userId ??= mmUserFetch<{ id: string }>("/users/me", token, { signal }).then((u) => u.id);
    if (await takeChannelCreateSlot(await userId)) return true;
    throw new CreateRefusedError();
  };

  const results = await Promise.allSettled(
    missing.map(async (c) => ({
      id: await ensureChannelForCommunity(c.name, c.title, signal, allowCreate),
      name: c.name.toLowerCase(),
      display_name: Array.from(c.title?.trim() || c.name).slice(0, 64).join(""),
      type: "O"
    }))
  );
  const failed = results.flatMap((r, i) =>
    r.status === "rejected" ? [{ community: missing[i].name, reason: r.reason }] : []
  );
  // A refused budget or an aborted request is expected; log anything else once.
  const unexpected = failed.filter(
    (f) =>
      !(f.reason instanceof CreateRefusedError) &&
      f.reason?.name !== "AbortError" &&
      f.reason?.name !== "TimeoutError"
  );
  if (unexpected.length) {
    console.warn("MM channel search: community channels unavailable", {
      failures: unexpected.map((f) => ({
        community: f.community,
        error: f.reason instanceof Error ? f.reason.message : String(f.reason)
      }))
    });
  }
  return results.flatMap((r) => (r.status === "fulfilled" ? [r.value] : []));
}

export async function POST(req: Request) {
  const token = await getMattermostTokenFromCookies();
  if (!token) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let payload: ChannelSearchPayload = {};
  try {
    payload = (await req.json()) as ChannelSearchPayload;
  } catch (error) {
    return NextResponse.json({ error: "invalid request" }, { status: 400 });
  }

  const query = payload.term?.trim() || "";
  const includePublic = payload.public ?? true;
  const includePrivate = payload.private ?? true;

  if (query.length < 2) {
    return NextResponse.json({ channels: [] });
  }

  try {
    const teamId = getMattermostTeamId();
    const channels = await mmUserFetch<MattermostChannelSummary[]>(
      `/teams/${teamId}/channels/search`,
      token,
      {
        method: "POST",
        body: JSON.stringify({
          term: query,
          public: includePublic,
          private: includePrivate
        })
      }
    );

    // A non-array body is an upstream anomaly, not an empty result set. Pass it
    // through unchanged so callers can still tell the two apart.
    if (!Array.isArray(channels)) {
      return NextResponse.json({ channels });
    }

    // Keep search in sync with the channel list: the team defaults are hidden
    // there, so surfacing them here would let a user open a channel that then
    // disappears from their sidebar. Their display names can also collide with
    // a real community channel, making the two results indistinguishable.
    const visible = channels.filter((channel) => !isMattermostDefaultChannel(channel));

    const communityChannels = includePublic
      ? await findHiveCommunityChannels(
          query,
          new Set(visible.map((channel) => channel.name.toLowerCase())),
          token,
          AbortSignal.any([req.signal, AbortSignal.timeout(HIVE_LOOKUP_TIMEOUT_MS)])
        ).catch(() => [])
      : [];

    return NextResponse.json({ channels: [...visible, ...communityChannels] });
  } catch (error) {
    if (isMattermostUnauthorizedError(error)) {
      return handleMattermostError(error);
    }

    if (error instanceof Error && error.message.includes("(400)")) {
      // Mattermost responds with a 400 when the search payload is rejected.
      // Instead of surfacing an error to the user, just return no results.
      return NextResponse.json({ channels: [] });
    }

    return handleMattermostError(error);
  }
}
