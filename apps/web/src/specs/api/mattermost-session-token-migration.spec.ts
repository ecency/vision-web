import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";

const mockGuard = vi.fn();
const mockList = vi.fn();
const mockRetire = vi.fn();
let token: string | null = "admin-pat";

vi.mock("@/server/mattermost", () => ({
  getMattermostTokenFromCookies: () => Promise.resolve(token),
  handleMattermostError: () => NextResponse.json({ error: "upstream" }, { status: 502 }),
  hasPlaintextSessionToken: (user: { props?: Record<string, string> }) => !!user.props?.ecency_pat,
  listMattermostUsersWithPropsAsAdmin: (...args: unknown[]) => mockList(...args),
  requireMattermostSuperAdmin: (...args: unknown[]) => mockGuard(...args),
  retirePlaintextSessionToken: (...args: unknown[]) => mockRetire(...args)
}));

function request(body?: unknown) {
  return { text: async () => (body === undefined ? "" : JSON.stringify(body)) } as never;
}

describe("POST /api/mattermost/admin/session-tokens", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    token = "admin-pat";
    mockGuard.mockResolvedValue({ user: { id: "admin" } });
    mockRetire.mockResolvedValue(true);
  });

  it("requires a chat session", async () => {
    const { POST } = await import("@/app/api/mattermost/admin/session-tokens/route");
    token = null;

    expect((await POST(request())).status).toBe(401);
    expect(mockList).not.toHaveBeenCalled();
  });

  it("hides itself from anyone but the super admin", async () => {
    const { POST } = await import("@/app/api/mattermost/admin/session-tokens/route");
    mockGuard.mockResolvedValue({
      response: NextResponse.json({ error: "not found" }, { status: 404 })
    });

    expect((await POST(request())).status).toBe(404);
    expect(mockList).not.toHaveBeenCalled();
  });

  it("rejects bad paging input", async () => {
    const { POST } = await import("@/app/api/mattermost/admin/session-tokens/route");

    expect((await POST(request({ page: -1 }))).status).toBe(400);
    expect((await POST(request({ perPage: 500 }))).status).toBe(400);
    expect((await POST(request({ page: "1" }))).status).toBe(400);
    expect(mockList).not.toHaveBeenCalled();
  });

  it("migrates only users still on the old format and reports progress", async () => {
    const { POST } = await import("@/app/api/mattermost/admin/session-tokens/route");
    mockList.mockResolvedValue([
      { id: "a", username: "a", props: { ecency_pat: "x" } },
      { id: "b", username: "b", props: { ecency_pat_sealed: "v1.y" } },
      { id: "c", username: "c", props: { ecency_pat: "z" } }
    ]);
    mockRetire.mockImplementation((id: string) =>
      id === "c" ? Promise.reject(new Error("boom")) : Promise.resolve(true)
    );

    const res = await POST(request({ page: 2, perPage: 3 }));
    const body = await res.json();

    expect(mockList).toHaveBeenCalledWith(2, 3);
    expect(mockRetire.mock.calls.map(([id]) => id)).toEqual(["a", "c"]);
    expect(body).toEqual({ page: 2, scanned: 3, migrated: 1, failed: ["c"], done: false });
  });

  it("reports done on a short page", async () => {
    const { POST } = await import("@/app/api/mattermost/admin/session-tokens/route");
    mockList.mockResolvedValue([{ id: "a", username: "a", props: {} }]);

    const body = await (await POST(request({ page: 9 }))).json();

    expect(body.done).toBe(true);
    expect(mockRetire).not.toHaveBeenCalled();
  });
});
