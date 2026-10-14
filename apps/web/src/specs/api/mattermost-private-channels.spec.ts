import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const TEAM = "t".repeat(26);
const CHANNEL = "c".repeat(26);
const ECENCY = "e".repeat(26);
const BOB = "b".repeat(26);
const CAROL = "k".repeat(26);

let callerToken = "admin-pat";

vi.mock("next/headers", () => ({
  headers: async () => ({ get: (name: string) => (name === "x-mm-token" ? callerToken : null) }),
  cookies: async () => ({ get: () => undefined })
}));

type Route = (init?: RequestInit) => { status: number; body?: unknown };
type Call = { method: string; path: string; auth: string | null; body: unknown };

let calls: Call[] = [];

function mockMattermost(routes: Record<string, Route>) {
  calls = [];
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const path = url.replace("https://mm.test/api/v4", "");
    const method = init?.method ?? "GET";
    const auth = new Headers(init?.headers).get("authorization");
    calls.push({ method, path, auth, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    const route = routes[`${method} ${path}`];
    const { status, body } = route ? route(init) : { status: 500, body: { message: `unexpected ${method} ${path}` } };
    return new Response(body === undefined ? "" : JSON.stringify(body), { status });
  });
  vi.stubGlobal("fetch", fetchMock);
}

const me = (username: string, id: string) => () => ({ status: 200, body: { id, username, roles: "system_user" } });
const user = (id: string, username: string, deleteAt = 0) => () => ({
  status: 200,
  body: { id, username, delete_at: deleteAt }
});
const notFound = () => ({ status: 404, body: { message: "not found" } });
const ok = (body: unknown = {}) => () => ({ status: 200, body });

const privateChannel = (overrides: Record<string, unknown> = {}) =>
  ok({ id: CHANNEL, type: "P", team_id: TEAM, delete_at: 0, display_name: "Curators", name: "private-x", ...overrides });

// Membership plumbing for one user: already in the team, added to the channel.
function joinRoutes(id: string): Record<string, Route> {
  return {
    [`GET /teams/${TEAM}/members/${id}`]: ok(),
    [`GET /channels/${CHANNEL}/members/${id}`]: notFound,
    [`POST /channels/${CHANNEL}/members`]: ok()
  };
}

function request(body?: unknown) {
  return new Request("https://ecency.test/api", {
    method: "POST",
    body: body === undefined ? undefined : JSON.stringify(body)
  });
}

const params = { params: Promise.resolve({ channelId: CHANNEL }) };

async function load<T>(path: string): Promise<T> {
  vi.resetModules();
  vi.stubEnv("MATTERMOST_BASE_URL", "https://mm.test/api/v4");
  vi.stubEnv("MATTERMOST_ADMIN_TOKEN", "admin-token");
  vi.stubEnv("MATTERMOST_TEAM_ID", TEAM);
  return (await import(path)) as T;
}

type CreateRoute = typeof import("@/app/api/mattermost/admin/private-channels/route");
type ChannelRoute = typeof import("@/app/api/mattermost/admin/private-channels/[channelId]/route");
type MembersRoute = typeof import("@/app/api/mattermost/admin/private-channels/[channelId]/members/route");

const writes = () => calls.filter((call) => call.method !== "GET" && call.path !== "/users/ids");

