import { createTestQueryClient, renderWithQueryClient } from "@/specs/test-utils";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";

vi.mock("@/utils", async () => ({
  ...(await vi.importActual("@/utils")),
  random: vi.fn(),
  getAccessToken: vi.fn(() => "mock-token"),
  ensureValidToken: vi.fn(async () => "mock-token")
}));

import { useActiveAccount } from "@/core/hooks/use-active-account";
import { QueryKeys, useGenerateImage } from "@ecency/sdk";
import { AiImageGenerator } from "@/features/shared/ai-image-generator/ai-image-generator";

type HttpishError = Error & { status: number; data: Record<string, unknown> };

// err shaped like the SDK mutation throws it: HTTP status + parsed body.
function httpError(status: number, data: Record<string, unknown>): HttpishError {
  return Object.assign(new Error(`failed with status ${status}`), { status, data });
}

function seededClient() {
  const queryClient = createTestQueryClient();
  // Same key shape as the SDK's QueryKeys.ai.prices().
  queryClient.setQueryData(QueryKeys.ai.prices(), {
    prices: [{ aspect_ratio: "1:1", cost: 150 }],
    power: [{ power: 1, multiplier: 1 }]
  });
  return queryClient;
}

const stillInProgress = (retryAfter: number) =>
  httpError(409, { error: "in_progress", retry_after: retryAfter });

describe("AiImageGenerator pending auto-poll", () => {
  const generateMock = vi.fn();

  beforeEach(() => {
    generateMock.mockReset();
    (useGenerateImage as Mock).mockReturnValue({
      mutateAsync: generateMock,
      isPending: false
    });
    (useActiveAccount as Mock).mockReturnValue({
      activeUser: { username: "alice" },
      username: "alice"
    });
  });

  async function renderAndGenerate() {
    const view = renderWithQueryClient(<AiImageGenerator showInsertAction={false} />, {
      queryClient: seededClient()
    });
    fireEvent.change(screen.getByPlaceholderText("ai-image-generator.prompt-placeholder"), {
      target: { value: "a fox" }
    });
    fireEvent.click(screen.getByText("ai-image-generator.generate-button"));
    await waitFor(() => expect(generateMock).toHaveBeenCalledTimes(1));
    return view;
  }

  it("keeps the idempotency key on 409 in_progress and auto-polls until the image arrives", async () => {
    generateMock
      .mockRejectedValueOnce(stillInProgress(0.01))
      .mockResolvedValueOnce({ url: "https://images.test/done.png" });

    await renderAndGenerate();

    // The in-flight state is shown and the retry happens automatically with the SAME key.
    await waitFor(() => expect(generateMock).toHaveBeenCalledTimes(2));
    expect(generateMock.mock.calls[1][0].idempotency_key).toBe(
      generateMock.mock.calls[0][0].idempotency_key
    );
    await waitFor(() =>
      expect(screen.getByText("ai-image-generator.result-title")).toBeTruthy()
    );
  });

  it("shows the still-generating notice while a 409 attempt is pending", async () => {
    // Bottomless in_progress: every poll answers 409 again.
    generateMock.mockRejectedValue(stillInProgress(60));

    await renderAndGenerate();

    await waitFor(() =>
      expect(screen.getByText("ai-image-generator.still-generating")).toBeTruthy()
    );
  });

  it("keeps the finishing notice for a 202 delivery_pending answer", async () => {
    generateMock.mockRejectedValue(
      httpError(202, { error: "delivery_pending", retry_after: 60 })
    );

    await renderAndGenerate();

    await waitFor(() =>
      expect(screen.getByText("ai-image-generator.finishing")).toBeTruthy()
    );
  });

  it("drops the key on a hard failure so the next attempt is a fresh request", async () => {
    generateMock
      .mockRejectedValueOnce(httpError(500, { error: "generation_failed" }))
      .mockRejectedValueOnce(httpError(500, { error: "generation_failed" }));

    await renderAndGenerate();

    fireEvent.click(screen.getByText("ai-image-generator.generate-button"));
    await waitFor(() => expect(generateMock).toHaveBeenCalledTimes(2));
    expect(generateMock.mock.calls[1][0].idempotency_key).not.toBe(
      generateMock.mock.calls[0][0].idempotency_key
    );
  });

  it("drops a pending response whose inputs changed mid-flight instead of polling the new ones", async () => {
    let rejectFirst!: (e: unknown) => void;
    generateMock.mockImplementationOnce(
      () => new Promise((_resolve, reject) => (rejectFirst = reject))
    );

    await renderAndGenerate();

    // The user edits the prompt while the request is unsettled, abandoning the attempt.
    fireEvent.change(screen.getByPlaceholderText("ai-image-generator.prompt-placeholder"), {
      target: { value: "a different fox" }
    });
    rejectFirst(stillInProgress(0.01));

    // Without the stale-attempt gate the 409 would arm a poll that auto-submits the NEW
    // prompt under a fresh key: an unrequested, billed generation.
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(generateMock).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("ai-image-generator.still-generating")).toBeNull();
  });

  it("stops polling when the dialog unmounts mid-request", async () => {
    let rejectFirst!: (e: unknown) => void;
    generateMock.mockImplementationOnce(
      () => new Promise((_resolve, reject) => (rejectFirst = reject))
    );

    const view = await renderAndGenerate();
    view.unmount();
    rejectFirst(stillInProgress(0.01));

    // The resolution of an unmounted dialog must not schedule further polls.
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(generateMock).toHaveBeenCalledTimes(1);
  });

  it("replaces an armed poll timer on manual fetch and never overlaps requests", async () => {
    let resolveSecond!: (v: unknown) => void;
    generateMock
      .mockRejectedValueOnce(stillInProgress(0.2))
      .mockImplementationOnce(() => new Promise((resolve) => (resolveSecond = resolve)));

    await renderAndGenerate();

    // Manual fetch while the poll timer is armed. Whichever of the two fires first, the
    // other must be swallowed: exactly one request runs at a time.
    await waitFor(() =>
      expect(screen.getByText("ai-image-generator.finishing-retry")).toBeTruthy()
    );
    fireEvent.click(screen.getByText("ai-image-generator.finishing-retry"));
    await waitFor(() => expect(generateMock).toHaveBeenCalledTimes(2));

    // The timer window passes while the second request hangs: no concurrent third call.
    await new Promise((resolve) => setTimeout(resolve, 350));
    expect(generateMock).toHaveBeenCalledTimes(2);

    resolveSecond({ url: "https://images.test/done.png" });
    await waitFor(() =>
      expect(screen.getByText("ai-image-generator.result-title")).toBeTruthy()
    );
  });

  it("stops automatic polling at the budget and keeps the key for the manual fetch", async () => {
    generateMock.mockRejectedValue(stillInProgress(0.001));

    await renderAndGenerate();

    // 1 initial request + 24 automatic polls, then the budget is spent.
    await waitFor(() => expect(generateMock).toHaveBeenCalledTimes(25), { timeout: 15000 });
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(generateMock).toHaveBeenCalledTimes(25);

    // The manual button remains and still replays the SAME paid attempt.
    fireEvent.click(screen.getByText("ai-image-generator.finishing-retry"));
    await waitFor(() => expect(generateMock).toHaveBeenCalledTimes(26));
    expect(generateMock.mock.calls[25][0].idempotency_key).toBe(
      generateMock.mock.calls[0][0].idempotency_key
    );
  }, 20000);
});
