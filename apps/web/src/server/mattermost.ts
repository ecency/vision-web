import { cookies, headers } from "next/headers";
import { randomBytes } from "crypto";
import { NextResponse } from "next/server";
import { bridgeApiCall, getProfiles } from "@ecency/sdk";
import { CommunityRole, ROLES } from "@ecency/sdk";

const MATTERMOST_BASE_URL = process.env.MATTERMOST_BASE_URL;
const MATTERMOST_ADMIN_TOKEN = process.env.MATTERMOST_ADMIN_TOKEN;
const MATTERMOST_TEAM_ID = process.env.MATTERMOST_TEAM_ID;
const MATTERMOST_TOKEN_COOKIE = "mm_pat";
export const CHAT_BAN_PROP = "ecency_chat_banned_until";
export const CHAT_DM_PRIVACY_PROP = "ecency_dm_privacy";
export const CHAT_LEFT_CHANNELS_PROP = "ecency_left_channels";
const CHAT_PAT_PROP = "ecency_pat";

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

interface MmChannelPost {
  id: string;
  user_id: string;
  channel_id: string;
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

  constructor(username: string, bannedUntil: number) {
    super(`@${username} is banned from chat until ${new Date(bannedUntil).toISOString()}`);
    this.name = "ChatBannedError";
    this.username = username;
    this.bannedUntil = bannedUntil;
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
    throw new ChatBannedError(user.username, bannedUntil);
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
  displayName?: string,
  signal?: AbortSignal
): Promise<string> {
  const teamId = requireEnv(MATTERMOST_TEAM_ID, "MATTERMOST_TEAM_ID");
  const channelName = normalizeCommunityId(community);
  try {
    const existing = await mmFetch<{ id: string }>(`/teams/${encodeURIComponent(teamId)}/channels/name/${encodeURIComponent(channelName)}`, {
      headers: getAdminHeaders(),
      signal
    });
    return existing.id;
  } catch {
    // channel doesn't exist (or lookup failed) — create below
  }
  try {
    const created = await mmFetch<{ id: string }>(`/channels`, {
      method: "POST",
      headers: getAdminHeaders(),
      body: JSON.stringify({
        team_id: teamId,
        name: channelName,
        display_name: displayName || community,
        type: "O"
      }),
      signal
    });
    return created.id;
  } catch (error) {
    // A concurrent bootstrap (e.g. several subscribers of a new community
    // bootstrapping at once) may have created the channel between the lookup
    // and this create. Re-fetch by name; if it now exists, use it.
    try {
      const existing = await mmFetch<{ id: string }>(`/teams/${encodeURIComponent(teamId)}/channels/name/${encodeURIComponent(channelName)}`, {
        headers: getAdminHeaders(),
        signal
      });
      return existing.id;
    } catch {
      throw error;
    }
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

interface MattermostChannelBasic {
  id: string;
  name: string;
  type: string;
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

export async function findMattermostUser(username: string): Promise<MattermostUser | null> {
  try {
    return await mmFetch<MattermostUser>(`/users/username/${encodeURIComponent(username)}`, {
      headers: getAdminHeaders()
    });
  } catch (error) {
    return null;
  }
}

export async function getMattermostUserWithProps(userId: string, signal?: AbortSignal): Promise<MattermostUserWithProps> {
  return await mmFetch<MattermostUserWithProps>(`/users/${encodeURIComponent(userId)}`, {
    headers: getAdminHeaders(),
    signal
  });
}

/**
 * Validate a PAT by making a lightweight /users/me call.
 * Returns true if the token is still active and valid.
 * Only treats 401/403 as "invalid token". Rethrows other
 * errors (5xx, network) so they surface as 502 upstream.
 */
async function isTokenValid(token: string, signal?: AbortSignal): Promise<boolean> {
  try {
    await mmFetch<{ id: string }>(`/users/me`, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      signal
    });
    return true;
  } catch (err) {
    if (err instanceof MattermostError && (err.status === 401 || err.status === 403)) {
      return false;
    }
    throw err;
  }
}

async function createToken(userId: string, signal?: AbortSignal): Promise<string> {
  const result = await mmFetch<{ token: string }>(`/users/${encodeURIComponent(userId)}/tokens`, {
    method: "POST",
    headers: getAdminHeaders(),
    body: JSON.stringify({ description: "ecency-auto" }),
    signal
  });
  // Store the token secret in user props so we can retrieve it later.
  // Mattermost's GET /users/{id}/tokens does NOT return the secret —
  // it's only available at creation time.
  // Merge with existing props to avoid clobbering other fields
  // (left_channels, DM privacy, bans, etc.)
  const user = await getMattermostUserWithProps(userId, signal);
  const mergedProps = { ...(user.props || {}), [CHAT_PAT_PROP]: result.token };
  await mmFetch(`/users/${encodeURIComponent(userId)}/patch`, {
    method: "PUT",
    headers: getAdminHeaders(),
    body: JSON.stringify({ props: mergedProps }),
    signal
  });
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
  const storedToken = user.props?.[CHAT_PAT_PROP];
  if (storedToken) {
    // isTokenValid rethrows non-auth errors
    if (await isTokenValid(storedToken, signal)) {
      return { token: storedToken, user };
    }
    // Token exists but is invalid (revoked/expired) — fall through to create.
    // The user.props we return here predates createToken's PUT to merge in
    // the new PAT, but the only consumer (left-channels) doesn't care.
  }
  const token = await createToken(userId, signal);
  return { token, user };
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

export function hasSystemAdminRole(user: Pick<MattermostUser, "roles">): boolean {
  // MM roles is a space-separated list (e.g. "system_user system_admin"). Split
  // on whitespace and match the exact token rather than a substring, so a custom
  // role such as "system_admin_lite" or "non_system_admin" can't satisfy it.
  return (user.roles?.split(/\s+/) ?? []).includes("system_admin");
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

  const isSuperAdmin =
    currentUser.username === MATTERMOST_SUPER_ADMIN &&
    (!MATTERMOST_REQUIRE_SYSTEM_ADMIN || hasSystemAdminRole(currentUser));

  if (!isSuperAdmin) {
    return { response: NextResponse.json({ error: "not found" }, { status: 404 }) };
  }

  return { user: currentUser };
}

export function handleMattermostError(error: unknown) {
  if (isMattermostUnauthorizedError(error)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
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

export async function addUserLeftChannel(userId: string, channelName: string) {
  const user = await getMattermostUserWithProps(userId);
  const leftChannels = getUserLeftChannels(user);
  leftChannels.add(channelName);
  const props = { ...(user.props || {}), [CHAT_LEFT_CHANNELS_PROP]: JSON.stringify(Array.from(leftChannels)) };
  await mmFetch(`/users/${encodeURIComponent(userId)}/patch`, {
    method: "PUT",
    headers: getAdminHeaders(),
    body: JSON.stringify({ props })
  });
}

export async function removeUserLeftChannel(userId: string, channelName: string, signal?: AbortSignal) {
  const user = await getMattermostUserWithProps(userId, signal);
  const leftChannels = getUserLeftChannels(user);
  if (!leftChannels.delete(channelName)) return;
  const props = { ...(user.props || {}), [CHAT_LEFT_CHANNELS_PROP]: JSON.stringify(Array.from(leftChannels)) };
  await mmFetch(`/users/${encodeURIComponent(userId)}/patch`, {
    method: "PUT",
    headers: getAdminHeaders(),
    body: JSON.stringify({ props }),
    signal
  });
}

async function searchMattermostPostsByUserAsAdmin(username: string, page: number, perPage: number) {
  const teamId = getMattermostTeamId();

  return mmFetch<{ order: string[]; posts: Record<string, any> }>(`/teams/${encodeURIComponent(teamId)}/posts/search`, {
    method: "POST",
    headers: getAdminHeaders(),
    body: JSON.stringify({
      terms: `from:${username}`,
      is_or_search: false,
      include_deleted_channels: true,
      per_page: perPage,
      page
    })
  });
}

export async function deleteMattermostPostsByUserAsAdmin(username: string) {
  const normalizedUsername = username.trim().replace(/^@/, "").toLowerCase();
  const targetUser = await findMattermostUser(normalizedUsername);

  if (!targetUser) {
    throw new MattermostError(`User @${normalizedUsername} not found`, 404);
  }

  const perPage = 200;
  let deleted = 0;

  // Continue searching from the first page until no more posts remain for the target user.
  while (true) {
    const { order, posts } = await searchMattermostPostsByUserAsAdmin(targetUser.username, 0, perPage);
    const postsToDelete = (order || []).map((id) => posts[id]).filter(Boolean);

    if (!postsToDelete.length) {
      break;
    }

    for (const post of postsToDelete) {
      await deleteMattermostPostAsAdmin(post.id);
      deleted += 1;
    }
  }

  return { deleted, user: targetUser } as const;
}

export async function deleteMattermostDmPostsByUserAsAdmin(username: string, timeoutMs = 25000) {
  const normalizedUsername = username.trim().replace(/^@/, "").toLowerCase();
  const targetUser = await findMattermostUser(normalizedUsername);

  if (!targetUser) {
    throw new MattermostError(`User @${normalizedUsername} not found`, 404);
  }

  let deleted = 0;
  let timedOut = false;
  const startTime = Date.now();
  const teamId = getMattermostTeamId();

  // Helper to check if we should continue
  const shouldContinue = () => {
    if (Date.now() - startTime > timeoutMs) {
      timedOut = true;
      return false;
    }
    return true;
  };

  // Get all channels for the user (includes DMs and group messages)
  const channels = await mmFetch<Array<{ id: string; type: string; team_id: string }>>(
    `/users/${encodeURIComponent(targetUser.id)}/channels`,
    { headers: getAdminHeaders() }
  );

  // Filter to only DM channels (type: 'D') and group messages (type: 'G')
  const dmChannels = channels.filter((ch) => ch.type === "D" || ch.type === "G");

  // For each DM channel, get and delete all posts by the user
  channelLoop: for (const channel of dmChannels) {
    if (!shouldContinue()) break;

    let page = 0;
    const perPage = 200;

    while (shouldContinue()) {
      // Get posts in this channel
      // Don't silently treat a fetch failure as an empty page (that would
      // under-delete while reporting success); but one channel's transient error
      // shouldn't abort deletion for all the others — log it and skip this channel.
      let posts: MmChannelPost[] | { order: string[]; posts: Record<string, MmChannelPost> };
      try {
        posts = await mmFetch<
          MmChannelPost[] | { order: string[]; posts: Record<string, MmChannelPost> }
        >(`/channels/${channel.id}/posts?page=${page}&per_page=${perPage}`, {
          headers: getAdminHeaders()
        });
      } catch (err) {
        console.error("MM DM cleanup: failed to fetch channel posts page", {
          channelId: channel.id,
          page,
          error: err
        });
        break;
      }

      // Extract posts array from the response (MM returns an object keyed by id)
      const postsArray: MmChannelPost[] = Array.isArray(posts)
        ? posts
        : Object.values(posts.posts || {});

      // Delete only this user's posts on this page. A page can legitimately have
      // none from the target user while older pages still do, so keep paging until
      // the channel itself is exhausted (the postsArray.length check below) instead
      // of stopping on an empty filtered page.
      const userPosts = postsArray.filter((post) => post.user_id === targetUser.id);

      // Delete posts in parallel batches for speed
      const BATCH_SIZE = 10;
      for (let i = 0; i < userPosts.length; i += BATCH_SIZE) {
        if (!shouldContinue()) break channelLoop;

        const batch = userPosts.slice(i, i + BATCH_SIZE);
        const deletePromises = batch.map(async (post) => {
          try {
            await deleteMattermostPostAsAdmin(post.id);
            return true;
          } catch (err) {
            return false; // Silent failure
          }
        });

        const results = await Promise.allSettled(deletePromises);
        deleted += results.filter((r) => r.status === "fulfilled" && r.value === true).length;
      }

      // If we got fewer posts than requested, we've reached the end
      if (postsArray.length < perPage) {
        break;
      }

      page += 1;
    }
  }

  return { deleted, user: targetUser, dmOnly: true, timedOut } as const;
}

export async function banMattermostUserForHoursAsAdmin(username: string, hours: number) {
  if (Number.isNaN(hours) || !Number.isFinite(hours)) {
    throw new MattermostError("hours must be a finite number", 400);
  }

  const normalizedUsername = username.trim().replace(/^@/, "").toLowerCase();
  const targetUser = await findMattermostUser(normalizedUsername);

  if (!targetUser) {
    throw new MattermostError(`User @${normalizedUsername} not found`, 404);
  }

  const adminUser = await getMattermostUserWithProps(targetUser.id);
  const props = { ...(adminUser.props || {}) };

  const expiration = hours > 0 ? Date.now() + hours * 60 * 60 * 1000 : null;

  if (expiration) {
    props[CHAT_BAN_PROP] = String(expiration);
  } else {
    delete props[CHAT_BAN_PROP];
  }

  await mmFetch(`/users/${encodeURIComponent(adminUser.id)}/patch`, {
    method: "PUT",
    headers: getAdminHeaders(),
    body: JSON.stringify({ props })
  });

  return { user: targetUser, bannedUntil: expiration } as const;
}

export async function setUserDmPrivacy(userId: string, privacy: DmPrivacyLevel) {
  const user = await getMattermostUserWithProps(userId);
  const props = { ...(user.props || {}) };

  if (privacy === "all") {
    delete props[CHAT_DM_PRIVACY_PROP];
  } else {
    props[CHAT_DM_PRIVACY_PROP] = privacy;
  }

  await mmFetch(`/users/${encodeURIComponent(userId)}/patch`, {
    method: "PUT",
    headers: getAdminHeaders(),
    body: JSON.stringify({ props })
  });

  return privacy;
}

/**
 * Deactivates a Mattermost user account (Team Edition compatible).
 * This will:
 * - Mark user as inactive/deleted
 * - Prevent login
 * - Remove from channels
 * Note: Does NOT permanently delete data (requires Enterprise Edition)
 */
export async function deactivateMattermostUserAsAdmin(username: string) {
  const normalizedUsername = username.trim().replace(/^@/, "").toLowerCase();
  const targetUser = await findMattermostUser(normalizedUsername);

  if (!targetUser) {
    throw new MattermostError(`User @${normalizedUsername} not found`, 404);
  }

  // Deactivate user (Team Edition compatible)
  await mmFetch(`/users/${encodeURIComponent(targetUser.id)}`, {
    method: "DELETE",
    headers: getAdminHeaders()
  });

  return {
    deactivated: true,
    userId: targetUser.id,
    username: targetUser.username
  } as const;
}

/**
 * Permanently deletes a Mattermost user account and all associated data.
 * This is IRREVERSIBLE and will:
 * - Delete the user profile
 * - Remove user from all channels and DMs
 * - Delete all their posts (handled by Mattermost)
 * - Delete all uploaded files
 * - Remove all preferences and settings
 *
 * REQUIRES: Mattermost Enterprise Edition
 */
export async function deleteMattermostUserAccountAsAdmin(username: string) {
  const normalizedUsername = username.trim().replace(/^@/, "").toLowerCase();
  const targetUser = await findMattermostUser(normalizedUsername);

  if (!targetUser) {
    throw new MattermostError(`User @${normalizedUsername} not found`, 404);
  }

  try {
    // Try permanent deletion first (Enterprise Edition)
    await mmFetch(`/users/${encodeURIComponent(targetUser.id)}?permanent=true`, {
      method: "DELETE",
      headers: getAdminHeaders()
    });

    return {
      deleted: true,
      userId: targetUser.id,
      username: targetUser.username
    } as const;
  } catch (error) {
    // If permanent deletion fails, try deactivation (Team Edition fallback)
    const response = await deactivateMattermostUserAsAdmin(username);
    return {
      deleted: false,
      deactivated: true,
      userId: response.userId,
      username: response.username
    } as const;
  }
}

/**
 * Complete user removal: deletes all messages (including DMs) and then permanently deletes the account.
 * This is the nuclear option for handling abusive users.
 *
 * Steps:
 * 1. Delete all public/community channel messages
 * 2. Delete all DM and group message posts
 * 3. Permanently delete the user account
 *
 * Note: Mattermost's permanent user deletion will also remove posts, but we do it explicitly
 * first to ensure all messages are gone before the account is deleted.
 */
export async function nukeUserCompletelyAsAdmin(username: string) {
  const normalizedUsername = username.trim().replace(/^@/, "").toLowerCase();
  const targetUser = await findMattermostUser(normalizedUsername);

  if (!targetUser) {
    throw new MattermostError(`User @${normalizedUsername} not found`, 404);
  }

  const result = {
    username: targetUser.username,
    userId: targetUser.id,
    deletedPublicPosts: 0,
    deletedDmPosts: 0,
    accountDeleted: false
  };

  try {
    // Step 1: Delete all public/community posts
    const publicResult = await deleteMattermostPostsByUserAsAdmin(targetUser.username);
    result.deletedPublicPosts = publicResult.deleted;
  } catch (err) {
    // Continue anyway
  }

  try {
    // Step 2: Delete all DM and group message posts
    const dmResult = await deleteMattermostDmPostsByUserAsAdmin(targetUser.username);
    result.deletedDmPosts = dmResult.deleted;
  } catch (err) {
    // Continue anyway
  }

  try {
    // Step 3: Permanently delete the user account
    await deleteMattermostUserAccountAsAdmin(targetUser.username);
    result.accountDeleted = true;
  } catch (err) {
    throw err; // This is critical, so we throw
  }

  return result;
}

export async function cleanupInactiveMattermostUsers(
  inactiveDays: number = 60
): Promise<{ deactivated: number; checked: number; skipped: number; errors: number }> {
  if (!Number.isInteger(inactiveDays) || inactiveDays < 1) {
    throw new Error(`inactiveDays must be a positive integer, got ${inactiveDays}`);
  }

  const teamId = getMattermostTeamId();
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - inactiveDays);

  let deactivated = 0;
  let checked = 0;
  let skipped = 0;
  let errors = 0;
  let page = 0;
  const perPage = 200;
  const skipUsers = new Set(["ecency"]);

  while (true) {
    // Fetch active team members page
    const members = await mmFetch<Array<{ user_id: string }>>(
      `/teams/${encodeURIComponent(teamId)}/members?page=${page}&per_page=${perPage}`,
      { headers: getAdminHeaders() }
    );
    if (!members.length) break;

    // Get usernames for this batch
    const userIds = members.map((m) => m.user_id);
    const users = await mmFetch<MattermostUser[]>(`/users/ids`, {
      method: "POST",
      headers: getAdminHeaders(),
      body: JSON.stringify(userIds)
    });

    const usernames = users
      .filter((u) => !skipUsers.has(u.username) && u.delete_at === 0)
      .map((u) => u.username);

    if (usernames.length > 0) {
      // Batch Hive lookup using bridge.get_profiles for accurate activity data
      try {
        const accounts = await getProfiles(usernames);
        for (const account of accounts) {
          checked++;

          // Skip accounts with no activity data (epoch or missing)
          const active = account.active;
          if (!active || active.startsWith("1970-01-01")) {
            skipped++;
            continue;
          }

          const lastActiveDate = new Date(active + "Z");
          if (isNaN(lastActiveDate.getTime())) {
            skipped++;
            continue;
          }
          if (lastActiveDate < cutoffDate) {
            try {
              await deactivateMattermostUserAsAdmin(account.name);
              deactivated++;
            } catch {
              errors++;
            }
          }
        }
      } catch (err) {
        console.error("MM cleanup: Hive batch lookup failed", { batchSize: usernames.length, error: err });
        errors += usernames.length;
      }
    }

    if (members.length < perPage) break;
    page++;
  }

  return { deactivated, checked, skipped, errors };
}