describe("admin private channels", () => {
  beforeEach(() => {
    callerToken = "admin-pat";
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("answers 404 to anyone but the chat admin and changes nothing", async () => {
    mockMattermost({ "GET /users/me": me("mallory", "m".repeat(26)) });
    callerToken = "mallory-pat";
    const create = await load<CreateRoute>("@/app/api/mattermost/admin/private-channels/route");
    const channel = await load<ChannelRoute>("@/app/api/mattermost/admin/private-channels/[channelId]/route");
    const members = await load<MembersRoute>(
      "@/app/api/mattermost/admin/private-channels/[channelId]/members/route"
    );

    const responses = await Promise.all([
      create.POST(request({ name: "x", usernames: ["bob"] })),
      channel.GET(request(), params),
      channel.PUT(request({ name: "x" }), params),
      members.POST(request({ usernames: ["bob"] }), params),
      members.DELETE(request({ username: "bob" }), params)
    ]);

    expect(responses.map((res) => res.status)).toEqual([404, 404, 404, 404, 404]);
    expect(calls.every((call) => call.path === "/users/me")).toBe(true);
  });

  it("creates the channel as the admin and adds every member with the admin token", async () => {
    mockMattermost({
      "GET /users/me": me("ecency", ECENCY),
      "GET /users/username/bob": user(BOB, "bob"),
      "GET /users/username/carol": user(CAROL, "carol"),
      "POST /channels": ok({ id: CHANNEL, type: "P", team_id: TEAM, delete_at: 0 }),
      ...joinRoutes(BOB),
      ...joinRoutes(CAROL)
    });
    const { POST } = await load<CreateRoute>("@/app/api/mattermost/admin/private-channels/route");

    const res = await POST(request({ name: "  Curators   team ", usernames: ["@Bob", "carol", "bob", "ecency"] }));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ channelId: CHANNEL });
    const created = calls.find((call) => call.method === "POST" && call.path === "/channels")!;
    expect(created.auth).toBe("Bearer admin-pat");
    expect(created.body).toMatchObject({ team_id: TEAM, display_name: "Curators team", type: "P" });
    expect((created.body as { name: string }).name).toMatch(/^private-[0-9a-f]{16}$/);
    const added = calls.filter((call) => call.method === "POST" && call.path === `/channels/${CHANNEL}/members`);
    expect(added.map((call) => (call.body as { user_id: string }).user_id).sort()).toEqual([BOB, CAROL].sort());
    expect(added.every((call) => call.auth === "Bearer admin-token")).toBe(true);
  });

  it("names the people not on chat, deactivated ones included, before creating anything", async () => {
    mockMattermost({
      "GET /users/me": me("ecency", ECENCY),
      "GET /users/username/bob": user(BOB, "bob", 123),
      "GET /users/username/ghost": notFound
    });
    const { POST } = await load<CreateRoute>("@/app/api/mattermost/admin/private-channels/route");

    const res = await POST(request({ name: "Curators", usernames: ["bob", "ghost"] }));

    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ missing: ["bob", "ghost"] });
    expect(writes()).toEqual([]);
  });

  it("rejects a missing or too long name", async () => {
    mockMattermost({ "GET /users/me": me("ecency", ECENCY) });
    const { POST } = await load<CreateRoute>("@/app/api/mattermost/admin/private-channels/route");

    expect((await POST(request({ name: "   " }))).status).toBe(400);
    expect((await POST(request({ name: "x".repeat(65) }))).status).toBe(400);
    expect((await POST(request({ name: "Ok", usernames: "bob" }))).status).toBe(400);
    expect(writes()).toEqual([]);
  });

  it("acts only on a live private channel of the chat team", async () => {
    const cases = [
      { type: "O" },
      { type: "G" },
      { type: "D" },
      { team_id: "x".repeat(26) },
      { delete_at: 5 }
    ];
    for (const overrides of cases) {
      mockMattermost({
        "GET /users/me": me("ecency", ECENCY),
        [`GET /channels/${CHANNEL}`]: privateChannel(overrides),
        "GET /users/username/bob": user(BOB, "bob"),
        ...joinRoutes(BOB),
        [`DELETE /channels/${CHANNEL}/members/${BOB}`]: ok(),
        [`PUT /channels/${CHANNEL}/patch`]: ok()
      });
      const channel = await load<ChannelRoute>("@/app/api/mattermost/admin/private-channels/[channelId]/route");
      const members = await load<MembersRoute>(
        "@/app/api/mattermost/admin/private-channels/[channelId]/members/route"
      );

      const statuses = [
        (await channel.GET(request(), params)).status,
        (await channel.PUT(request({ name: "New" }), params)).status,
        (await members.POST(request({ usernames: ["bob"] }), params)).status,
        (await members.DELETE(request({ username: "bob" }), params)).status
      ];

      expect(statuses, JSON.stringify(overrides)).toEqual([404, 404, 404, 404]);
      expect(writes(), JSON.stringify(overrides)).toEqual([]);
    }
  });

  it("does not ask Mattermost about an id that is not a channel id", async () => {
    mockMattermost({ "GET /users/me": me("ecency", ECENCY) });
    const { GET } = await load<ChannelRoute>("@/app/api/mattermost/admin/private-channels/[channelId]/route");

    const res = await GET(request(), { params: Promise.resolve({ channelId: "../users/me" }) });

    expect(res.status).toBe(404);
    expect(calls.map((call) => call.path)).toEqual(["/users/me"]);
  });

  it("lists members by username and renames with the admin token", async () => {
    mockMattermost({
      "GET /users/me": me("ecency", ECENCY),
      [`GET /channels/${CHANNEL}`]: privateChannel(),
      [`GET /channels/${CHANNEL}/members?page=0&per_page=200`]: ok([{ user_id: CAROL }, { user_id: BOB }]),
      "POST /users/ids": ok([
        { id: CAROL, username: "carol", email: "c@x" },
        { id: BOB, username: "bob", email: "b@x" }
      ]),
      [`PUT /channels/${CHANNEL}/patch`]: ok()
    });
    const { GET, PUT } = await load<ChannelRoute>(
      "@/app/api/mattermost/admin/private-channels/[channelId]/route"
    );

    const listed = await GET(request(), params);
    expect(await listed.json()).toEqual({
      channel: { id: CHANNEL, display_name: "Curators" },
      members: [
        { id: BOB, username: "bob" },
        { id: CAROL, username: "carol" }
      ]
    });

    const renamed = await PUT(request({ name: "Curation team" }), params);
    expect(renamed.status).toBe(200);
    const patch = calls.find((call) => call.path === `/channels/${CHANNEL}/patch`)!;
    expect(patch).toMatchObject({ auth: "Bearer admin-token", body: { display_name: "Curation team" } });
  });

  it("does not let the admin remove themselves", async () => {
    mockMattermost({ "GET /users/me": me("ecency", ECENCY) });
    const { DELETE } = await load<MembersRoute>(
      "@/app/api/mattermost/admin/private-channels/[channelId]/members/route"
    );

    expect((await DELETE(request({ username: "@Ecency" }), params)).status).toBe(400);
    expect(writes()).toEqual([]);
  });

  it("adds people and removes one, treating a non-member as already removed", async () => {
    mockMattermost({
      "GET /users/me": me("ecency", ECENCY),
      [`GET /channels/${CHANNEL}`]: privateChannel(),
      "GET /users/username/bob": user(BOB, "bob"),
      "GET /users/username/carol": user(CAROL, "carol", 99),
      ...joinRoutes(BOB),
      [`DELETE /channels/${CHANNEL}/members/${CAROL}`]: notFound
    });
    const { POST, DELETE } = await load<MembersRoute>(
      "@/app/api/mattermost/admin/private-channels/[channelId]/members/route"
    );

    const added = await POST(request({ usernames: ["bob"] }), params);
    expect(await added.json()).toEqual({ added: ["bob"] });

    // A deactivated member can still be removed.
    const removed = await DELETE(request({ username: "@Carol" }), params);
    expect(removed.status).toBe(200);
    expect(await removed.json()).toEqual({ removed: "carol" });
  });
});
