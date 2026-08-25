import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  NewsletterSendRefusedError,
  getNewsletterIssuesRequest,
  previewNewsletterSendRequest,
  sendNewsletterIssueRequest
} from "@ecency/sdk";
import { authorSendApi, SendRefusedError } from "@/features/newsletter/author-send-api";

vi.mock("@/utils", async () => ({
  ...(await vi.importActual<object>("@/utils")),
  ensureValidToken: vi.fn(async () => "mock-token")
}));

/**
 * The wire format (paths, bodies, the token header, error shape) is pinned by
 * the SDK's own api.spec.ts; what web owns, and what this file pins, is the
 * DELEGATION: every call reaches the SDK client with a freshly ensured token,
 * and the SDK's refusal error passes through untouched.
 */
describe("authorSendApi", () => {
  beforeEach(() => {
    vi.mocked(previewNewsletterSendRequest).mockReset();
    vi.mocked(sendNewsletterIssueRequest).mockReset();
    vi.mocked(getNewsletterIssuesRequest).mockReset();
  });

  it("delegates preview, send and issues to the SDK client with the fresh token", async () => {
    const ref = { type: "creator" as const, target: "alice", author: "alice", permlink: "hello" };
    vi.mocked(previewNewsletterSendRequest).mockResolvedValueOnce({ subject: "x" } as never);
    await authorSendApi.preview(ref, "alice");
    expect(previewNewsletterSendRequest).toHaveBeenCalledWith(ref, "mock-token");

    vi.mocked(sendNewsletterIssueRequest).mockResolvedValueOnce({ issues: [] } as never);
    await authorSendApi.send(ref, "alice");
    expect(sendNewsletterIssueRequest).toHaveBeenCalledWith(ref, "mock-token");

    vi.mocked(getNewsletterIssuesRequest).mockResolvedValueOnce([{ id: "1" }] as never);
    expect(await authorSendApi.issues("community", "hive-125125", "alice")).toEqual([{ id: "1" }]);
    expect(getNewsletterIssuesRequest).toHaveBeenCalledWith("community", "hive-125125", "mock-token");
  });

  it("SendRefusedError IS the SDK's refusal error, passed through with status, code and taken", async () => {
    // The re-export must be the SAME class: dialogs branch on instanceof.
    expect(SendRefusedError).toBe(NewsletterSendRefusedError);
    vi.mocked(sendNewsletterIssueRequest).mockRejectedValueOnce(
      new NewsletterSendRefusedError("taken", 409, "already_sent", [
        { cadence: "weekly", period: "2026-08-17", kind: "post" }
      ])
    );
    const err = await authorSendApi
      .send({ type: "creator", target: "alice", author: "alice", permlink: "hello" }, "alice")
      .catch((e) => e);
    expect(err).toBeInstanceOf(SendRefusedError);
    expect(err).toMatchObject({ status: 409, code: "already_sent", taken: [{ cadence: "weekly" }] });
  });
});
