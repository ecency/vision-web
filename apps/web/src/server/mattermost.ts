import { cookies, headers } from "next/headers";
import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "crypto";
import { NextResponse } from "next/server";
import { bridgeApiCall } from "@ecency/sdk";
import { CommunityRole, ROLES } from "@ecency/sdk";
import { ESIE_USERNAME } from "@/features/chat/official-accounts";
import { toPublicChatUser } from "@/server/chat-public-user";
import { findHiveCommunity } from "@/server/hive-community";
import { ChatUserBusyError, withChatUserLock } from "@/server/chat-user-lock";

export { ChatUserBusyError };

export { toPublicChatUser };

const MATTERMOST_BASE_URL = process.env.MATTERMOST_BASE_URL;
const MATTERMOST_ADMIN_TOKEN = process.env.MATTERMOST_ADMIN_TOKEN;
const MATTERMOST_TEAM_ID = process.env.MATTERMOST_TEAM_ID;
const MATTERMOST_TOKEN_COOKIE = "mm_pat";
export const CHAT_BAN_PROP = "ecency_chat_banned_until";
// Why the ban was applied, written alongside the expiry by the moderation service.
// Lets the clients explain what happened instead of quoting a timestamp. Absent on
// older bans, so every consumer must tolerate undefined.
//
// Known values are "mass-dm", "spray" and "manual", but this stays an open string end to end
// on purpose: a newer moderation service can add a reason this build has never seen, and that
// must degrade to the generic message rather than fail a union check.
export const CHAT_BAN_REASON_PROP = "ecency_chat_ban_reason";

export const CHAT_DM_PRIVACY_PROP = "ecency_dm_privacy";
export const CHAT_LEFT_CHANNELS_PROP = "ecency_left_channels";
// Older builds kept the session token here as plaintext. It is retired on sight.
const CHAT_PAT_PROP = "ecency_pat";
const CHAT_PAT_SEALED_PROP = "ecency_pat_sealed";
const CHAT_PAT_DESCRIPTION = "ecency-auto";

export type DmPrivacyLevel = "all" | "followers" | "none";

export interface MattermostUser {
  id: string;
  username: string;
  email: string;
  delete_at: number; // 0 = active, >0 = deactivated (epoch ms)
  // Space-separated Mattermost role list, e.g. "system_user system_admin".
  // Returned by GET /users/me; optional because lighter responses (e.g.
  // /users/ids batches) may omit it.
  roles?: string;
}

export interface MattermostUserWithProps extends MattermostUser {
  props?: Record<string, string>;
}

export interface MattermostChannel {
  id: string;
  name: string;
  display_name: string;
  type: string;
}

class MattermostError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

/**
 * Raised when provisioning would resurrect an account that is deactivated and
 * still chat-banned. Distinct from MattermostError so bootstrap can answer 403
 * (a moderation decision) instead of routing it through the outage mapping,
 * which would report a 502 and invite the client to retry.
 */
export class ChatBannedError extends Error {
  readonly username: string;
  readonly bannedUntil: number;
  readonly reason?: string;

  constructor(username: string, bannedUntil: number, reason?: string) {
    super(`@${username} is banned from chat until ${new Date(bannedUntil).toISOString()}`);
    this.name = "ChatBannedError";
    this.username = username;
    this.bannedUntil = bannedUntil;
    this.reason = reason;
  }
}

function requireEnv(value: string | undefined, name: string) {
  if (!value) {
    throw new Error(`${name} is not configured`);
  }
  return value;
}

export function getMattermostTeamId() {
  return requireEnv(MATTERMOST_TEAM_ID, "MATTERMOST_TEAM_ID");
}

function getAdminHeaders() {
  return {
    Authorization: `Bearer ${requireEnv(MATTERMOST_ADMIN_TOKEN, "MATTERMOST_ADMIN_TOKEN")}`,
    "Content-Type": "application/json"
  } as const;
}

// Upstream Mattermost calls can hang indefinitely when the MM server is slow
// or down. Unbounded, they pin the Node event loop (and the response buffers,
// RPC clients, and closures they hold) until the container is healthcheck-killed.
// A hard per-call timeout gives every call a bounded lifetime while still
// honouring a caller-supplied AbortSignal (e.g. request-scoped cancellation).
const MM_FETCH_TIMEOUT_MS = Number(process.env.MM_FETCH_TIMEOUT_MS) || 10_000;

// Shared transport for all Mattermost calls: base URL resolution, MM_FETCH_TIMEOUT_MS
// composed with any caller-supplied AbortSignal, fetch, non-OK → MattermostError, and
// TimeoutError → MattermostError(504) mapping. Returns the response body as a string
// (empty body → ""). Parsing is left to callers (mmFetch: JSON; mmFetchNdjson: NDJSON).
async function mmFetchRaw(path: string, init?: RequestInit): Promise<string> {
  const base = requireEnv(MATTERMOST_BASE_URL, "MATTERMOST_BASE_URL");

  const timeoutSignal = AbortSignal.timeout(MM_FETCH_TIMEOUT_MS);
  const signal = init?.signal
    ? AbortSignal.any([init.signal, timeoutSignal])
    : timeoutSignal;

  try {
    const res = await fetch(`${base}${path}`, {
      ...init,
      headers: {
        ...(init?.headers || {}),
        Accept: "application/json"
      },
      signal
    });

    if (!res.ok) {
      const text = await res.text();
      throw new MattermostError(`Mattermost request failed (${res.status}): ${text}`, res.status);
    }

    return await res.text();
  } catch (err) {
    // AbortSignal.timeout aborts with a DOMException whose name is "TimeoutError";
    // this can fire during either the initial fetch or the body read. Either way,
    // surface it as a MattermostError so handleMattermostError maps it to 504
    // Gateway Timeout rather than leaking a generic 500. Caller-originated aborts
    // (AbortError) are left alone so request-scoped cancellation still propagates.
    if (err instanceof Error && err.name === "TimeoutError") {
      throw new MattermostError(
        `Mattermost request timed out after ${MM_FETCH_TIMEOUT_MS}ms (${path})`,
        504
      );
    }
    throw err;
  }
}

