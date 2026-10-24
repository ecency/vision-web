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

// Bootstrap only auto-joins a user's first few subscribed communities, so a
// community channel may not exist yet. Look the query up on Hive and make sure
// its best matches have a channel, so they can be found and joined from search
// (the mobile app has no other way to reach them). Never fails the search.
async function findHiveCommunityChannels(
  query: string,
  knownNames: Set<string>,
  signal: AbortSignal
): Promise<MattermostChannelSummary[]> {
  const communities = HIVE_COMMUNITY_ID.test(query)
    ? [await findHiveCommunity(query.toLowerCase(), signal)].filter(
        (c): c is { name: string; title?: string } => c !== null
      )
    : query.length >= 3
      ? await searchHiveCommunities(query, MAX_HIVE_MATCHES, signal)
      : [];

  const missing = communities
    .filter((c) => !knownNames.has(c.name.toLowerCase()))
    .slice(0, MAX_HIVE_MATCHES);

  const results = await Promise.allSettled(
    missing.map(async (c) => ({
      id: await ensureChannelForCommunity(c.name, c.title, signal),
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
