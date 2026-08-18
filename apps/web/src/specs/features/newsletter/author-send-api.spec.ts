import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { authorSendApi, SendRefusedError } from "@/features/newsletter/author-send-api";

vi.mock("@/utils", async () => ({
  ...(await vi.importActual<object>("@/utils")),
  ensureValidToken: vi.fn(async () => "mock-token")
}));

const fetchMock = vi.fn();
const json = (status: number, body: unknown) => Promise.resolve({ ok: status < 400, status, json: async () => body } as Response);

/** The browser client's contract with the relay routes: paths, bodies, the token header, error shape. */
describe("authorSendApi", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockReset();
  });
  afterEach(() => vi.unstubAllGlobals());

  it("previews and sends with the token header and the exact body; lists issues by list", async () => {
    const ref = { type: "creator" as const, target: "alice", author: "alice", permlink: "hello" };
    fetchMock.mockReturnValueOnce(json(200, { subject: "x" }));
    await authorSendApi.preview(ref, "alice");
    expect(fetchMock.mock.calls[0][0]).toBe("/api/newsletter/send/preview");
    expect(fetchMock.mock.calls[0][1].headers).toMatchObject({ "X-HS-Token": "mock-token" });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual(ref);
    fetchMock.mockReturnValueOnce(json(201, { issues: [] }));
    await authorSendApi.send(ref, "alice");
    expect(fetchMock.mock.calls[1][0]).toBe("/api/newsletter/send");
    fetchMock.mockReturnValueOnce(json(200, { issues: [{ id: "1" }] }));
    expect(await authorSendApi.issues("community", "hive-125125", "alice")).toEqual([{ id: "1" }]);
    expect(fetchMock.mock.calls[2][0]).toBe("/api/newsletter/issues?type=community&target=hive-125125");
  });

  it("keeps the service's status, code and taken details on refusal", async () => {
    fetchMock.mockReturnValueOnce(json(409, { error: "taken", code: "already_sent", taken: [{ cadence: "weekly", period: "2026-08-17", kind: "post" }] }));
    const err = await authorSendApi.send({ type: "creator", target: "alice", author: "alice", permlink: "hello" }, "alice").catch((e) => e);
    expect(err).toBeInstanceOf(SendRefusedError);
    expect(err).toMatchObject({ status: 409, code: "already_sent", taken: [{ cadence: "weekly" }] });
  });
});
