import { StripePointsDialog } from "@/features/shared/purchase-stripe/stripe-points-dialog";
import { cleanupModalContainers, setupModalContainers } from "@/specs/test-utils";
import "@testing-library/jest-dom";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Shared stubs, hoisted so the vi.mock factories can reference them.
const h = vi.hoisted(() => ({
  elementsOptions: [] as any[],
  submitMock: vi.fn(async () => ({})),
  confirmPaymentMock: vi.fn(async (_args: any) => ({
    paymentIntent: { id: "pi_confirmed_555", status: "succeeded" }
  })),
  mintMock: vi.fn(async (_args: any) => ({ client_secret: "pi_minted_555_secret_abc" })),
  statusMock: vi.fn(async () => ({ status: "pending" }))
}));

vi.mock("@stripe/react-stripe-js", async () => {
  const React = await import("react");
  return {
    Elements: ({ options, children }: any) => {
      h.elementsOptions.push(options);
      return React.createElement("div", { "data-testid": "elements" }, children);
    },
    useStripe: () => ({ confirmPayment: h.confirmPaymentMock }),
    useElements: () => ({ submit: h.submitMock }),
    PaymentElement: ({ onReady }: any) => {
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
  });

  afterEach(() => {
    cleanupModalContainers();
  });

  const openDialog = () => render(<StripePointsDialog show={true} setShow={vi.fn()} />);

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
    expect((h.mintMock.mock.calls[0][0] as any).nonce.length).toBeGreaterThan(0);

    // The confirm used the freshly minted secret, and the dialog moved on to delivery.
    await waitFor(() => expect(h.confirmPaymentMock).toHaveBeenCalledTimes(1));
    expect(h.confirmPaymentMock).toHaveBeenCalledWith(
      expect.objectContaining({ clientSecret: "pi_minted_555_secret_abc" })
    );
    await screen.findByText("stripe-points.delivering");
    expect(h.mintMock).toHaveBeenCalledTimes(1);
  });
});
