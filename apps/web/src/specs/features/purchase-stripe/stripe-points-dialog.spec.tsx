import { StripePointsDialog } from "@/features/shared/purchase-stripe/stripe-points-dialog";
import { cleanupModalContainers, setupModalContainers } from "@/specs/test-utils";
import "@testing-library/jest-dom";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Shapes the mocks exchange with the component under test; typed so the assertions on
// mock.calls stay checked instead of being cast through any.
interface MockElementsOptions {
  mode?: string;
  amount?: number;
  currency?: string;
  clientSecret?: string;
}

interface MintPayload {
  sku: string;
  nonce: string;
}

interface MockConfirmResult {
  paymentIntent?: { id: string; status: string };
  error?: { message: string };
}

// Shared stubs, hoisted so the vi.mock factories can reference them.
const h = vi.hoisted(() => ({
  elementsOptions: [] as MockElementsOptions[],
  submitMock: vi.fn(async (): Promise<{ error?: { message?: string } }> => ({})),
  confirmPaymentMock: vi.fn(
    async (): Promise<MockConfirmResult> => ({
      paymentIntent: { id: "pi_confirmed_555", status: "succeeded" }
    })
  ),
  mintMock: vi.fn(async (_payload: MintPayload) => ({
    client_secret: "pi_minted_555_secret_abc"
  })),
  statusMock: vi.fn(async (): Promise<{ status: string }> => ({ status: "pending" }))
}));