async function mmFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const text = await mmFetchRaw(path, init);
  if (!text) {
    return undefined as T;
  }
  return JSON.parse(text) as T;
}

export async function reactivateMattermostUser(userId: string, signal?: AbortSignal): Promise<void> {
  await mmFetch(`/users/${encodeURIComponent(userId)}/active`, {
    method: "PUT",
    headers: getAdminHeaders(),
    body: JSON.stringify({ active: true }),
    signal
  });
}

/**
 * Deactivation alone is not a durable block: this function reactivates on the
 * next login, so a deactivated account comes back as soon as its owner opens
 * chat. The durable control is the chat ban prop, which survives deactivation.
 * Refuse to reactivate while that ban is live, so a moderation action that
 * deactivates and bans stays in effect instead of being undone by the next
 * bootstrap.
 */
function assertReactivationAllowed(user: MattermostUserWithProps) {
  const bannedUntil = isUserChatBanned(user);
  if (bannedUntil) {
    throw new ChatBannedError(user.username, bannedUntil, getUserChatBanReason(user));
  }
}

export async function ensureMattermostUser(
  username: string,
  signal?: AbortSignal
): Promise<MattermostUserWithProps> {
  // Step 1: Try to find existing user (only suppress 404)
  let user: MattermostUserWithProps | null = null;
  try {
    user = await mmFetch<MattermostUserWithProps>(`/users/username/${encodeURIComponent(username)}`, {
      headers: getAdminHeaders(),
      signal
    });
  } catch (error) {
    if (error instanceof MattermostError && error.status === 404) {
      // User not found — will create below
    } else {
      throw error;
    }
  }

  // Step 2: If found, reactivate if needed (errors surface to caller)
  if (user) {
    if (user.delete_at > 0) {
      assertReactivationAllowed(user);
      await reactivateMattermostUser(user.id, signal);
      user.delete_at = 0;
    }
    return user;
  }

  // Step 3: Create new user. A concurrent bootstrap (common with browser-
  // extension integrations that fire parallel/repeat bootstrap calls) can
  // create the same user between the lookup above and this create — Mattermost
  // then returns 400 app.user.save.username_exists.app_error. Treat that as
  // success: re-fetch the now-existing user (reactivating if needed) instead
  // of surfacing a spurious upstream error (which the bootstrap route maps to
  // a 502) to the caller. Makes provisioning idempotent / race-safe.
  const email = `${username}+no-email@ecency.local`;
  try {
    return await mmFetch<MattermostUserWithProps>(`/users`, {
      method: "POST",
      headers: getAdminHeaders(),
      body: JSON.stringify({
        username,
        email,
        password: randomBytes(32).toString("base64url") + "!Aa1",
        allow_marketing: false
      }),
      signal
    });
  } catch (error) {
    if (
      error instanceof MattermostError &&
      error.status === 400 &&
      error.message.includes("app.user.save.username_exists")
    ) {
      const existing = await mmFetch<MattermostUserWithProps>(
        `/users/username/${encodeURIComponent(username)}`,
        { headers: getAdminHeaders(), signal }
      );
      if (existing.delete_at > 0) {
        assertReactivationAllowed(existing);
        await reactivateMattermostUser(existing.id, signal);
        existing.delete_at = 0;
      }
      return existing;
    }
    throw error;
  }
}

export async function ensureUserInTeam(userId: string, signal?: AbortSignal) {
  const teamId = requireEnv(MATTERMOST_TEAM_ID, "MATTERMOST_TEAM_ID");
  try {
    await mmFetch(`/teams/${encodeURIComponent(teamId)}/members/${encodeURIComponent(userId)}`, {
      headers: getAdminHeaders(),
      signal
    });
    return; // already a member
  } catch {
    // not a member (or lookup failed) — add below
  }
  try {
    await mmFetch(`/teams/${encodeURIComponent(teamId)}/members`, {
      method: "POST",
      headers: getAdminHeaders(),
      body: JSON.stringify({ team_id: teamId, user_id: userId }),
      signal
    });
  } catch (error) {
    // A concurrent bootstrap (browser-extension integrations fire parallel
    // calls) may have added the user between the check and this add —
    // Mattermost then errors "team member already exists". Re-check the end
    // state instead of failing: if the user is now a member, the desired
    // state holds. Version-agnostic (no reliance on MM error-id strings).
    try {
      await mmFetch(`/teams/${encodeURIComponent(teamId)}/members/${encodeURIComponent(userId)}`, {
        headers: getAdminHeaders(),
        signal
      });
      return;
    } catch {
      throw error; // genuinely not a member — surface the real failure
    }
  }
}

export async function followMattermostThreadForUser(
  userId: string,
  threadId: string,
  following = true
) {
  const teamId = getMattermostTeamId();

  try {
    await mmFetch(`/users/${encodeURIComponent(userId)}/teams/${encodeURIComponent(teamId)}/threads/${encodeURIComponent(threadId)}/following`, {
      method: "PUT",
      headers: getAdminHeaders(),
      body: JSON.stringify({ following })
    });
  } catch (error) {
    console.error(
      "Unable to update Mattermost thread following",
      { userId, threadId, error }
    );
  }
}

function normalizeCommunityId(community: string) {
  return community.trim().toLowerCase();
}

