import { ProCheckout } from "@/features/pro/pro-checkout";
import "@testing-library/jest-dom";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Shared stubs, hoisted so the vi.mock factories (which run before top-level consts
// initialize) can reference them. callOrder pins the deferred sequence: validate the
// Payment Element FIRST, mint the intent second, confirm third.
const h = vi.hoisted(() => {
  const callOrder: string[] = [];
  return {
    callOrder,
    elementsOptions: [] as any[],
    submitMock: vi.fn(async () => {
      callOrder.push("elements.submit");
      return {};
    }),
    // The confirmed intent id is DELIBERATELY different from the minted secret's prefix:
    // the delivery poll must use the id handed to onPaid (from the confirm result), never
    // one derived from state captured at render.
    confirmPaymentMock: vi.fn(async (_args: any) => {
      callOrder.push("confirmPayment");
      return { paymentIntent: { id: "pi_confirmed_777", status: "succeeded" } };
    }),
    mintMock: vi.fn(async (_args: any) => {
      callOrder.push("createIntent");
      return { client_secret: "pi_minted_abc_secret_xyz" };
    }),
    statusMock: vi.fn(async (_username: string, _intentId: string) => ({ status: "success" }))
  };
});

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

// The barrel hands ProCheckout getStripePromise + skuUsdCents; keep the real tier helpers
// (skuUsdCents drives the Elements amount) and stub only the Stripe.js loader.
vi.mock("@/features/shared/purchase-stripe", async () => ({
  ...(await vi.importActual<Record<string, unknown>>(
    "@/features/shared/purchase-stripe/stripe-tiers"
  )),
  getStripePromise: () => Promise.resolve({})
}));

vi.mock("@/features/shared/purchase-stripe/use-stripe-points-purchase", () => ({
  useCreateStripeIntent: () => ({ mutateAsync: h.mintMock, isPending: false }),
  fetchStripeOrderStatus: h.statusMock
}));

describe("ProCheckout (deferred intent)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.callOrder.length = 0;
    h.elementsOptions.length = 0;
    h.mintMock.mockImplementation(async () => {
      h.callOrder.push("createIntent");
      return { client_secret: "pi_minted_abc_secret_xyz" };
    });
  });

  const renderCheckout = (onActivated = vi.fn()) => {
    render(
      <ProCheckout
        username="alice"
        returnUrl="https://ecency.com/perks?pro=1"
        onActivated={onActivated}
      />
    );
    return onActivated;
  };

  it("renders the payment form without creating an intent", async () => {
    renderCheckout();
    // Opening the checkout must not mint: the production ratio of abandoned to paid
    // intents came from the old mint-on-mount effect.
    expect(h.mintMock).not.toHaveBeenCalled();
    await screen.findByTestId("payment-element");
    expect(h.mintMock).not.toHaveBeenCalled();
    expect(h.confirmPaymentMock).not.toHaveBeenCalled();
  });

  it("initializes Elements in deferred mode with the Pro price in cents", async () => {
    renderCheckout();
    await screen.findByTestId("elements");
    expect(h.elementsOptions[0]).toMatchObject({
      mode: "payment",
      amount: 1999,
      currency: "usd"
    });
    expect(h.elementsOptions[0].clientSecret).toBeUndefined();
  });

  it("on Pay: validates the element, mints, confirms with the minted secret and polls with the confirmed id", async () => {
    const onActivated = renderCheckout();

    const payButton = await screen.findByRole("button", { name: "pro.pay-now" });
    await waitFor(() => expect(payButton).not.toBeDisabled());
    fireEvent.click(payButton);

    await waitFor(() => expect(h.mintMock).toHaveBeenCalledTimes(1));
    expect(h.mintMock).toHaveBeenCalledWith({ sku: "1999pro", nonce: expect.any(String) });
    expect((h.mintMock.mock.calls[0][0] as any).nonce.length).toBeGreaterThan(0);

    await waitFor(() => expect(h.confirmPaymentMock).toHaveBeenCalledTimes(1));
    // elements.submit ran BEFORE the intent was minted, and the confirm used the fresh secret.
    expect(h.callOrder).toEqual(["elements.submit", "createIntent", "confirmPayment"]);
    expect(h.confirmPaymentMock).toHaveBeenCalledWith(
      expect.objectContaining({
        clientSecret: "pi_minted_abc_secret_xyz",
        redirect: "if_required"
      })
    );

    // The delivery poll queries with the CONFIRMED intent id from onPaid, not anything
    // derived from render-time state (which is empty under deferred minting).
    await waitFor(() => expect(h.statusMock).toHaveBeenCalledWith("alice", "pi_confirmed_777"));
    await waitFor(() => expect(onActivated).toHaveBeenCalledTimes(1));
  });

  it("keeps the form mounted with a friendly message when the mint fails", async () => {
    h.mintMock.mockImplementation(async () => {
      h.callOrder.push("createIntent");
      throw new Error("Request failed with status code 500");
    });
    renderCheckout();

    const payButton = await screen.findByRole("button", { name: "pro.pay-now" });
    await waitFor(() => expect(payButton).not.toBeDisabled());
    fireEvent.click(payButton);

    await screen.findByText("stripe-points.create-failed");
    // The raw axios message never surfaces and the form stays mounted for a retry.
    expect(screen.queryByText("Request failed with status code 500")).not.toBeInTheDocument();
    expect(screen.getByTestId("payment-element")).toBeInTheDocument();
    expect(h.confirmPaymentMock).not.toHaveBeenCalled();
    expect(h.statusMock).not.toHaveBeenCalled();
  });
});
