import "@testing-library/jest-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { PerksPointsSpinBanner } from "@/app/perks/components/perks-points-spin-banner";

// vi.hoisted: the vi.mock factories below are hoisted above module scope, so the
// spies they close over have to be created there too.
const { claim, refetch, success, error, captureException } = vi.hoisted(() => ({
  claim: vi.fn(),
  refetch: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
  captureException: vi.fn()
}));

vi.mock("@sentry/nextjs", () => ({ captureException }));

vi.mock("@ecency/sdk", () => ({
  useGameClaim: () => ({ mutateAsync: claim, isPending: false, data: undefined }),
  getGameStatusCheckQueryOptions: () => ({ queryKey: ["games", "status", "spin"] })
}));

vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({ data: { remaining: 3, key: "spin-key" }, refetch })
}));

vi.mock("@/core/hooks/use-active-account", () => ({
  useActiveAccount: () => ({ activeUser: { username: "alice" } })
}));

vi.mock("@/features/shared", () => ({ success, error }));

vi.mock("@/features/points", () => ({
  PointsSpin: () => <div data-testid="spin-wheel" />,
  SPIN_VALUES: []
}));

vi.mock("@/utils", () => ({
  delay: vi.fn(async () => undefined),
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
});
