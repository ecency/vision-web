import { StripeCheckoutForm } from "@/features/shared/purchase-stripe/stripe-checkout-form";
import "@testing-library/jest-dom";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// A promise resolvable from the test body, to freeze the async Pay handler at a chosen
// await and unmount the form underneath it.
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

interface MockConfirmResult {
  paymentIntent?: { id: string; status: string };
  error?: { message: string };
}

type SubmitResult = { error?: { message?: string } };

// Shared stubs, hoisted so the vi.mock factory can reference them.
const h = vi.hoisted(() => ({
  submitMock: vi.fn(async (): Promise<SubmitResult> => ({})),
  confirmPaymentMock: vi.fn(
    async (): Promise<MockConfirmResult> => ({
      paymentIntent: { id: "pi_confirmed_123", status: "succeeded" }
    })
  )
}));

vi.mock("@stripe/react-stripe-js", async () => {
  const React = await import("react");
  return {
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

describe("StripeCheckoutForm (unmount during the Pay handler)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Re-pin implementations: clearAllMocks resets calls but a per-test
    // mockImplementation would otherwise leak into the next test.
    h.submitMock.mockImplementation(async () => ({}));
    h.confirmPaymentMock.mockImplementation(async () => ({
      paymentIntent: { id: "pi_confirmed_123", status: "succeeded" }
    }));
  });

  const renderForm = ({
    createIntent = vi.fn(async () => "pi_minted_123_secret_x"),
    onPaid = vi.fn(),
    onError = vi.fn()
  }: {
    createIntent?: () => Promise<string>;
    onPaid?: (paymentIntentId: string) => void;
    onError?: (message: string) => void;
  } = {}) => {
    const view = render(
      <StripeCheckoutForm
        returnUrl="https://ecency.com/perks"
        payLabel="pay"
        createIntent={createIntent}
        onPaid={onPaid}
        onError={onError}
      />
    );
    return { ...view, createIntent, onPaid, onError };
  };

  const clickPay = async () => {
    const payButton = await screen.findByRole("button", { name: "pay" });
    await waitFor(() => expect(payButton).not.toBeDisabled());
    fireEvent.click(payButton);
  };

  it("does not mint when the form unmounts while elements.submit is in flight", async () => {
    // A still-enabled selection change remounts the keyed checkout; the OLD handler's
    // submit resolves after the unmount and must not mint an intent for the discarded
    // selection.
    const submitGate = deferred<SubmitResult>();
    h.submitMock.mockImplementation(() => submitGate.promise);
    const { unmount, createIntent, onPaid, onError } = renderForm();

    await clickPay();
    await waitFor(() => expect(h.submitMock).toHaveBeenCalledTimes(1));
    unmount();

    await act(async () => {
      submitGate.resolve({});
    });

    expect(createIntent).not.toHaveBeenCalled();
    expect(h.confirmPaymentMock).not.toHaveBeenCalled();
    expect(onPaid).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
  });

  it("does not confirm when the form unmounts while createIntent is in flight", async () => {
    const mintGate = deferred<string>();
    const createIntent = vi.fn(() => mintGate.promise);
    const { unmount, onPaid, onError } = renderForm({ createIntent });

    await clickPay();
    await waitFor(() => expect(createIntent).toHaveBeenCalledTimes(1));
    unmount();

    await act(async () => {
      mintGate.resolve("pi_discarded_secret_x");
    });

    // The minted intent for the discarded selection is never confirmed and no stale
    // callback fires into the replaced checkout.
    expect(h.confirmPaymentMock).not.toHaveBeenCalled();
    expect(onPaid).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
  });

  it("drops the confirm result when the form unmounts while confirmPayment is in flight", async () => {
    const confirmGate = deferred<MockConfirmResult>();
    h.confirmPaymentMock.mockImplementation(() => confirmGate.promise);
    const { unmount, onPaid, onError } = renderForm();

    await clickPay();
    await waitFor(() => expect(h.confirmPaymentMock).toHaveBeenCalledTimes(1));
    unmount();

    await act(async () => {
      confirmGate.resolve({ paymentIntent: { id: "pi_confirmed_123", status: "succeeded" } });
    });

    // The dispatch itself cannot be aborted (Stripe owns that window), but the result
    // must not drive a stale caller's state after the unmount.
    expect(onPaid).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
  });
});
