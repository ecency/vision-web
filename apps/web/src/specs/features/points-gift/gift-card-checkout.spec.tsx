import { GiftCardCheckout } from "@/features/points-gift/gift-card-checkout";
import "@testing-library/jest-dom";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// A promise resolvable from the test body, to hold the confirm in flight while the
// submitting lock is asserted.
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

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
  gift_recipient?: string;
  gift_message?: string;
}

interface MockConfirmResult {
  paymentIntent?: { id: string; status: string };
  error?: { message: string };
}

// Shared stubs, hoisted so the vi.mock factories (which run before top-level consts
// initialize) can reference them. callOrder pins the deferred sequence: validate the
// Payment Element FIRST, mint the intent second, confirm third.
const h = vi.hoisted(() => {
  const callOrder: string[] = [];
  return {
    callOrder,
    elementsOptions: [] as MockElementsOptions[],
    submitMock: vi.fn(async () => {
      callOrder.push("elements.submit");
      return {};
    }),
    // The confirmed intent id is DELIBERATELY different from the minted secret's prefix:
    // the delivery poll must use the id handed to onPaid (from the confirm result), never
    // one derived from state captured at render.
    confirmPaymentMock: vi.fn(async (): Promise<MockConfirmResult> => {
      callOrder.push("confirmPayment");
      return { paymentIntent: { id: "pi_confirmed_777", status: "succeeded" } };
    }),
    mintMock: vi.fn(async (_payload: MintPayload) => {
      callOrder.push("createIntent");
      return { client_secret: "pi_minted_abc_secret_xyz" };
    }),
    statusMock: vi.fn(async (_username: string, _intentId: string) => ({ status: "success" }))
  };
});

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

// The barrel hands GiftCardCheckout getStripePromise + skuUsdCents; keep the real tier
// helpers (skuUsdCents drives the Elements amount) and stub only the Stripe.js loader.
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

