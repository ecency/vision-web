import "@testing-library/jest-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { PerksPointsSpinBanner } from "@/app/perks/components/perks-points-spin-banner";

// vi.hoisted: the vi.mock factories below are hoisted above module scope, so the
// spies they close over have to be created there too.
const { claim, refetch, success, error, captureException, status, delay } = vi.hoisted(() => ({
  claim: vi.fn(),
  refetch: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
  captureException: vi.fn(),
  delay: vi.fn(),
  // when the spin status on screen was loaded, as useQuery reports it
  status: { dataUpdatedAt: 1, remaining: 3, username: "alice" }
}));

// a status reload that succeeds: the status on screen is newer than any claim so far
function reloadSucceeds() {
  status.dataUpdatedAt = Date.now() + 1;
}

vi.mock("@sentry/nextjs", () => ({ captureException }));

vi.mock("@ecency/sdk", () => ({
  useGameClaim: () => ({ mutateAsync: claim, isPending: false, data: undefined }),
  getGameStatusCheckQueryOptions: (username: string) => ({
    queryKey: ["games", "status", "spin", username]
  })
}));

vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({
    data: { remaining: status.remaining, key: "spin-key" },
    dataUpdatedAt: status.dataUpdatedAt
  }),
  // the banner reloads the status through the query client, by key
  useQueryClient: () => ({ refetchQueries: refetch })
}));

vi.mock("@/core/hooks/use-active-account", () => ({
  useActiveAccount: () => ({ activeUser: { username: status.username } })
}));

vi.mock("@/features/shared", () => ({ success, error }));

vi.mock("@/features/points", () => ({
  PointsSpin: () => <div data-testid="spin-wheel" />,
  SPIN_VALUES: []
}));

vi.mock("@/utils", () => ({
  delay,
  getAccessToken: vi.fn(() => "hs-token")
}));

vi.mock("@/app/perks/components/perks-points-spin-countdown", () => ({
  PerksPointsSpinCountdown: () => <span>Spin</span>
}));

// Minimal stand-ins: the modal must render its children unconditionally so the
// claim button is reachable without driving the real dialog's open animation.
vi.mock("@/features/ui", () => ({
  Button: ({ children, ...props }: any) => <button {...props}>{children}</button>,
  Modal: ({ children }: any) => <div>{children}</div>,
  ModalBody: ({ children }: any) => <div>{children}</div>,
  ModalFooter: ({ children }: any) => <div>{children}</div>,
  ModalHeader: ({ children }: any) => <div>{children}</div>,
  StyledTooltip: ({ children }: any) => <div>{children}</div>
}));

vi.mock("next/image", () => ({
  __esModule: true,
  default: ({ alt }: { alt: string }) => <img alt={alt} />
}));

function clickClaim() {
  fireEvent.click(screen.getByRole("button", { name: "Spin" }));
}