export async function ensureChannelForCommunity(
  community: string,
  // Unused: a new channel takes the community's title from Hive, never the caller's.
  _displayName?: string,
  signal?: AbortSignal
): Promise<string> {
  const teamId = requireEnv(MATTERMOST_TEAM_ID, "MATTERMOST_TEAM_ID");
  const channelName = normalizeCommunityId(community);
  // Callers join users to what this returns with the admin token, so it only
  // ever names a public community channel: never a private channel found by
  // name, and never a channel created under a name a client made up.
  if (!COMMUNITY_CHANNEL_NAME_PATTERN.test(channelName)) {
    throw new Error(`Not a community channel name: ${channelName}`);
  }
  const asCommunityChannel = (channel: { id: string; type?: string }) => {
    if (channel.type !== "O") {
      throw new Error(`Channel ${channelName} is not a public channel`);
    }
    return channel.id;
  };
  let existing: { id: string; type?: string } | null = null;
  try {
    existing = await mmFetch<{ id: string; type?: string }>(`/teams/${encodeURIComponent(teamId)}/channels/name/${encodeURIComponent(channelName)}`, {
      headers: getAdminHeaders(),
      signal
    });
  } catch {
    // channel doesn't exist (or lookup failed) — create below
  }
  if (existing) {
    return asCommunityChannel(existing);
  }
  // Only a community that exists on Hive gets a channel, named as Hive names it,
  // so a client cannot create channels under made-up names.
  const hiveCommunity = await findHiveCommunity(channelName, signal);
  if (!hiveCommunity) {
    throw new Error(`Community ${channelName} was not found on Hive`);
  }
  const title = hiveCommunity.title?.trim() || channelName;
  try {
    const created = await mmFetch<{ id: string }>(`/channels`, {
      method: "POST",
      headers: getAdminHeaders(),
      body: JSON.stringify({
        team_id: teamId,
        name: channelName,
        // Mattermost caps a display name at 64 characters.
        display_name: Array.from(title).slice(0, 64).join(""),
        type: "O"
      }),
      signal
    });
    return created.id;
  } catch (error) {
    // A concurrent bootstrap (e.g. several subscribers of a new community
    // bootstrapping at once) may have created the channel between the lookup
    // and this create. Re-fetch by name; if it now exists, use it.
    let raced: { id: string; type?: string };
    try {
      raced = await mmFetch<{ id: string; type?: string }>(`/teams/${encodeURIComponent(teamId)}/channels/name/${encodeURIComponent(channelName)}`, {
        headers: getAdminHeaders(),
        signal
      });
    } catch {
      throw error;
    }
    return asCommunityChannel(raced);
  }
}

export async function ensureCommunityChannelMembership(
  userId: string,
  community: string,
  displayName?: string,
  autoJoin: boolean = false,
  signal?: AbortSignal
) {
  const channelId = await ensureChannelForCommunity(community, displayName, signal);
  if (autoJoin) {
    await ensureUserInChannel(userId, channelId, signal);
  }
  return channelId;
}

/**
 * Whether the user is a member of the channel. A 404 means not a member;
 * any other failure is rethrown so a caller never mistakes an outage for an
 * answer.
 */
export async function isUserInChannel(userId: string, channelId: string): Promise<boolean> {
  try {
    await mmFetch(
      `/channels/${encodeURIComponent(channelId)}/members/${encodeURIComponent(userId)}`,
      { headers: getAdminHeaders() }
    );
    return true;
  } catch (error) {
    if (error instanceof MattermostError && error.status === 404) {
      return false;
    }
    throw error;
  }
}

export async function ensureUserInChannel(userId: string, channelId: string, signal?: AbortSignal) {
  try {
    // Check if user is currently a member
    await mmFetch(`/channels/${encodeURIComponent(channelId)}/members/${encodeURIComponent(userId)}`, {
      headers: getAdminHeaders(),
      signal
    });
    return; // already a member, nothing to do
  } catch {
    // not a member (or lookup failed) — add below
  }
  try {
    await mmFetch(`/channels/${encodeURIComponent(channelId)}/members`, {
      method: "POST",
      headers: getAdminHeaders(),
      body: JSON.stringify({ channel_id: channelId, user_id: userId }),
      signal
    });
  } catch (error) {
    // A concurrent bootstrap may have added the user between the check and
    // this add. Re-check the end state: if the user is now a member, the
    // desired state holds (version-agnostic — no MM error-id matching).
    try {
      await mmFetch(`/channels/${encodeURIComponent(channelId)}/members/${encodeURIComponent(userId)}`, {
        headers: getAdminHeaders(),
        signal
      });
      return;
    } catch {
      throw error;
    }
  }
}

export async function removeUserFromChannel(userId: string, channelId: string) {
  await mmFetch(`/channels/${encodeURIComponent(channelId)}/members/${encodeURIComponent(userId)}`, {
    method: "DELETE",
    headers: getAdminHeaders()
  });
}

// Private channels are created and managed by the chat super-admin only. The
// admin token does the membership work, so management keeps working even if
// the super-admin leaves a channel they set up.
export interface MattermostTeamChannel extends MattermostChannel {
  team_id: string;
  delete_at: number;
}

/**
 * A live private channel of the chat team, or null when the id names a
 * channel of any other kind, another team's, an archived one or none at all.
 * Callers act with the admin token only on what this returns.
 */
export async function getPrivateTeamChannelAsAdmin(
  channelId: string
): Promise<MattermostTeamChannel | null> {
  if (!MATTERMOST_ID_RE.test(channelId)) return null;
  let channel: MattermostTeamChannel;
  try {
    channel = await mmFetch<MattermostTeamChannel>(`/channels/${encodeURIComponent(channelId)}`, {
      headers: getAdminHeaders()
    });
  } catch (error) {
    if (isMattermostNotFoundError(error)) return null;
    throw error;
  }
  const isPrivateTeamChannel =
    channel.type === "P" && channel.team_id === getMattermostTeamId() && !channel.delete_at;
  return isPrivateTeamChannel ? channel : null;
}

