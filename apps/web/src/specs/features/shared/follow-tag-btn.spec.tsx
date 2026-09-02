import { fireEvent, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithQueryClient } from "@/specs/test-utils";
import { useActiveAccount } from "@/core/hooks/use-active-account";
import { FollowTagBtn, FollowTagChipToggle } from "@/features/shared/follow-tag-btn";

vi.mock("@/core/hooks/use-active-account", () => ({
  useActiveAccount: vi.fn()
}));

const addMock = vi.fn();
const deleteMock = vi.fn();
let followedTags: string[] = [];

vi.mock("@ecency/sdk", async () => {
  const actual = await vi.importActual<typeof import("@ecency/sdk")>("@ecency/sdk");
  return {
    ...actual,
    // The list the hook derives "followed" from: one request for every chip.
    getFavoriteTagsQueryOptions: vi.fn((username?: string) => ({
      queryKey: ["accounts", "favorite-tags", username],
      queryFn: async () =>
        followedTags.map((tag) => ({ _id: `id-${tag}`, tag, created: "", timestamp: 1 })),
      enabled: !!username
    })),
    useFavoriteTagAdd: vi.fn(() => ({ mutateAsync: addMock, isPending: false })),
    useFavoriteTagDelete: vi.fn(() => ({ mutateAsync: deleteMock, isPending: false }))
  };
});

// The hook refuses to toggle until the followed list has loaded, so a click
// straight after render is a no-op by design; wait for the list first.
const settled = (queryClient: { getQueryState: (key: unknown[]) => { status: string } | undefined }) =>
  waitFor(() =>
    expect(queryClient.getQueryState(["accounts", "favorite-tags", "alice"])?.status).toBe("success")
  );

const signedIn = () =>
  vi.mocked(useActiveAccount).mockReturnValue({ activeUser: { username: "alice" } } as never);
const signedOut = () => vi.mocked(useActiveAccount).mockReturnValue({ activeUser: null } as never);

describe("FollowTagBtn", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    followedTags = [];
  });

  it("follows a tag the user does not follow yet, in normalised form", async () => {
    signedIn();
    const { queryClient } = renderWithQueryClient(<FollowTagBtn tag="#Photography" />);
    await settled(queryClient);

    const button = await screen.findByRole("button", { name: "follow-tag.add" });
    expect(button).toHaveTextContent("follow-tag.follow");
    expect(button).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(button);

    expect(addMock).toHaveBeenCalledWith("photography");
    expect(deleteMock).not.toHaveBeenCalled();
  });

  it("unfollows a tag the user already follows", async () => {
    signedIn();
    followedTags = ["photography"];
    const { queryClient } = renderWithQueryClient(<FollowTagBtn tag="photography" />);
    await settled(queryClient);

    const button = await screen.findByRole("button", { name: "follow-tag.delete" });
    expect(button).toHaveTextContent("follow-tag.following");
    expect(button).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(button);

    expect(deleteMock).toHaveBeenCalledWith("photography");
    expect(addMock).not.toHaveBeenCalled();
  });

  // A signed-out reader still sees the control; activating it opens the login
  // modal instead of running the follow, which must never reach the network.
  it("shows the button to a signed-out reader without calling the API", () => {
    signedOut();
    renderWithQueryClient(<FollowTagBtn tag="photography" />);

    const button = screen.getByRole("button", { name: "follow-tag.add" });
    fireEvent.click(button);

    expect(addMock).not.toHaveBeenCalled();
    expect(deleteMock).not.toHaveBeenCalled();
  });

  it("renders nothing for a community or an unusable tag", () => {
    signedIn();
    const { container } = renderWithQueryClient(
      <>
        <FollowTagBtn tag="hive-139531" />
        <FollowTagBtn tag="not a tag" />
      </>
    );

    expect(container).toBeEmptyDOMElement();
  });
});

describe("FollowTagChipToggle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    followedTags = [];
  });

  it("toggles without letting the click reach the chip's link", async () => {
    signedIn();
    const linkClick = vi.fn();
    const { queryClient } = renderWithQueryClient(
      <a href="/created/photography" onClick={linkClick}>
        photography
        <FollowTagChipToggle tag="photography" />
      </a>
    );
    await settled(queryClient);

    const toggle = await screen.findByRole("button", { name: "follow-tag.add" });
    expect(toggle).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(toggle);

    expect(addMock).toHaveBeenCalledWith("photography");
    expect(linkClick).not.toHaveBeenCalled();
  });

  it("reads as followed and unfollows on activation, keyboard included", async () => {
    signedIn();
    followedTags = ["photography"];
    const { queryClient } = renderWithQueryClient(<FollowTagChipToggle tag="Photography" />);
    await settled(queryClient);

    const toggle = await screen.findByRole("button", { name: "follow-tag.delete" });
    expect(toggle).toHaveAttribute("aria-pressed", "true");

    fireEvent.keyDown(toggle, { key: "Enter" });

    expect(deleteMock).toHaveBeenCalledWith("photography");
  });

  it("renders nothing for a community tag", () => {
    signedIn();
    const { container } = renderWithQueryClient(<FollowTagChipToggle tag="hive-139531" />);

    expect(container).toBeEmptyDOMElement();
  });

  it("does not expose a pressed state to a signed-out reader", () => {
    signedOut();
    renderWithQueryClient(<FollowTagChipToggle tag="photography" />);

    const toggle = screen.getByRole("button", { name: "follow-tag.add" });
    expect(toggle).not.toHaveAttribute("aria-pressed");

    fireEvent.click(toggle);
    expect(addMock).not.toHaveBeenCalled();
  });
});
