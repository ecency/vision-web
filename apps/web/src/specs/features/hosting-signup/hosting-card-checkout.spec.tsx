import { HostingCardCheckout } from "@/features/hosting-signup/hosting-card-checkout";
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
    // the activation poll must use the id handed to onPaid (from the confirm result),
    // never one derived from state captured at render.
    confirmPaymentMock: vi.fn(async (_args: any) => {
      callOrder.push("confirmPayment");
      return { paymentIntent: { id: "pi_confirmed_888", status: "succeeded" } };
    }),
    mintMock: vi.fn(async (_args: any) => {
      callOrder.push("createIntent");
      return { client_secret: "pi_minted_host_secret_xyz" };
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

// The barrel hands HostingCardCheckout getStripePromise + skuUsdCents; keep the real
// tier helpers (skuUsdCents drives the Elements amount) and stub only the Stripe.js loader.
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

describe("HostingCardCheckout (deferred intent)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.callOrder.length = 0;
    h.elementsOptions.length = 0;
    h.mintMock.mockImplementation(async () => {
      h.callOrder.push("createIntent");
      return { client_secret: "pi_minted_host_secret_xyz" };
    });
    h.confirmPaymentMock.mockImplementation(async () => {
      h.callOrder.push("confirmPayment");
      return { paymentIntent: { id: "pi_confirmed_888", status: "succeeded" } };
    });
  });

  interface Overrides {
    hostingTarget?: string;
    onActivated?: () => void;
    onConfirmed?: () => void;
  }

  const checkout = ({
    hostingTarget,
    onActivated = vi.fn(),
    onConfirmed = vi.fn()
  }: Overrides = {}) => (
    <HostingCardCheckout
      username="alice"
      sku="200hosting"
      hostingTarget={hostingTarget}
      payLabel="hosting.pay-now"
      returnUrl="https://ecency.com/hosting"
      onActivated={onActivated}
      onConfirmed={onConfirmed}
    />
  );

  const clickPay = async () => {
    const payButton = await screen.findByRole("button", { name: "hosting.pay-now" });
    await waitFor(() => expect(payButton).not.toBeDisabled());
    fireEvent.click(payButton);
  };

  it("renders the payment form in deferred mode without creating an intent", async () => {
    render(checkout());
    // Opening the payment step must not mint: switching terms or abandoning the form
    // used to leave incomplete intents behind under the old mint-on-mount effect.
    expect(h.mintMock).not.toHaveBeenCalled();
    await screen.findByTestId("payment-element");
    expect(h.mintMock).not.toHaveBeenCalled();
    expect(h.confirmPaymentMock).not.toHaveBeenCalled();
    expect(h.elementsOptions[0]).toMatchObject({
      mode: "payment",
      amount: 200,
      currency: "usd"
    });
    expect(h.elementsOptions[0].clientSecret).toBeUndefined();
  });

  it("on Pay for a community: mints with hosting_target, confirms with the minted secret and polls with the confirmed id", async () => {
    const onActivated = vi.fn();
    const onConfirmed = vi.fn();
    render(checkout({ hostingTarget: "hive-125125", onActivated, onConfirmed }));

    await clickPay();

    await waitFor(() => expect(h.mintMock).toHaveBeenCalledTimes(1));
    // The mint carries the CURRENT target tenant so ePoints activates the community, not
    // the payer's own blog.
    expect(h.mintMock).toHaveBeenCalledWith({
      sku: "200hosting",
      nonce: expect.any(String),
      hosting_target: "hive-125125"
    });

    await waitFor(() => expect(h.confirmPaymentMock).toHaveBeenCalledTimes(1));
    // elements.submit ran BEFORE the intent was minted and the confirm used the fresh secret.
    expect(h.callOrder).toEqual(["elements.submit", "createIntent", "confirmPayment"]);
    expect(h.confirmPaymentMock).toHaveBeenCalledWith(
      expect.objectContaining({
        clientSecret: "pi_minted_host_secret_xyz",
        redirect: "if_required"
      })
    );

    // The activation poll queries with the CONFIRMED intent id from onPaid, not anything
    // derived from render-time state (which is empty under deferred minting).
    await waitFor(() => expect(h.statusMock).toHaveBeenCalledWith("alice", "pi_confirmed_888"));
    await waitFor(() => expect(onActivated).toHaveBeenCalledTimes(1));
    // onConfirmed fired when the poll started, so the parent locked the term selector.
    expect(onConfirmed).toHaveBeenCalledTimes(1);
  });

  it("sends no hosting_target for a personal blog (the payer's own account is activated)", async () => {
    render(checkout());

    await clickPay();

    await waitFor(() => expect(h.mintMock).toHaveBeenCalledTimes(1));
    expect((h.mintMock.mock.calls[0][0] as any).hosting_target).toBeUndefined();
    expect((h.mintMock.mock.calls[0][0] as any).sku).toBe("200hosting");
  });

  it("keeps the form mounted with a friendly message when the mint fails", async () => {
    h.mintMock.mockImplementation(async () => {
      h.callOrder.push("createIntent");
      throw new Error("Request failed with status code 500");
    });
    render(checkout());

    await clickPay();

    await screen.findByText("stripe-points.create-failed");
    // The raw axios message never surfaces and the form stays mounted for a retry.
    expect(screen.queryByText("Request failed with status code 500")).not.toBeInTheDocument();
    expect(screen.getByTestId("payment-element")).toBeInTheDocument();
    expect(h.confirmPaymentMock).not.toHaveBeenCalled();
    expect(h.statusMock).not.toHaveBeenCalled();
  });

  it("keeps the nonce across a same-target retry and regenerates it when the target changes", async () => {
    // Every confirm declines so the form stays mounted for the next Pay. The server
    // idempotency key is user:sku:nonce, so a changed target MUST carry a fresh nonce
    // (otherwise the mint replays the previous intent, activating the previous tenant)
    // while an unchanged retry MUST reuse the nonce so the retry stays idempotent.
    h.confirmPaymentMock.mockImplementation(async () => {
      h.callOrder.push("confirmPayment");
      return { error: { message: "stripe-decline-message" } };
    });
    const { rerender } = render(checkout({ hostingTarget: "hive-125125" }));

    await clickPay();
    await waitFor(() => expect(h.mintMock).toHaveBeenCalledTimes(1));

    // Retry with the SAME sku and target: the nonce must not change.
    await clickPay();
    await waitFor(() => expect(h.mintMock).toHaveBeenCalledTimes(2));

    // Switch the target tenant: fresh nonce and the payload follows the edit.
    rerender(checkout({ hostingTarget: "hive-999999" }));
    await clickPay();
    await waitFor(() => expect(h.mintMock).toHaveBeenCalledTimes(3));

    const payloads = h.mintMock.mock.calls.map((call) => call[0] as any);
    expect(payloads[1].nonce).toBe(payloads[0].nonce);
    expect(payloads[2].nonce).not.toBe(payloads[1].nonce);
    expect(payloads[2].hosting_target).toBe("hive-999999");
    expect(h.statusMock).not.toHaveBeenCalled();
  });
});