/** Creates a private channel in the chat team as the caller, who becomes its first member. */
export async function createPrivateTeamChannel(token: string, displayName: string) {
  return await mmUserFetch<MattermostTeamChannel>(`/channels`, token, {
    method: "POST",
    body: JSON.stringify({
      team_id: getMattermostTeamId(),
      // Stable, unique and clear of the community pattern; people see display_name.
      name: `private-${randomBytes(8).toString("hex")}`,
      display_name: displayName,
      type: "P"
    })
  });
}

export async function renameChannelAsAdmin(channelId: string, displayName: string) {
  await mmFetch(`/channels/${encodeURIComponent(channelId)}/patch`, {
    method: "PUT",
    headers: getAdminHeaders(),
    body: JSON.stringify({ display_name: displayName })
  });
}

const CHANNEL_MEMBERS_PAGE = 200;

/** Every member of a channel as id and username, sorted by username. */
export async function listChannelMembersAsAdmin(
  channelId: string
): Promise<Pick<MattermostUser, "id" | "username">[]> {
  const ids: string[] = [];
  for (let page = 0; ; page++) {
    const members = await mmFetch<{ user_id: string }[]>(
      `/channels/${encodeURIComponent(channelId)}/members?page=${page}&per_page=${CHANNEL_MEMBERS_PAGE}`,
      { headers: getAdminHeaders() }
    );
    ids.push(...(members ?? []).map((member) => member.user_id));
    if (!members || members.length < CHANNEL_MEMBERS_PAGE) break;
  }

  const users: Pick<MattermostUser, "id" | "username">[] = [];
  for (let i = 0; i < ids.length; i += CHANNEL_MEMBERS_PAGE) {
    const batch = await mmFetch<MattermostUser[]>(`/users/ids`, {
      method: "POST",
      headers: getAdminHeaders(),
      body: JSON.stringify(ids.slice(i, i + CHANNEL_MEMBERS_PAGE))
    });
    users.push(...(batch ?? []).map(({ id, username }) => ({ id, username })));
  }
  return users.sort((a, b) => a.username.localeCompare(b.username));
}

interface MattermostChannelBasic {
  id: string;
  name: string;
  type: string;
}

// Group ownership. Mattermost records no creator for a group conversation, so
// the owner is kept as one preference row on the admin account: category
// GROUP_OWNER_CATEGORY, name = the group's channel id, value = the owner's user
// id. Users cannot write the admin's preferences, every region reads the same
// row, and a group has at most one owner. The row is written only when the
// group is created, so a found owner is cached for long; a missing one briefly.
const GROUP_OWNER_CATEGORY = "ecency_group_owner";
const GROUP_OWNER_FOUND_TTL_MS = 60 * 60_000;
const GROUP_OWNER_MISSING_TTL_MS = 60_000;
const GROUP_OWNER_CACHE_MAX = 5_000;
const MATTERMOST_ID_RE = /^[a-z0-9]{26}$/;
const groupOwnerCache = new Map<string, { ownerId: string | null; expiresAt: number }>();
let adminUserIdPromise: Promise<string> | null = null;

function getAdminUserId(): Promise<string> {
  adminUserIdPromise ??= mmFetch<{ id: string }>(`/users/me`, { headers: getAdminHeaders() })
    .then((user) => user.id)
    .catch((error) => {
      adminUserIdPromise = null;
      throw error;
    });
  return adminUserIdPromise;
}

function rememberGroupOwner(channelId: string, ownerId: string | null) {
  if (groupOwnerCache.size >= GROUP_OWNER_CACHE_MAX) {
    const oldest = groupOwnerCache.keys().next().value;
    if (oldest !== undefined) groupOwnerCache.delete(oldest);
  }
  groupOwnerCache.set(channelId, {
    ownerId,
    expiresAt: Date.now() + (ownerId ? GROUP_OWNER_FOUND_TTL_MS : GROUP_OWNER_MISSING_TTL_MS)
  });
}

/** The user id of the group's owner, or null when it has none yet. */
export async function getGroupOwnerId(
  channelId: string,
  options: { fresh?: boolean } = {}
): Promise<string | null> {
  if (!MATTERMOST_ID_RE.test(channelId)) return null;
  const cached = groupOwnerCache.get(channelId);
  if (!options.fresh && cached && cached.expiresAt > Date.now()) return cached.ownerId;

  const adminId = await getAdminUserId();
  let ownerId: string | null = null;
  try {
    const pref = await mmFetch<{ value?: string }>(
      `/users/${encodeURIComponent(adminId)}/preferences/${GROUP_OWNER_CATEGORY}/name/${channelId}`,
      { headers: getAdminHeaders() }
    );
    ownerId = typeof pref?.value === "string" && MATTERMOST_ID_RE.test(pref.value) ? pref.value : null;
  } catch (error) {
    // A missing preference is a 400 in Mattermost 10 (a 404 in some versions).
    // The request itself is well formed, so either means "no owner".
    if (!(error instanceof MattermostError) || (error.status !== 400 && error.status !== 404)) {
      throw error;
    }
  }
  rememberGroupOwner(channelId, ownerId);
  return ownerId;
}

/**
 * Records the group's owner. Only the request that creates the group calls
 * it. Two members creating the same group at the same instant both write and
 * the last write stands, so the cache is cleared rather than set and the next
 * read finds whichever record stood.
 */
export async function setGroupOwnerId(channelId: string, userId: string): Promise<void> {
  if (!MATTERMOST_ID_RE.test(channelId) || !MATTERMOST_ID_RE.test(userId)) {
    throw new Error("Invalid group owner record");
  }
  const adminId = await getAdminUserId();
  await mmFetch(`/users/${encodeURIComponent(adminId)}/preferences`, {
    method: "PUT",
    headers: getAdminHeaders(),
    body: JSON.stringify([
      { user_id: adminId, category: GROUP_OWNER_CATEGORY, name: channelId, value: userId }
    ])
  });
  groupOwnerCache.delete(channelId);
}

