import { fireEvent, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithQueryClient } from "@/specs/test-utils";
import { useActiveAccount } from "@/core/hooks/use-active-account";
import { getAccessToken } from "@/utils";
import { FavoriteTagsList } from "@/features/shared/bookmarks/favorite-tags-list";

vi.mock("@/core/hooks/use-active-account", () => ({
  useActiveAccount: vi.fn()
}));

vi.mock("@/features/shared", () => ({
  LinearProgress: () => <div data-testid="progress" />,
  success: vi.fn(),
  error: vi.fn()
}));

// The global @/utils mock keeps only two members; the tag link helper needs isCommunity.
vi.mock("@/utils", async () => ({
  ...(await vi.importActual<typeof import("@/utils")>("@/utils")),
  random: vi.fn(),
  getAccessToken: vi.fn(() => "mock-token")
}));

let listFailures = 0;
let rows: string[] = [];

vi.mock("@ecency/sdk", async () => {
  const actual = await vi.importActual<typeof import("@ecency/sdk")>("@ecency/sdk");
  return {
    ...actual,
    getFavoriteTagsInfiniteQueryOptions: vi.fn((username?: string, code?: string, limit = 10) => ({
      queryKey: ["accounts", "favorite-tags", "infinite", username, limit],
      queryFn: async () => {
        if (listFailures > 0) {
          listFailures -= 1;
          throw new Error("list failed");
        }
        return {
          data: rows.map((tag) => ({ _id: `id-${tag}`, tag, created: "", timestamp: 1 })),
          pagination: { total: rows.length, limit, offset: 0, has_next: false }
        };
      },
      initialPageParam: 0,
      getNextPageParam: () => undefined,
      enabled: !!username && !!code
    })),
    useFavoriteTagDelete: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false }))
  };
});

describe("FavoriteTagsList", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listFailures = 0;
    rows = [];
    vi.mocked(useActiveAccount).mockReturnValue({ activeUser: { username: "alice" } } as never);
    vi.mocked(getAccessToken).mockReturnValue("mock-token");
  });

  it("lists the followed tags", async () => {
    rows = ["photography", "contest-2026"];
    renderWithQueryClient(<FavoriteTagsList onHide={vi.fn()} />);

    expect(await screen.findByText("#photography")).toBeInTheDocument();
    expect(screen.getByText("#contest-2026")).toBeInTheDocument();
    expect(screen.queryByTestId("progress")).not.toBeInTheDocument();
  });

  // A disabled query with nothing cached stays pending forever; the spinner must
  // not, so the list reads isLoading rather than isPending.
  it("does not spin forever when the account has no access token", () => {
    vi.mocked(getAccessToken).mockReturnValue(undefined as never);
    renderWithQueryClient(<FavoriteTagsList onHide={vi.fn()} />);

    expect(screen.queryByTestId("progress")).not.toBeInTheDocument();
    expect(screen.getByText("g.empty-list")).toBeInTheDocument();
  });

  it("shows a failed request as an error with a retry, not as an empty list", async () => {
    rows = ["photography"];
    listFailures = 1;
    renderWithQueryClient(<FavoriteTagsList onHide={vi.fn()} />);

    expect(await screen.findByText("g.server-error")).toBeInTheDocument();
    expect(screen.queryByText("g.empty-list")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "g.retry" }));

    expect(await screen.findByText("#photography")).toBeInTheDocument();
  });
});
