import { renderWithQueryClient } from "@/specs/test-utils";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";

vi.mock("@/utils", async () => ({
  ...(await vi.importActual("@/utils")),
  random: vi.fn(),
  getAccessToken: vi.fn(() => "mock-token"),
  ensureValidToken: vi.fn(async () => "mock-token")
}));

vi.mock("@/core/hooks/use-active-username", () => ({
  useActiveUsername: vi.fn(() => "alice")
}));

import { useActiveAccount } from "@/core/hooks/use-active-account";
import { useGenerateImage } from "@ecency/sdk";
import { AiImageGenerator } from "@/features/shared/ai-image-generator/ai-image-generator";
import { QueryClient } from "@tanstack/react-query";

// err shaped like the SDK mutation throws it: HTTP status + parsed body.
function httpError(status: number, data: Record<string, unknown>) {
  const err = new Error(`failed with status ${status}`);
  (err as any).status = status;
  (err as any).data = data;
  return err;
}

function seededClient() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } }
  });
  queryClient.setQueryData(["ai-image-price"], {
    prices: [{ aspect_ratio: "1:1", cost: 150 }],
    power: [{ power: 1, multiplier: 1 }]
  });
  return queryClient;
}

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
    renderWithQueryClient(<AiImageGenerator showInsertAction={false} />, {
      queryClient: seededClient()
    });
    fireEvent.change(screen.getByPlaceholderText("ai-image-generator.prompt-placeholder"), {
      target: { value: "a fox" }
    });
    fireEvent.click(screen.getByText("ai-image-generator.generate-button"));
    await waitFor(() => expect(generateMock).toHaveBeenCalledTimes(1));
  }

  it("keeps the idempotency key on 409 in_progress and auto-polls until the image arrives", async () => {
    generateMock
      .mockRejectedValueOnce(httpError(409, { error: "in_progress", retry_after: 0.01 }))
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
    generateMock.mockRejectedValue(httpError(409, { error: "in_progress", retry_after: 60 }));

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
});