export async function getUserChannels(userId: string): Promise<MattermostChannelBasic[]> {
  const teamId = getMattermostTeamId();
  const PAGE_SIZE = 200;
  const MAX_PAGES = 3;
  const results: MattermostChannelBasic[] = [];

  for (let page = 0; page < MAX_PAGES; page++) {
    const pageItems = await mmFetch<MattermostChannelBasic[]>(
      `/users/${encodeURIComponent(userId)}/teams/${encodeURIComponent(teamId)}/channels?page=${page}&per_page=${PAGE_SIZE}`,
      { headers: getAdminHeaders() }
    );
    results.push(...pageItems);
    if (pageItems.length < PAGE_SIZE) break;
  }

  return results;
}

/**
 * Only "no such user" resolves to null: a 404, or the 400 Mattermost answers
 * for a name that cannot exist (e.g. uppercase).
 * Timeouts and other upstream failures throw, so a caller that tells users
 * someone "is not on chat" does not say so during an outage.
 */
export async function lookupMattermostUser(username: string): Promise<MattermostUser | null> {
  try {
    return await mmFetch<MattermostUser>(`/users/username/${encodeURIComponent(username)}`, {
      headers: getAdminHeaders()
    });
  } catch (error) {
    if (error instanceof MattermostError && (error.status === 404 || error.status === 400)) {
      return null;
    }
    throw error;
  }
}

// Chat user ids are permanent, so Esie's id is kept for the life of the process once found. A chat
// server without Esie is asked again after a while; concurrent first posts share one lookup.
let esieUserId: string | undefined;
let esieMissingAt = 0;
let esieLookup: Promise<void> | null = null;
const DM_FANOUT_EXEMPT_RECHECK_MS = 10 * 60_000;

/**
 * Chat user ids that never count toward the sender's DM fan-out limit: Esie, the AI helper,
 * which anyone may ask at any time. A failed lookup is retried on the next call, and until it
 * succeeds Esie simply counts like anyone else.
 */
export async function getDmFanoutExemptUserIds(): Promise<Set<string>> {
  if (!esieUserId && Date.now() - esieMissingAt >= DM_FANOUT_EXEMPT_RECHECK_MS) {
    esieLookup ??= lookupMattermostUser(ESIE_USERNAME)
      .then((user) => {
        if (user?.id) esieUserId = user.id;
        else esieMissingAt = Date.now();
      })
      .catch(() => {
        // counted normally this time
      })
      .finally(() => {
        esieLookup = null;
      });
    await esieLookup;
  }
  return new Set(esieUserId ? [esieUserId] : []);
}

export async function getMattermostUserWithProps(userId: string, signal?: AbortSignal): Promise<MattermostUserWithProps> {
  return await mmFetch<MattermostUserWithProps>(`/users/${encodeURIComponent(userId)}`, {
    headers: getAdminHeaders(),
    signal
  });
}

/**
 * The stored session token is sealed with AES-256-GCM under a key derived from
 * server-side configuration, so only this server can read it back. If that
 * configuration changes, opening fails and a fresh token is issued.
 */
function sessionTokenKey(): Buffer {
  const secret = requireEnv(MATTERMOST_ADMIN_TOKEN, "MATTERMOST_ADMIN_TOKEN");
  return Buffer.from(hkdfSync("sha256", secret, "ecency-chat", "session-token-v1", 32));
}

// The owner's id is authenticated data: a sealed value opens only for the user
// it was sealed for, so copying it into another account's props yields nothing.
export function sealSessionToken(token: string, userId: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", sessionTokenKey(), iv);
  cipher.setAAD(Buffer.from(userId, "utf8"));
  const body = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  return `v1.${Buffer.concat([iv, cipher.getAuthTag(), body]).toString("base64url")}`;
}

export function openSessionToken(sealed: string | undefined, userId: string): string | null {
  if (!sealed?.startsWith("v1.")) return null;
  try {
    const raw = Buffer.from(sealed.slice(3), "base64url");
    if (raw.length <= 28) return null;
    const decipher = createDecipheriv("aes-256-gcm", sessionTokenKey(), raw.subarray(0, 12));
    decipher.setAAD(Buffer.from(userId, "utf8"));
    decipher.setAuthTag(raw.subarray(12, 28));
    return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}

/** Revokes every session token this server has issued for the user. */
async function revokeIssuedTokens(userId: string, signal?: AbortSignal): Promise<number> {
  const perPage = 200;
  const issued: string[] = [];
  for (let page = 0; ; page++) {
    const tokens = await mmFetch<Array<{ id: string; description?: string; is_active?: boolean }>>(
      `/users/${encodeURIComponent(userId)}/tokens?page=${page}&per_page=${perPage}`,
      { headers: getAdminHeaders(), signal }
    );
    for (const token of tokens) {
      if (token.description === CHAT_PAT_DESCRIPTION && token.is_active !== false) {
        issued.push(token.id);
      }
    }
    if (tokens.length < perPage) break;
  }
  for (const tokenId of issued) {
    try {
      await mmFetch(`/users/tokens/revoke`, {
        method: "POST",
        headers: getAdminHeaders(),
        body: JSON.stringify({ token_id: tokenId }),
        signal
      });
    } catch (error) {
      // Already revoked by a concurrent request: the goal is met.
      if (!(error instanceof MattermostError && (error.status === 400 || error.status === 404))) {
        throw error;
      }
    }
  }
  return issued.length;
}

/**
 * Writes a user's whole props map (Mattermost replaces props on patch, so
 * callers pass what they read plus their change). The old token prop is left
 * as found: only retirement removes it, and only after revoking, so it keeps
 * marking a user whose old token is still to be revoked.
 */
async function writeUserProps(
  userId: string,
  props: Record<string, string>,
  signal?: AbortSignal
) {
  await mmFetch(`/users/${encodeURIComponent(userId)}/patch`, {
    method: "PUT",
    headers: getAdminHeaders(),
    body: JSON.stringify({ props }),
    signal
  });
}

export function hasPlaintextSessionToken(user: Pick<MattermostUserWithProps, "props">) {
  return Boolean(user.props?.[CHAT_PAT_PROP]);
}

/** One page of all chat users, including props (admin view). */
export async function listMattermostUsersWithPropsAsAdmin(page: number, perPage: number) {
  return await mmFetch<MattermostUserWithProps[]>(
    `/users?page=${encodeURIComponent(page)}&per_page=${encodeURIComponent(perPage)}`,
    { headers: getAdminHeaders() }
  );
}

async function retirePlaintextSessionTokenUnlocked(
  userId: string,
  signal?: AbortSignal
): Promise<boolean> {
  const user = await getMattermostUserWithProps(userId, signal);
  if (!hasPlaintextSessionToken(user)) return false;

  await revokeIssuedTokens(userId, signal);

  // Re-read right before writing so a concurrent props update is not lost.
  // A sealed token stored meanwhile is kept: if it was issued before the
  // revocation above it fails validation and is replaced on next bootstrap.
  const fresh = await getMattermostUserWithProps(userId, signal);
  const props = { ...(fresh.props || {}) };
  delete props[CHAT_PAT_PROP];
  await writeUserProps(userId, props, signal);
  return true;
}

/**
 * Replaces a plaintext token left by an older build: revokes the user's issued
 * tokens, then drops the plaintext prop. Returns false when there was none.
 */
export async function retirePlaintextSessionToken(
  userId: string,
  signal?: AbortSignal
): Promise<boolean> {
  return withChatUserLock(userId, (held) => retirePlaintextSessionTokenUnlocked(userId, held), {
    signal
  });
}

/**
 * Resolve the user a PAT belongs to with a lightweight /users/me call.
 * Returns null when the token is no longer valid. Only treats 401/403 as
 * "invalid token". Rethrows other errors (5xx, network) so they surface as
 * 502 upstream.
 */
async function getTokenOwnerId(token: string, signal?: AbortSignal): Promise<string | null> {
  try {
    const me = await mmFetch<{ id: string }>(`/users/me`, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      signal
    });
    return me.id;
  } catch (err) {
    if (err instanceof MattermostError && (err.status === 401 || err.status === 403)) {
      return null;
    }
    throw err;
  }
}

