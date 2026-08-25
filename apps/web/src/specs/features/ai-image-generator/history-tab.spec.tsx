import { createTestQueryClient, renderWithQueryClient } from "@/specs/test-utils";
import { fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";

vi.mock("@/utils", async () => ({
  ...(await vi.importActual("@/utils")),
  random: vi.fn(),
  getAccessToken: vi.fn(() => "mock-token"),
  ensureValidToken: vi.fn(async () => "mock-token")
}));

import { useActiveAccount } from "@/core/hooks/use-active-account";
import { useGenerateImage } from "@ecency/sdk";
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
  queryClient.setQueryData(["ai", "prices"], {
    prices: [{ aspect_ratio: "1:1", cost: 150 }],
    power: [{ power: 1, multiplier: 1 }]
  });
  if (history) {
    queryClient.setQueryData(["ai", "images", "alice"], history);
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
  });

  it("lists the user's delivered generations with insert and download actions", () => {
    const onInsert = vi.fn();
    renderWithQueryClient(<AiImageGenerator onInsert={onInsert} showInsertAction={true} />, {
      queryClient: seededClient(HISTORY)
    });

    fireEvent.click(screen.getByText("ai-image-generator.tab-history"));

    expect(screen.getByText("Opportunity follows difficulty")).toBeTruthy();
    expect(screen.getByText("Claim Ecency points")).toBeTruthy();

    fireEvent.click(screen.getAllByText("ai-image-generator.insert-button")[0]);
    expect(onInsert).toHaveBeenCalledWith("https://images.test/one.webp");
  });

  it("shows the empty state when there are no generations yet", () => {
    renderWithQueryClient(<AiImageGenerator showInsertAction={false} />, {
      queryClient: seededClient([])
    });

    fireEvent.click(screen.getByText("ai-image-generator.tab-history"));

    expect(screen.getByText("ai-image-generator.history-empty")).toBeTruthy();
  });

  it("hides the insert action when insertion is not offered", () => {
    renderWithQueryClient(<AiImageGenerator showInsertAction={false} />, {
      queryClient: seededClient(HISTORY)
    });

    fireEvent.click(screen.getByText("ai-image-generator.tab-history"));

    expect(screen.queryByText("ai-image-generator.insert-button")).toBeNull();
    expect(screen.getAllByText("ai-image-generator.download-button")).toHaveLength(2);
  });

  it("returns to the generate form when switching back", () => {
    renderWithQueryClient(<AiImageGenerator showInsertAction={false} />, {
      queryClient: seededClient(HISTORY)
    });

    fireEvent.click(screen.getByText("ai-image-generator.tab-history"));
    expect(screen.queryByText("ai-image-generator.generate-button")).toBeNull();

    fireEvent.click(screen.getByText("ai-image-generator.tab-generate"));
    expect(screen.getByText("ai-image-generator.generate-button")).toBeTruthy();
  });
});