describe("PerksPointsSpinBanner", () => {
  beforeEach(() => {
    claim.mockReset();
    refetch.mockReset();
    delay.mockReset();
    delay.mockImplementation(async () => undefined);
    refetch.mockImplementation(reloadSucceeds);
    status.dataUpdatedAt = 1;
    status.remaining = 3;
    status.username = "alice";
    success.mockReset();
    error.mockReset();
    captureException.mockReset();
  });

  // Regression guard for ECENCY-NEXT-1FCJ: the claim used to be awaited with no
  // catch, so an edge failure escaped this click handler as an unhandled rejection.
  it("shows the error toast and skips the success toast and the refetch on a failed claim", async () => {
    claim.mockRejectedValue(new Error("[SDK][Games] – failed with status 502"));

    render(<PerksPointsSpinBanner />);
    clickClaim();

    await waitFor(() => expect(error).toHaveBeenCalledWith("perks.spin-error"));
    expect(success).not.toHaveBeenCalled();
    expect(refetch).not.toHaveBeenCalled();
    // Catching the rejection removes the unhandled-rejection signal, so the
    // failure has to be reported explicitly or spin outages go dark.
    expect(captureException).toHaveBeenCalledTimes(1);
  });

  it("refetches the spin status and shows the success toast on a successful claim", async () => {
    claim.mockResolvedValue({ score: 50 });

    render(<PerksPointsSpinBanner />);
    clickClaim();

    await waitFor(() => expect(success).toHaveBeenCalledWith("perks.spin-success"));
    expect(refetch).toHaveBeenCalledTimes(1);
    expect(error).not.toHaveBeenCalled();
    expect(captureException).not.toHaveBeenCalled();
  });

  // The button stayed live while a claim was in flight, so impatient clicks sent
  // the same spin several times and every duplicate surfaced as an error toast.
  it("sends one claim however many times the button is clicked while it is in flight", async () => {
    let finishClaim: (value: { score: number }) => void = () => undefined;
    claim.mockImplementation(
      () => new Promise<{ score: number }>((resolve) => (finishClaim = resolve))
    );

    render(<PerksPointsSpinBanner />);
    clickClaim();
    clickClaim();
    clickClaim();

    expect(claim).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.getByRole("button", { name: "Spin" })).toBeDisabled());

    finishClaim({ score: 50 });
    await waitFor(() => expect(success).toHaveBeenCalledTimes(1));
    expect(error).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.getByRole("button", { name: "Spin" })).toBeEnabled());
  });

  // After a successful claim the status on screen still offers the spin that was
  // just used. If the reload fails, the button must not come back with it.
  it("keeps the button disabled after a claim until a newer status has loaded", async () => {
    claim.mockResolvedValue({ score: 50 });
    refetch.mockImplementation(() => undefined);

    const { rerender } = render(<PerksPointsSpinBanner />);
    clickClaim();
    await waitFor(() => expect(success).toHaveBeenCalledTimes(1));
    expect(refetch).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Spin" })).toBeDisabled();

    clickClaim();
    expect(claim).toHaveBeenCalledTimes(1);

    reloadSucceeds();
    rerender(<PerksPointsSpinBanner />);
    expect(screen.getByRole("button", { name: "Spin" })).toBeEnabled();
  });

  // A status request that was already in flight when the claim was sent can land
  // after it, still offering the used spin. It is newer than the claim, but it was
  // not requested after it.
  it("is not released by a status that was requested before the claim and lands after it", async () => {
    claim.mockResolvedValue({ score: 50 });
    refetch.mockImplementation(() => undefined);
    delay.mockImplementation(async () => {
      status.dataUpdatedAt = Date.now();
      await new Promise((resolve) => setTimeout(resolve, 5));
    });

    const { rerender } = render(<PerksPointsSpinBanner />);
    clickClaim();
    await waitFor(() => expect(success).toHaveBeenCalledTimes(1));
    rerender(<PerksPointsSpinBanner />);
    expect(screen.getByRole("button", { name: "Spin" })).toBeDisabled();

    clickClaim();
    expect(claim).toHaveBeenCalledTimes(1);

    reloadSucceeds();
    rerender(<PerksPointsSpinBanner />);
    expect(screen.getByRole("button", { name: "Spin" })).toBeEnabled();
  });

  it("does not block another account while the first account's claim is in flight", async () => {
    let finishClaim: (value: { score: number }) => void = () => undefined;
    claim.mockImplementationOnce(
      () => new Promise<{ score: number }>((resolve) => (finishClaim = resolve))
    );

    const { rerender } = render(<PerksPointsSpinBanner />);
    clickClaim();
    await waitFor(() => expect(screen.getByRole("button", { name: "Spin" })).toBeDisabled());

    status.username = "bob";
    rerender(<PerksPointsSpinBanner />);
    expect(screen.getByRole("button", { name: "Spin" })).toBeEnabled();

    // bob claims; alice's claim finishing must not release bob's button
    let finishBob: (value: { score: number }) => void = () => undefined;
    claim.mockImplementationOnce(
      () => new Promise<{ score: number }>((resolve) => (finishBob = resolve))
    );
    clickClaim();
    await waitFor(() => expect(screen.getByRole("button", { name: "Spin" })).toBeDisabled());
    finishClaim({ score: 50 });
    await waitFor(() => expect(success).toHaveBeenCalledTimes(1));
    expect(screen.getByRole("button", { name: "Spin" })).toBeDisabled();

    finishBob({ score: 50 });
    await waitFor(() => expect(success).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.getByRole("button", { name: "Spin" })).toBeEnabled());
  });

  it("keeps each account's hold when several accounts claimed and no reload succeeded", async () => {
    claim.mockResolvedValue({ score: 50 });
    refetch.mockImplementation(() => undefined);

    const { rerender } = render(<PerksPointsSpinBanner />);
    clickClaim();
    await waitFor(() => expect(success).toHaveBeenCalledTimes(1));

    status.username = "bob";
    rerender(<PerksPointsSpinBanner />);
    clickClaim();
    await waitFor(() => expect(success).toHaveBeenCalledTimes(2));
    expect(screen.getByRole("button", { name: "Spin" })).toBeDisabled();

    // back to alice: her status is still the one from before her claim
    status.username = "alice";
    rerender(<PerksPointsSpinBanner />);
    expect(screen.getByRole("button", { name: "Spin" })).toBeDisabled();
    clickClaim();
    expect(claim).toHaveBeenCalledTimes(2);
  });

  it("keeps the first account's claim in flight after a switch away and back", async () => {
    let finishAlice: (value: { score: number }) => void = () => undefined;
    claim.mockImplementationOnce(
      () => new Promise<{ score: number }>((resolve) => (finishAlice = resolve))
    );
    let finishBob: (value: { score: number }) => void = () => undefined;
    claim.mockImplementationOnce(
      () => new Promise<{ score: number }>((resolve) => (finishBob = resolve))
    );

    const { rerender } = render(<PerksPointsSpinBanner />);
    clickClaim();
    status.username = "bob";
    rerender(<PerksPointsSpinBanner />);
    clickClaim();
    expect(claim).toHaveBeenCalledTimes(2);

    status.username = "alice";
    rerender(<PerksPointsSpinBanner />);
    expect(screen.getByRole("button", { name: "Spin" })).toBeDisabled();
    clickClaim();
    expect(claim).toHaveBeenCalledTimes(2);

    finishAlice({ score: 50 });
    finishBob({ score: 50 });
    await waitFor(() => expect(success).toHaveBeenCalledTimes(2));
  });

  // The reload must go to the account that claimed. After a switch the query on
  // screen is the other account's, and reloading that one would leave the claimant
  // held with a status that is never asked for again.
  it("reloads the status of the account that claimed after a switch during the claim", async () => {
    let finishClaim: (value: { score: number }) => void = () => undefined;
    claim.mockImplementationOnce(
      () => new Promise<{ score: number }>((resolve) => (finishClaim = resolve))
    );

    const { rerender } = render(<PerksPointsSpinBanner />);
    clickClaim();
    status.username = "bob";
    rerender(<PerksPointsSpinBanner />);

    finishClaim({ score: 50 });
    await waitFor(() => expect(refetch).toHaveBeenCalledTimes(1));
    expect(refetch).toHaveBeenCalledWith({ queryKey: ["games", "status", "spin", "alice"] });
  });

  it("does not hold another account to the status age of the account that claimed", async () => {
    claim.mockResolvedValue({ score: 50 });
    refetch.mockImplementation(() => undefined);

    const { rerender } = render(<PerksPointsSpinBanner />);
    clickClaim();
    await waitFor(() => expect(success).toHaveBeenCalledTimes(1));
    expect(screen.getByRole("button", { name: "Spin" })).toBeDisabled();

    // bob's status was loaded before alice claimed, and is still his current status
    status.username = "bob";
    rerender(<PerksPointsSpinBanner />);
    expect(screen.getByRole("button", { name: "Spin" })).toBeEnabled();
  });

  it("is not confused by an account name that matches a built-in object key", () => {
    status.username = "constructor";

    render(<PerksPointsSpinBanner />);
    expect(screen.getByRole("button", { name: "Spin" })).toBeEnabled();
  });

  it("disables the button when no spins remain", () => {
    status.remaining = 0;

    render(<PerksPointsSpinBanner />);
    expect(screen.getByRole("button", { name: "Spin" })).toBeDisabled();
    clickClaim();
    expect(claim).not.toHaveBeenCalled();
  });

  it("lets the user spin again after a failed claim", async () => {
    claim.mockRejectedValueOnce(new Error("[SDK][Games] – failed with status 502"));
    claim.mockResolvedValueOnce({ score: 50 });

    render(<PerksPointsSpinBanner />);
    clickClaim();
    await waitFor(() => expect(error).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByRole("button", { name: "Spin" })).toBeEnabled());

    clickClaim();
    await waitFor(() => expect(success).toHaveBeenCalledTimes(1));
    expect(claim).toHaveBeenCalledTimes(2);
  });
});
