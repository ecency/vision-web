import "@testing-library/jest-dom";
import { vi, describe, it, expect, beforeEach } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";

/*
  #1973: "Recap" + "Apply to post" replaced the whole post body with the summary in one
  click. Applying a Recap now asks first; other actions still apply directly.
*/

const { runAssist } = vi.hoisted(() => ({ runAssist: vi.fn() }));

vi.mock("@ecency/sdk", async () => ({
  ...(await vi.importActual<Record<string, unknown>>("@ecency/sdk")),
  useAiAssist: vi.fn(() => ({ mutateAsync: runAssist, isPending: false })),
  getAiAssistPriceQueryOptions: vi.fn(() => ({
    queryKey: ["spec", "ai-assist-prices"],
    queryFn: async () => [
      { action: "summarize", cost: 5, free_remaining: 1 },
      { action: "improve", cost: 5, free_remaining: 1 }
    ]
  })),
  getPointsQueryOptions: vi.fn(() => ({
    queryKey: ["spec", "points"],
    queryFn: async () => ({ points: "100" })
  }))
}));
vi.mock("@/utils", async () => ({
  ...(await vi.importActual("@/utils")),
  getAccessToken: vi.fn(() => "access-token"),
  ensureValidToken: vi.fn(async () => "fresh-token")
}));
vi.mock("@/features/shared", () => ({ error: vi.fn(), success: vi.fn() }));
vi.mock("@/features/shared/points-topup-cta", () => ({ PointsTopupCta: () => null }));
vi.mock("@/config", () => ({
  EcencyConfigManager: {
    CONFIG: { visionFeatures: { points: { enabled: true } } },
    useConfig: vi.fn(() => true)
  }
}));

import { AiAssist } from "@/features/shared/ai-assist";
import { useActiveAccount } from "@/core/hooks/use-active-account";
import { mockActiveUser, renderWithQueryClient } from "@/specs/test-utils";

beforeEach(() => {
  runAssist.mockReset();
  vi.mocked(useActiveAccount).mockReturnValue({
    activeUser: mockActiveUser({ username: "alice" }),
    username: "alice",
    account: null,
    isLoading: false,
    isPending: false,
    isError: false,
    isSuccess: true,
    error: null,
    refetch: vi.fn()
  } as ReturnType<typeof useActiveAccount>);
});

async function runAction(action: "summarize" | "improve", onApply: ReturnType<typeof vi.fn>) {
  runAssist.mockResolvedValueOnce({ action, output: "the result" });
  renderWithQueryClient(<AiAssist initialText={"x".repeat(200)} onApply={onApply} />);
  fireEvent.click(await screen.findByRole("button", { name: new RegExp(`^ai-assist\\.action-${action}`) }));
  await waitFor(() =>
    expect(
      screen.getByRole<HTMLButtonElement>("button", { name: /ai-assist\.submit-button/ }).disabled
    ).toBe(false)
  );
  fireEvent.click(screen.getByRole("button", { name: /ai-assist\.submit-button/ }));
  await screen.findByRole("button", { name: "ai-assist.apply-button" });
}

describe("AiAssist apply", () => {
  it("asks before a Recap replaces the post", async () => {
    const onApply = vi.fn();
    await runAction("summarize", onApply);

    fireEvent.click(screen.getByRole("button", { name: "ai-assist.apply-button" }));
    expect(onApply).not.toHaveBeenCalled();
    expect(screen.getByText("ai-assist.apply-summarize-confirm")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "ai-assist.apply-summarize-confirm-button" }));
    expect(onApply).toHaveBeenCalledWith("the result", "summarize");
  });

  it("cancelling the Recap confirm applies nothing", async () => {
    const onApply = vi.fn();
    await runAction("summarize", onApply);

    fireEvent.click(screen.getByRole("button", { name: "ai-assist.apply-button" }));
    fireEvent.click(screen.getByRole("button", { name: "g.cancel" }));
    expect(onApply).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "ai-assist.apply-button" })).toBeInTheDocument();
  });

  it("applies other actions directly", async () => {
    const onApply = vi.fn();
    await runAction("improve", onApply);

    fireEvent.click(screen.getByRole("button", { name: "ai-assist.apply-button" }));
    expect(onApply).toHaveBeenCalledWith("the result", "improve");
  });
});