describe("GiftCardCheckout (deferred intent)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.callOrder.length = 0;
    h.elementsOptions.length = 0;
    h.mintMock.mockImplementation(async () => {
      h.callOrder.push("createIntent");
      return { client_secret: "pi_minted_abc_secret_xyz" };
    });
    h.confirmPaymentMock.mockImplementation(async () => {
      h.callOrder.push("confirmPayment");
      return { paymentIntent: { id: "pi_confirmed_777", status: "succeeded" } };
    });
  });

  interface Overrides {
    recipient?: string;
    message?: string;
    onDelivered?: () => void;
    onConfirmed?: () => void;
    onSubmittingChange?: (submitting: boolean) => void;
  }

  const checkout = ({
    recipient = "friend-a",
    message = "happy birthday",
    onDelivered = vi.fn(),
    onConfirmed = vi.fn(),
    onSubmittingChange
  }: Overrides = {}) => (
    <GiftCardCheckout
      username="alice"
      sku="999points"
      recipient={recipient}
      message={message}
      payLabel="points-gift.pay"
      returnUrl="https://ecency.com/points-gift"
      onDelivered={onDelivered}
      onConfirmed={onConfirmed}
      onSubmittingChange={onSubmittingChange}
    />
  );

  const clickPay = async () => {
    const payButton = await screen.findByRole("button", { name: "points-gift.pay" });
    await waitFor(() => expect(payButton).not.toBeDisabled());
    fireEvent.click(payButton);
  };

  it("renders the payment form in deferred mode without creating an intent", async () => {
    render(checkout());
    // Opening the gift checkout must not mint: the production ratio of abandoned to paid
    // intents came from the old mint-on-mount effect.
    expect(h.mintMock).not.toHaveBeenCalled();
    await screen.findByTestId("payment-element");
    expect(h.mintMock).not.toHaveBeenCalled();
    expect(h.confirmPaymentMock).not.toHaveBeenCalled();
    expect(h.elementsOptions[0]).toMatchObject({
      mode: "payment",
      amount: 999,
      currency: "usd"
    });
    expect(h.elementsOptions[0].clientSecret).toBeUndefined();
  });

  it("on Pay: mints with the gift fields, confirms with the minted secret and polls with the confirmed id", async () => {
    const onDelivered = vi.fn();
    const onConfirmed = vi.fn();
    render(checkout({ message: " happy birthday ", onDelivered, onConfirmed }));

    await clickPay();

    await waitFor(() => expect(h.mintMock).toHaveBeenCalledTimes(1));
    // The mint carries the CURRENT gift fields (message trimmed) so ePoints credits the
    // recipient, not the payer.
    expect(h.mintMock).toHaveBeenCalledWith({
      sku: "999points",
      nonce: expect.any(String),
      gift_recipient: "friend-a",
      gift_message: "happy birthday"
    });

    await waitFor(() => expect(h.confirmPaymentMock).toHaveBeenCalledTimes(1));
    // elements.submit ran BEFORE the intent was minted and the confirm used the fresh secret.
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
    await waitFor(() => expect(onDelivered).toHaveBeenCalledTimes(1));
    // onConfirmed fired when the poll started, so the parent locked the form before delivery.
    expect(onConfirmed).toHaveBeenCalledTimes(1);
  });

  it("sends no gift_message when the message is whitespace only", async () => {
    render(checkout({ message: "   " }));

    await clickPay();

    await waitFor(() => expect(h.mintMock).toHaveBeenCalledTimes(1));
    expect(h.mintMock.mock.calls[0][0].gift_message).toBeUndefined();
    expect(h.mintMock.mock.calls[0][0].gift_recipient).toBe("friend-a");
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

  it("keeps the nonce across a same-gift retry and regenerates it when recipient or message changes", async () => {
    // Every confirm declines so the form stays mounted for the next Pay. This mirrors the
    // real hazard: pay for A, decline, edit the gift, pay again. The server idempotency
    // key is user:sku:nonce, so an edited gift MUST carry a fresh nonce (otherwise the
    // mint replays the previous intent with the previous gift metadata) while an
    // unchanged retry MUST reuse the nonce (so the retry stays idempotent).
    h.confirmPaymentMock.mockImplementation(async () => {
      h.callOrder.push("confirmPayment");
      return { error: { message: "stripe-decline-message" } };
    });
    const { rerender } = render(checkout());

    await clickPay();
    await waitFor(() => expect(h.mintMock).toHaveBeenCalledTimes(1));

    // Retry with the SAME sku, recipient and message: the nonce must not change.
    await clickPay();
    await waitFor(() => expect(h.mintMock).toHaveBeenCalledTimes(2));

    // Edit only the message: fresh nonce.
    rerender(checkout({ message: "happy new year" }));
    await clickPay();
    await waitFor(() => expect(h.mintMock).toHaveBeenCalledTimes(3));

    // Edit only the recipient: fresh nonce again and the payload follows the edit.
    rerender(checkout({ recipient: "friend-b", message: "happy new year" }));
    await clickPay();
    await waitFor(() => expect(h.mintMock).toHaveBeenCalledTimes(4));

    const payloads = h.mintMock.mock.calls.map((call) => call[0]);
    expect(payloads[1].nonce).toBe(payloads[0].nonce);
    expect(payloads[2].nonce).not.toBe(payloads[1].nonce);
    expect(payloads[3].nonce).not.toBe(payloads[2].nonce);
    expect(payloads[3].gift_recipient).toBe("friend-b");
    expect(payloads[3].gift_message).toBe("happy new year");
    expect(h.statusMock).not.toHaveBeenCalled();
  });

  it("forwards onSubmittingChange: true while the confirm is pending, false after a decline", async () => {
    const confirmGate = deferred<MockConfirmResult>();
    h.confirmPaymentMock.mockImplementation(() => {
      h.callOrder.push("confirmPayment");
      return confirmGate.promise;
    });
    const onSubmittingChange = vi.fn();
    render(checkout({ onSubmittingChange }));

    await clickPay();

    // While the confirm is in flight the parent has been told to lock the gift selection
    // controls (recipient, message, pack): a change now would remount the keyed checkout
    // under a charge that can still complete server side.
    await waitFor(() => expect(h.confirmPaymentMock).toHaveBeenCalledTimes(1));
    expect(onSubmittingChange).toHaveBeenCalledWith(true);
    expect(onSubmittingChange).not.toHaveBeenCalledWith(false);

    // A decline settles the submit: the parent unlocks so the buyer can edit and retry.
    await act(async () => {
      confirmGate.resolve({ error: { message: "stripe-decline-message" } });
    });
    await waitFor(() => expect(onSubmittingChange).toHaveBeenLastCalledWith(false));
    expect(h.statusMock).not.toHaveBeenCalled();
  });
});