async function createToken(userId: string, signal?: AbortSignal): Promise<string> {
  const result = await mmFetch<{ token: string }>(`/users/${encodeURIComponent(userId)}/tokens`, {
    method: "POST",
    headers: getAdminHeaders(),
    body: JSON.stringify({ description: CHAT_PAT_DESCRIPTION }),
    signal
  });
  // Mattermost only reveals the secret at creation time, so keep it (sealed)
  // in user props to reuse across sessions and devices. Merge with existing
  // props to avoid clobbering other fields (left_channels, DM privacy, bans).
  const user = await getMattermostUserWithProps(userId, signal);
  await writeUserProps(
    userId,
    { ...(user.props || {}), [CHAT_PAT_SEALED_PROP]: sealSessionToken(result.token, userId) },
    signal
  );
  return result.token;
}

export async function ensurePersonalToken(
  userId: string,
  signal?: AbortSignal
): Promise<{ token: string; user: MattermostUserWithProps }> {
  // Try to retrieve a previously stored PAT from user props.
  // Only fall through to createToken on auth errors (401/403).
  // Rethrow other errors (5xx, network) so they surface upstream.
  //
  // Returns the user alongside the token because the bootstrap caller also
  // needs the user's props (for getUserLeftChannels). Folding it in here
  // saves one extra GET /users/{id} on the hot path that used to run
  // sequentially after this call.
  const user = await getMattermostUserWithProps(userId, signal);

  // Hot path, no lock: a stored token that opens for this user and resolves
  // to this user. getTokenOwnerId rethrows non-auth errors.
  if (!hasPlaintextSessionToken(user)) {
    const stored = openSessionToken(user.props?.[CHAT_PAT_SEALED_PROP], userId);
    if (stored && (await getTokenOwnerId(stored, signal)) === userId) {
      return { token: stored, user };
    }
  }

  // Anything that revokes or issues runs under the per-user lock, on a fresh
  // read, so a token another request just stored is reused, not revoked.
  // The user.props returned predates createToken's PUT, but the only consumer
  // (left-channels) doesn't care.
  // `signal` inside is the lock's: it also aborts if the lock is lost.
  return withChatUserLock(userId, async (signal) => {
    const fresh = await getMattermostUserWithProps(userId, signal);

    if (hasPlaintextSessionToken(fresh)) {
      await retirePlaintextSessionTokenUnlocked(userId, signal);
    } else {
      const sealed = fresh.props?.[CHAT_PAT_SEALED_PROP];
      const stored = openSessionToken(sealed, userId);
      if (stored) {
        const ownerId = await getTokenOwnerId(stored, signal);
        if (ownerId === userId) {
          return { token: stored, user };
        }
        if (ownerId) {
          // A working token that belongs to someone else: never hand it out,
          // and revoke it since it has evidently been copied.
          await revokeIssuedTokens(ownerId, signal);
        }
      }
      // No usable stored token, so nothing issued earlier is in use: revoke
      // it (an unopenable value, or a token created by an attempt that was
      // cut off before sealing it) rather than leave it valid beside the new one.
      await revokeIssuedTokens(userId, signal);
    }

    const token = await createToken(userId, signal);
    return { token, user };
  }, { signal });
}

export function withMattermostTokenCookie(response: NextResponse, token: string) {
  response.cookies.set({
    name: MATTERMOST_TOKEN_COOKIE,
    value: token,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30
  });
  return response;
}

export async function getMattermostTokenFromCookies(): Promise<string | null> {
  // 1) Check X-MM-Token header first (mobile clients send token explicitly
  //    to avoid race conditions with async cookie jar on React Native)
  const headerStore = await headers();
  const headerToken = headerStore.get("x-mm-token");
  if (headerToken) {
    return headerToken;
  }

  // 2) Fall back to httpOnly cookie (web clients)
  const cookieStore = await cookies();
  return cookieStore.get(MATTERMOST_TOKEN_COOKIE)?.value || null;
}

