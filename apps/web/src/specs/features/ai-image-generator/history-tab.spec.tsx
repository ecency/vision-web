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
import { getAiImagesQueryOptions, QueryKeys, useGenerateImage } from "@ecency/sdk";
import { AiImageGenerator } from "@/features/shared/ai-image-generator/ai-image-generator";

const HISTORY = [
  {
    id: 1277,
    prompt: "Opportunity follows difficulty",
    url: "https://images.test/one.webp",
    aspect_ratio: "16:9",
    cost: 150,
    created: "2026-08-25T17:28:08+02:00"
  },
  {
    id: 386,
    prompt: "Claim Ecency points",
    url: "https://images.test/two.webp",
    aspect_ratio: "16:9",
    cost: 150,
    created: "2026-04-01T07:55:19+02:00"
  }
];

function seededClient(history?: typeof HISTORY) {
  const queryClient = createTestQueryClient();
  queryClient.setQueryData(QueryKeys.ai.prices(), {
    prices: [{ aspect_ratio: "1:1", cost: 150 }],
    power: [{ power: 1, multiplier: 1 }]
  });
  if (history) {
    queryClient.setQueryData(QueryKeys.ai.images("alice"), history);
  }
  return queryClient;
}

describe("AiImageGenerator history tab", () => {
  beforeEach(() => {
    (useGenerateImage as Mock).mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
    (useActiveAccount as Mock).mockReturnValue({
      activeUser: { username: "alice" },
      username: "alice"
    });
    // Deterministic per test: the queryFn stub never resolves, so rendered data comes
    // from the seeded cache and the key is the single shared builder.
    (getAiImagesQueryOptions as Mock).mockImplementation((username?: string) => ({
      queryKey: QueryKeys.ai.images(username),
      queryFn: vi.fn(() => new Promise(() => {}))
    }));
  });

  it("lists the user's delivered generations with insert and download actions", async () => {
    const onInsert = vi.fn();
    renderWithQueryClient(<AiImageGenerator onInsert={onInsert} showInsertAction={true} />, {
      queryClient: seededClient(HISTORY)
    });

    fireEvent.click(screen.getByText("ai-image-generator.tab-history"));

    expect(await screen.findByText("Opportunity follows difficulty")).toBeTruthy();
    expect(screen.getByText("Claim Ecency points")).toBeTruthy();

    fireEvent.click(screen.getAllByText("ai-image-generator.insert-button")[0]);
    expect(onInsert).toHaveBeenCalledWith("https://images.test/one.webp");
  });

  it("shows the empty state when there are no generations yet", async () => {
    renderWithQueryClient(<AiImageGenerator showInsertAction={false} />, {
      queryClient: seededClient([])
    });

    fireEvent.click(screen.getByText("ai-image-generator.tab-history"));

    expect(await screen.findByText("ai-image-generator.history-empty")).toBeTruthy();
  });

  it("shows the error state when the history request fails", async () => {
    (getAiImagesQueryOptions as Mock).mockImplementation((username?: string) => ({
      queryKey: QueryKeys.ai.images(username),
      queryFn: async () => {
        throw new Error("boom");
      },
      retry: false
    }));
    renderWithQueryClient(<AiImageGenerator showInsertAction={false} />, {
      queryClient: seededClient()
    });

    fireEvent.click(screen.getByText("ai-image-generator.tab-history"));

    expect(await screen.findByText("ai-image-generator.history-error")).toBeTruthy();
  });

  it("asks for a login instead of claiming an empty history when logged out", async () => {
    (useActiveAccount as Mock).mockReturnValue({ activeUser: null, username: null });
    renderWithQueryClient(<AiImageGenerator showInsertAction={false} />, {
      queryClient: seededClient()
    });

    fireEvent.click(screen.getByText("ai-image-generator.tab-history"));

    expect(await screen.findByText("ai-image-generator.history-login-required")).toBeTruthy();
    expect(screen.queryByText("ai-image-generator.history-empty")).toBeNull();
  });

  it("hides the insert action when insertion is not offered", async () => {
    renderWithQueryClient(<AiImageGenerator showInsertAction={false} />, {
      queryClient: seededClient(HISTORY)
    });

    fireEvent.click(screen.getByText("ai-image-generator.tab-history"));

    await waitFor(() =>
      expect(screen.getAllByText("ai-image-generator.download-button")).toHaveLength(2)
    );
    expect(screen.queryByText("ai-image-generator.insert-button")).toBeNull();
  });

  it("returns to the generate form when switching back", async () => {
    renderWithQueryClient(<AiImageGenerator showInsertAction={false} />, {
      queryClient: seededClient(HISTORY)
    });

    fireEvent.click(screen.getByText("ai-image-generator.tab-history"));
    expect(screen.queryByText("ai-image-generator.generate-button")).toBeNull();

    fireEvent.click(screen.getByText("ai-image-generator.tab-generate"));
    expect(screen.getByText("ai-image-generator.generate-button")).toBeTruthy();
  });
});