vi.mock("@stripe/react-stripe-js", async () => {
  const React = await import("react");
  return {
    Elements: ({ options, children }: { options: MockElementsOptions; children?: ReactNode }) => {
      h.elementsOptions.push(options);
      return React.createElement("div", { "data-testid": "elements" }, children);
    },
    useStripe: () => ({ confirmPayment: h.confirmPaymentMock }),
    useElements: () => ({ submit: h.submitMock }),
    PaymentElement: ({ onReady }: { onReady?: () => void }) => {
      React.useEffect(() => {
        onReady?.();
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, []);
      return React.createElement("div", { "data-testid": "payment-element" });
    }
  };
});

// Keep the real tier catalog + skuUsdCents (they drive the Elements amount) and stub only
// the Stripe.js loader so the pay step renders in jsdom.
vi.mock("@/features/shared/purchase-stripe/stripe-config", async () => ({
  ...(await vi.importActual<Record<string, unknown>>(
    "@/features/shared/purchase-stripe/stripe-tiers"
  )),
  getStripePromise: () => Promise.resolve({})
}));

vi.mock("@/features/shared/purchase-stripe/use-stripe-points-purchase", () => ({
  useCreateStripeIntent: () => ({ mutateAsync: h.mintMock, isPending: false }),
  fetchStripeOrderStatus: h.statusMock
}));

describe("StripePointsDialog (deferred intent)", () => {
  beforeEach(() => {
    setupModalContainers();
    vi.clearAllMocks();
    h.elementsOptions.length = 0;
    // Re-pin implementations: clearAllMocks resets calls but a per-test
    // mockImplementation would otherwise leak into the next test.
    h.mintMock.mockImplementation(async () => ({ client_secret: "pi_minted_555_secret_abc" }));
    h.statusMock.mockImplementation(async () => ({ status: "pending" }));
  });

  afterEach(() => {
    cleanupModalContainers();
  });

  const openDialog = (defaultSku?: string) =>
    render(<StripePointsDialog show={true} setShow={vi.fn()} defaultSku={defaultSku} />);

  it("advances to the pay step on Continue WITHOUT creating an intent", async () => {
    openDialog();

    fireEvent.click(screen.getByRole("button", { name: "stripe-points.continue" }));

    await screen.findByTestId("payment-element");
    // Browsing tiers and opening the payment form must not mint; the intent is created
    // only on the Pay click.
    expect(h.mintMock).not.toHaveBeenCalled();
    expect(h.elementsOptions[0]).toMatchObject({
      mode: "payment",
      amount: 999,
      currency: "usd"
    });
    expect(h.elementsOptions[0].clientSecret).toBeUndefined();
  });

  it("mints exactly once on Pay, with the selected sku and the session nonce", async () => {
    openDialog();

    // Select a non-default tier, then continue to the pay step.
    fireEvent.click(screen.getByText("$4.99"));
    fireEvent.click(screen.getByRole("button", { name: "stripe-points.continue" }));

    const payButton = await screen.findByRole("button", { name: "stripe-points.pay" });
    await waitFor(() => expect(payButton).not.toBeDisabled());
    expect(h.mintMock).not.toHaveBeenCalled();

    fireEvent.click(payButton);

    await waitFor(() => expect(h.mintMock).toHaveBeenCalledTimes(1));
    expect(h.mintMock).toHaveBeenCalledWith({ sku: "499points", nonce: expect.any(String) });
    expect(h.mintMock.mock.calls[0][0].nonce.length).toBeGreaterThan(0);

    // The confirm used the freshly minted secret, and the dialog moved on to delivery.
    await waitFor(() => expect(h.confirmPaymentMock).toHaveBeenCalledTimes(1));
    expect(h.confirmPaymentMock).toHaveBeenCalledWith(
      expect.objectContaining({ clientSecret: "pi_minted_555_secret_abc" })
    );
    await screen.findByText("stripe-points.delivering");
    expect(h.mintMock).toHaveBeenCalledTimes(1);
  });

  it("keeps the payment form mounted with the error when the mint fails", async () => {
    h.mintMock.mockImplementation(async () => {
      throw new Error("Request failed with status code 500");
    });
    openDialog();

    fireEvent.click(screen.getByRole("button", { name: "stripe-points.continue" }));
    const payButton = await screen.findByRole("button", { name: "stripe-points.pay" });
    await waitFor(() => expect(payButton).not.toBeDisabled());
    fireEvent.click(payButton);

    // The failure happens AFTER the buyer typed card details, so the dialog must not
    // jump to the terminal error step and throw the entered card away: the message
    // renders above the still-mounted form for an in-place retry.
    await screen.findByText("stripe-points.create-failed");
    expect(screen.getByTestId("payment-element")).toBeInTheDocument();
    expect(screen.queryByText("stripe-points.try-again")).not.toBeInTheDocument();
    expect(h.confirmPaymentMock).not.toHaveBeenCalled();

    // A retry clears the inline error and mints again with the same session nonce.
    h.mintMock.mockImplementation(async () => ({ client_secret: "pi_minted_555_secret_abc" }));
    fireEvent.click(payButton);
    await waitFor(() => expect(h.confirmPaymentMock).toHaveBeenCalledTimes(1));
    await screen.findByText("stripe-points.delivering");
    expect(screen.queryByText("stripe-points.create-failed")).not.toBeInTheDocument();
    const payloads = h.mintMock.mock.calls.map((call) => call[0]);
    expect(payloads[1].nonce).toBe(payloads[0].nonce);
  });

  it("keeps the form mounted after a decline and reuses the same intent on retry", async () => {
    h.confirmPaymentMock.mockImplementationOnce(async () => ({
      error: { message: "Your card was declined." }
    }));
    openDialog();

    fireEvent.click(screen.getByRole("button", { name: "stripe-points.continue" }));
    const payButton = await screen.findByRole("button", { name: "stripe-points.pay" });
    await waitFor(() => expect(payButton).not.toBeDisabled());
    fireEvent.click(payButton);

    // The intent WAS minted, then the confirm was declined: Stripe's message renders
    // above the still-mounted form instead of dead-ending on the terminal error step.
    await screen.findByText("Your card was declined.");
    expect(screen.getByTestId("payment-element")).toBeInTheDocument();
    expect(screen.queryByText("stripe-points.try-again")).not.toBeInTheDocument();
    expect(h.mintMock).toHaveBeenCalledTimes(1);

    // Retry: the session nonce is unchanged, so the re-mint hits the same server
    // idempotency key and returns the SAME intent instead of leaving another
    // incomplete one behind; the second confirm then succeeds with that secret.
    fireEvent.click(payButton);
    await screen.findByText("stripe-points.delivering");
    expect(h.confirmPaymentMock).toHaveBeenCalledTimes(2);
    expect(h.confirmPaymentMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ clientSecret: "pi_minted_555_secret_abc" })
    );
    const payloads = h.mintMock.mock.calls.map((call) => call[0]);
    expect(payloads).toHaveLength(2);
    expect(payloads[1].nonce).toBe(payloads[0].nonce);
    expect(screen.queryByText("Your card was declined.")).not.toBeInTheDocument();
  });

  it("falls back to the default tier when defaultSku is unknown", async () => {
    openDialog("nope");

    // The default tier tile is selected, so the dialog stays usable instead of carrying
    // an unknown sku into a zero-cent (and therefore empty) pay step.
    const defaultTile = screen.getByText("$9.99").closest("button");
    expect(defaultTile?.className).toContain("border-2");

    fireEvent.click(screen.getByRole("button", { name: "stripe-points.continue" }));
    await screen.findByTestId("payment-element");
    expect(h.elementsOptions[0]).toMatchObject({
      mode: "payment",
      amount: 999,
      currency: "usd"
    });
  });
});
