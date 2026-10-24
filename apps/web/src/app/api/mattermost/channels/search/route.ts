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
const HIVE_LOOKUP_TIMEOUT_MS = 5_000;

// Short per-process caches so repeated and prefix searches don't re-ask Hive
// or the Mattermost admin API every time.
const HIVE_MATCHES_TTL_MS = 60_000;
const CHANNEL_ID_TTL_MS = 60_000;
const MAX_CACHE_ENTRIES = 1_000;
type Community = { name: string; title?: string };
const hiveMatchesCache = new Map<string, { at: number; value: Community[] }>();
const channelIdCache = new Map<string, { at: number; value: string }>();

function readCache<T>(cache: Map<string, { at: number; value: T }>, key: string, ttl: number) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < ttl) return hit.value;
  cache.delete(key);
  return undefined;
}

function writeCache<T>(cache: Map<string, { at: number; value: T }>, key: string, value: T) {
  if (cache.size >= MAX_CACHE_ENTRIES) cache.clear();
  cache.set(key, { at: Date.now(), value });
}

async function lookUpHiveCommunities(query: string, signal: AbortSignal): Promise<Community[]> {
  const key = query.toLowerCase();
  const cached = readCache(hiveMatchesCache, key, HIVE_MATCHES_TTL_MS);
  if (cached) return cached;
  let matches: Community[];
  if (HIVE_COMMUNITY_ID.test(key)) {
    const community = await findHiveCommunity(key, signal);
    matches = community ? [community] : [];
  } else if (key.length >= 3) {
    matches = await searchHiveCommunities(query, MAX_HIVE_MATCHES, signal);
  } else {
    return [];
  }
  // A failed or aborted Hive call also reads as "no match", so only remember
  // real matches. Empty results are cheap to ask for again.
  if (matches.length > 0) writeCache(hiveMatchesCache, key, matches);
  return matches;
}

async function ensureCommunityChannelId(community: Community, signal: AbortSignal) {
  const key = community.name.toLowerCase();
  const cached = readCache(channelIdCache, key, CHANNEL_ID_TTL_MS);
  if (cached) return cached;
  const id = await ensureChannelForCommunity(community.name, community.title, signal);
  writeCache(channelIdCache, key, id);
  return id;
}

// Bootstrap only auto-joins a user's first few subscribed communities, so a
// community channel may not exist yet. Look the query up on Hive and make sure
// its best matches have a channel, so they can be found and joined from search
// (the mobile app has no other way to reach them). Never fails the search.
async function findHiveCommunityChannels(
  query: string,
  knownNames: Set<string>,
  signal: AbortSignal
): Promise<MattermostChannelSummary[]> {
  const communities = await lookUpHiveCommunities(query, signal);

  const missing = communities
    .filter((c) => !knownNames.has(c.name.toLowerCase()))
    .slice(0, MAX_HIVE_MATCHES);

  const results = await Promise.allSettled(
    missing.map(async (c) => ({
      id: await ensureCommunityChannelId(c, signal),
      name: c.name.toLowerCase(),
      display_name: Array.from(c.title?.trim() || c.name).slice(0, 64).join(""),
      type: "O"
    }))
  );
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