export async function mmUserFetch<T>(path: string, token: string, init?: RequestInit) {
  return await mmFetch<T>(path, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init?.headers || {})
    }
  });
}

// NDJSON variant: Mattermost's streaming endpoints (e.g. channel_members?page=-1)
// return one JSON object per line instead of a JSON array.
async function mmFetchNdjson<T>(path: string, init?: RequestInit): Promise<T[]> {
  const text = await mmFetchRaw(path, init);
  if (!text) {
    return [];
  }

  const results: T[] = [];
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      results.push(JSON.parse(trimmed) as T);
    } catch {
      // Tolerate a malformed final line (partial chunk at EOS).
    }
  }
  return results;
}

export async function mmUserFetchNdjson<T>(path: string, token: string, init?: RequestInit) {
  return await mmFetchNdjson<T>(path, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init?.headers || {})
    }
  });
}

export function isMattermostUnauthorizedError(error: unknown) {
  return error instanceof MattermostError && (error.status === 401 || error.status === 403);
}

export function isMattermostNotFoundError(error: unknown) {
  return error instanceof MattermostError && error.status === 404;
}

// Env-pinned super-admin username (default "ecency"), shared by every admin
// route so the gate lives in one place instead of a hardcoded literal copied
// across handlers.
const MATTERMOST_SUPER_ADMIN = process.env.MATTERMOST_SUPER_ADMIN ?? "ecency";

// Opt-in: ALSO require the real Mattermost `system_admin` role on the caller's
// own account. OFF by default because the destructive admin operations run with
// the separate global MATTERMOST_ADMIN_TOKEN (see mmFetch), so the caller's
// personal account does not need the role for them to work — enabling this when
// the @ecency account lacks system_admin would lock out chat moderation. Set
// MATTERMOST_REQUIRE_SYSTEM_ADMIN=true once the super-admin account is confirmed
// to hold the role to add this extra barrier.
const MATTERMOST_REQUIRE_SYSTEM_ADMIN =
  process.env.MATTERMOST_REQUIRE_SYSTEM_ADMIN === "true";

function hasSystemAdminRole(user: Pick<MattermostUser, "roles">): boolean {
  // MM roles is a space-separated list (e.g. "system_user system_admin"). Split
  // on whitespace and match the exact token rather than a substring, so a custom
  // role such as "system_admin_lite" or "non_system_admin" can't satisfy it.
  return (user.roles?.split(/\s+/) ?? []).includes("system_admin");
}

/** Whether this Mattermost user, read with their own token, is the chat super-admin. */
export function isMattermostSuperAdmin(user: Pick<MattermostUser, "username" | "roles">): boolean {
  return (
    user.username === MATTERMOST_SUPER_ADMIN &&
    (!MATTERMOST_REQUIRE_SYSTEM_ADMIN || hasSystemAdminRole(user))
  );
}

/**
 * Verifies the caller is the Mattermost super-admin, using the CALLER'S OWN
 * personal access token (never the shared admin token). Requires the env-pinned
 * super-admin username, plus the real `system_admin` role when
 * MATTERMOST_REQUIRE_SYSTEM_ADMIN is enabled.
 *
 * The super-admin username cannot be spoofed: bootstrap binds a Mattermost
 * username to a HiveSigner-verified Hive identity, so only the real @ecency can
 * mint an "ecency" PAT.
 *
 * On success returns { user }. On failure returns { response } the route must
 * return as-is: 401 when /users/me rejects the token, otherwise 404 (not 403,
 * so destructive endpoints don't confirm they exist to non-admins).
 */
export async function requireMattermostSuperAdmin(
  token: string
): Promise<
  | { user: MattermostUser; response?: undefined }
  | { user?: undefined; response: NextResponse<{ error: string }> }
> {
  let currentUser: MattermostUser;
  try {
    currentUser = await mmUserFetch<MattermostUser>("/users/me", token);
  } catch (error) {
    if (isMattermostUnauthorizedError(error)) {
      return { response: NextResponse.json({ error: "unauthorized" }, { status: 401 }) };
    }
    throw error;
  }

  if (!isMattermostSuperAdmin(currentUser)) {
    return { response: NextResponse.json({ error: "not found" }, { status: 404 }) };
  }

  return { user: currentUser };
}

