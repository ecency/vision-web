import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const GROUP = "g".repeat(26);
const ALICE = "a".repeat(26);
const ADMIN = "z".repeat(26);

type Route = (init?: RequestInit) => { status: number; body?: unknown };

function mockMattermost(routes: Record<string, Route>) {
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const path = url.replace("https://mm.test/api/v4", "");
    const route = routes[`${init?.method ?? "GET"} ${path}`];
    const { status, body } = route ? route(init) : { status: 500, body: { message: `unexpected ${path}` } };
    return new Response(body === undefined ? "" : JSON.stringify(body), { status });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

async function load() {
  vi.resetModules();
  vi.stubEnv("MATTERMOST_BASE_URL", "https://mm.test/api/v4");
  vi.stubEnv("MATTERMOST_ADMIN_TOKEN", "admin-token");
  return import("@/server/mattermost");
}

const ownerPath = `/users/${ADMIN}/preferences/ecency_group_owner/name/${GROUP}`;

describe("group owner record", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("reads the owner from one row on the admin account", async () => {
    mockMattermost({
      "GET /users/me": () => ({ status: 200, body: { id: ADMIN } }),
      [`GET ${ownerPath}`]: () => ({ status: 200, body: { value: ALICE } })
    });
    const { getGroupOwnerId } = await load();

    expect(await getGroupOwnerId(GROUP)).toBe(ALICE);
  });

  it("reads a missing row (Mattermost answers 400) as no owner", async () => {
    mockMattermost({
      "GET /users/me": () => ({ status: 200, body: { id: ADMIN } }),
      [`GET ${ownerPath}`]: () => ({ status: 400, body: { message: "missing" } })
    });
    const { getGroupOwnerId } = await load();

    expect(await getGroupOwnerId(GROUP)).toBeNull();
  });

  it("fails rather than guessing when Mattermost errors", async () => {
    mockMattermost({
      "GET /users/me": () => ({ status: 200, body: { id: ADMIN } }),
      [`GET ${ownerPath}`]: () => ({ status: 503, body: { message: "down" } })
    });
    const { getGroupOwnerId } = await load();

    await expect(getGroupOwnerId(GROUP)).rejects.toThrow();
  });

  it("caches a found owner and reads again when asked for a fresh answer", async () => {
    const fetchMock = mockMattermost({
      "GET /users/me": () => ({ status: 200, body: { id: ADMIN } }),
      [`GET ${ownerPath}`]: () => ({ status: 200, body: { value: ALICE } })
    });
    const { getGroupOwnerId } = await load();

    await getGroupOwnerId(GROUP);
    await getGroupOwnerId(GROUP);
    const reads = () => fetchMock.mock.calls.filter(([url]) => String(url).endsWith(ownerPath)).length;
    expect(reads()).toBe(1);

    await getGroupOwnerId(GROUP, { fresh: true });
    expect(reads()).toBe(2);
  });

  it("ignores ids that are not Mattermost ids", async () => {
    const fetchMock = mockMattermost({});
    const { getGroupOwnerId } = await load();

    expect(await getGroupOwnerId("../users/me")).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("writes the owner to the admin account, never the member's", async () => {
    const fetchMock = mockMattermost({
      "GET /users/me": () => ({ status: 200, body: { id: ADMIN } }),
      [`PUT /users/${ADMIN}/preferences`]: () => ({ status: 200, body: { status: "OK" } })
    });
    const { setGroupOwnerId, getGroupOwnerId } = await load();

    await setGroupOwnerId(GROUP, ALICE);

    const write = fetchMock.mock.calls.find(([, init]) => init?.method === "PUT");
    expect(JSON.parse(String(write![1]!.body))).toEqual([
      { user_id: ADMIN, category: "ecency_group_owner", name: GROUP, value: ALICE }
    ]);
    expect((write![1]!.headers as Record<string, string>).Authorization).toBe("Bearer admin-token");
    // Remembered without another read.
    expect(await getGroupOwnerId(GROUP)).toBe(ALICE);
  });

  it("confirms a group has no owner from the whole category before a claim", async () => {
    const categoryPath = `/users/${ADMIN}/preferences/ecency_group_owner`;
    const other = "o".repeat(26);
    let answer: { status: number; body?: unknown } = { status: 404, body: { message: "empty" } };
    mockMattermost({
      "GET /users/me": () => ({ status: 200, body: { id: ADMIN } }),
      [`GET ${categoryPath}`]: () => answer
    });
    const { isGroupOwnerMissing } = await load();

    expect(await isGroupOwnerMissing(GROUP)).toBe(true);

    answer = { status: 200, body: [{ name: other, value: ALICE }] };
    expect(await isGroupOwnerMissing(GROUP)).toBe(true);

    answer = { status: 200, body: [{ name: GROUP, value: ALICE }] };
    expect(await isGroupOwnerMissing(GROUP)).toBe(false);

    // A failed read never counts as "no owner".
    answer = { status: 400, body: { message: "read failed" } };
    await expect(isGroupOwnerMissing(GROUP)).rejects.toThrow();
  });
});