export function handleMattermostError(error: unknown) {
  if (isMattermostUnauthorizedError(error)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  if (error instanceof ChatUserBusyError) {
    return NextResponse.json(
      { error: error.message },
      { status: error.status, headers: { "Retry-After": "2" } }
    );
  }

  const message = error instanceof Error ? error.message : "unknown error";

  if (error instanceof MattermostError) {
    return NextResponse.json({ error: message }, { status: error.status });
  }

  return NextResponse.json({ error: message }, { status: 500 });
}

/**
 * Classify an error thrown while provisioning a Mattermost user/team/token
 * (the bootstrap step-3 path) into the HTTP status the bootstrap route should
 * return. The bootstrap contract is: 502 = genuine, non-retryable chat outage;
 * 503/504 = transient, the client should retry rather than treat the session
 * as dead and force the user to re-login.
 *
 *   - per-call timeout (MattermostError 504)            → 504
 *   - upstream overload / rate-limit (429 or MM 5xx)    → 503
 *   - everything else (bad admin token, misconfig,      → 502
 *     connection refused, unexpected logic error)
 *
 * Auth errors (401/403) are deliberately NOT surfaced as 401 here: a failing
 * admin token is a server-side outage, not the end user's token being invalid,
 * so mapping it to 401 would wrongly force the user to re-authenticate.
 */
export function getMattermostOutageStatus(error: unknown): 502 | 503 | 504 {
  if (error instanceof ChatUserBusyError) return 503;
  if (error instanceof MattermostError) {
    if (error.status === 504) return 504;
    if (error.status === 429 || error.status >= 500) return 503;
  }
  return 502;
}

export const COMMUNITY_CHANNEL_NAME_PATTERN = /^hive-[a-z0-9-]+$/;

function isCommunityModerator(role: CommunityRole | undefined) {
  return role === ROLES.OWNER || role === ROLES.ADMIN || role === ROLES.MOD;
}

export async function getMattermostCommunityModerationContext(token: string, channelId: string) {
  const [channel, currentUser] = await Promise.all([
    mmUserFetch<MattermostChannel>(`/channels/${encodeURIComponent(channelId)}`, token),
    mmUserFetch<MattermostUser>(`/users/me`, token)
  ]);

  const isCommunityChannel =
    channel.type === "O" && normalizeCommunityId(channel.name) === channel.name &&
    COMMUNITY_CHANNEL_NAME_PATTERN.test(channel.name);

  if (!isCommunityChannel) {
    return {
      channel,
      currentUser,
      community: null,
      canModerate: false as const
    };
  }

  try {
    const context = await bridgeApiCall<{ role?: CommunityRole }>("get_community_context", {
      account: currentUser.username,
      name: channel.name
    });

    return {
      channel,
      currentUser,
      community: channel.name,
      canModerate: isCommunityModerator(context?.role)
    };
  } catch (error) {
    console.error("Unable to load community context for chat moderation", error);
    return {
      channel,
      currentUser,
      community: channel.name,
      canModerate: false as const
    };
  }
}

export async function deleteMattermostPostAsAdmin(postId: string) {
  await mmFetch(`/posts/${encodeURIComponent(postId)}`, {
    method: "DELETE",
    headers: getAdminHeaders()
  });
}

export function getUserChatBanReason(
  user: Pick<MattermostUserWithProps, "props">
): string | undefined {
  return user.props?.[CHAT_BAN_REASON_PROP] || undefined;
}

export function isUserChatBanned(user: Pick<MattermostUserWithProps, "props">) {
  const bannedUntil = user.props?.[CHAT_BAN_PROP];
  const expiration = Number(bannedUntil);

  if (!bannedUntil || Number.isNaN(expiration)) {
    return null;
  }

  if (expiration <= Date.now()) {
    return null;
  }

  return expiration;
}

export function getUserDmPrivacy(user: Pick<MattermostUserWithProps, "props">): DmPrivacyLevel {
  const dmPrivacy = user.props?.[CHAT_DM_PRIVACY_PROP];
  if (dmPrivacy === "followers" || dmPrivacy === "none") {
    return dmPrivacy;
  }
  return "all"; // default: allow all DMs
}

export function toPublicChatUserMap<T extends object>(users: Record<string, T>) {
  return Object.fromEntries(
    Object.entries(users).map(([id, user]) => [id, toPublicChatUser(user)])
  );
}

/**
 * The people other than the sender that a post into a direct or group channel
 * reaches, as user ids. A direct channel is named `<id>__<id>`, so its other
 * member needs no lookup. A group (3 to 8 members) lists its members.
 *
 * A group whose members cannot be read throws rather than being counted as a
 * single recipient, so an upstream hiccup cannot turn seven slots into one.
 */
export async function getPrivateChannelRecipientIds(
  channel: Pick<MattermostChannel, "id" | "name" | "type">,
  senderId: string,
  token: string
): Promise<string[]> {
  if (channel.type === "D") {
    const ids = channel.name.split("__");
    if (ids.length === 2 && ids.every(Boolean)) {
      return ids.filter((id) => id !== senderId);
    }
    return [channel.id];
  }

  const members = await mmUserFetch<{ user_id: string }[]>(
    `/channels/${encodeURIComponent(channel.id)}/members?page=0&per_page=50`,
    token
  );
  const ids = members.map((member) => member.user_id).filter((id) => id && id !== senderId);
  return Array.from(new Set(ids));
}

export function getUserLeftChannels(user: Pick<MattermostUserWithProps, "props">): Set<string> {
  const raw = user.props?.[CHAT_LEFT_CHANNELS_PROP];
  if (!raw) return new Set();
  try {
    const parsed = JSON.parse(raw);
    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch {
    return new Set();
  }
}

// Props writers take the per-user token lock so their read-then-replace cannot
// interleave with a token being stored or retired.

export async function addUserLeftChannel(userId: string, channelName: string) {
  await withChatUserLock(userId, async (signal) => {
    const user = await getMattermostUserWithProps(userId, signal);
    const leftChannels = getUserLeftChannels(user);
    leftChannels.add(channelName);
    const props = { ...(user.props || {}), [CHAT_LEFT_CHANNELS_PROP]: JSON.stringify(Array.from(leftChannels)) };
    await writeUserProps(userId, props, signal);
  });
}

export async function removeUserLeftChannel(userId: string, channelName: string, signal?: AbortSignal) {
  await withChatUserLock(userId, async (signal) => {
    const user = await getMattermostUserWithProps(userId, signal);
    const leftChannels = getUserLeftChannels(user);
    if (!leftChannels.delete(channelName)) return;
    const props = { ...(user.props || {}), [CHAT_LEFT_CHANNELS_PROP]: JSON.stringify(Array.from(leftChannels)) };
    await writeUserProps(userId, props, signal);
  }, { signal });
}

export async function setUserDmPrivacy(userId: string, privacy: DmPrivacyLevel) {
  await withChatUserLock(userId, async (signal) => {
    const user = await getMattermostUserWithProps(userId, signal);
    const props = { ...(user.props || {}) };

    if (privacy === "all") {
      delete props[CHAT_DM_PRIVACY_PROP];
    } else {
      props[CHAT_DM_PRIVACY_PROP] = privacy;
    }

    await writeUserProps(userId, props, signal);
  });

  return privacy;
}
