import "@testing-library/jest-dom";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { renderWithQueryClient } from "@/specs/test-utils";

// Interpolate the values this spec asserts on; the global mock returns bare keys.
vi.mock("i18next", () => ({
  __esModule: true,
  default: {
    t: (key: string, params?: Record<string, unknown>) =>
      params && "balance" in params ? `${key}:${params.balance}` : key,
    language: "en-US",
    init: vi.fn(),
    changeLanguage: vi.fn(),
    on: vi.fn()
  }
}));

const LINKED = "bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4";
const RECIPIENT = "bc1qrp33g0q5c5txsp9arysrx4k6zdkfs4nce4xj0gdcccefvpysxf3qccfmv3";

const mutateAsync = vi.fn();

vi.mock("@ecency/sdk", async () => {
  const actual = await vi.importActual<typeof import("@ecency/sdk")>("@ecency/sdk");
  return {
    ...actual,
    getAccountFullQueryOptions: (username: string) => ({
      ...actual.getAccountFullQueryOptions(username),
      queryFn: async () => ({
        name: "alice",
        profile: { tokens: [{ symbol: "BTC", type: "CHAIN", meta: { address: LINKED } }] }
      })
    })
  };
});

vi.mock("@ecency/sdk/wallets", async () => {
  const actual = await vi.importActual<typeof import("@ecency/sdk/wallets")>("@ecency/sdk/wallets");
  return {
    ...actual,
    // 0.12345678 BTC, in sats as the balance API returns it
    useGetExternalWalletBalanceQuery: () => ({
      data: { chain: "btc", unit: "satoshi", balanceString: "12345678", balanceBigInt: 12345678n }
    }),
    getTokenPriceQueryOptions: () => ({ queryKey: ["test", "btc-price"], queryFn: async () => 100000 }),
    useExternalTransfer: () => ({ mutateAsync })
  };
});

const { EcencyWalletCurrency } = await import("@ecency/sdk/wallets");
const { ExternalTransferDialog } = await import(
  "@/features/wallet/external-transfer/external-transfer-dialog"
);

function renderDialog() {
  return renderWithQueryClient(
    <ExternalTransferDialog currency={EcencyWalletCurrency.BTC} username="alice" show={true} onHide={() => {}} />
  );
}

const recipientInput = () => screen.getByPlaceholderText("bc1...");
const amountInput = () => screen.getByPlaceholderText("0.0");
const reviewButton = () => screen.getByRole("button", { name: "external-transfer.review" });

async function fillForm(to: string, amount: string) {
  renderDialog();
  // The linked address arrives through the account query
  await screen.findByText(/^external-transfer\.balance:/);
  fireEvent.change(recipientInput(), { target: { value: to } });
  fireEvent.change(amountInput(), { target: { value: amount } });
}

describe("ExternalTransferDialog: BTC", () => {
  beforeEach(() => {
    mutateAsync.mockReset();
  });

  test("shows the balance with all eight decimals and no Max button", async () => {
    renderDialog();

    const balance = await screen.findByText("external-transfer.balance:0.12345678");
    expect(balance.tagName).not.toBe("BUTTON");
    expect(screen.getByText("external-transfer.btc-fee-hint")).toBeInTheDocument();
  });

  test("keeps Review disabled for an address with a bad checksum", async () => {
    await fillForm("bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t5", "0.01");

    expect(reviewButton()).toBeDisabled();
    expect(screen.getByText("external-transfer.error-invalid-address")).toBeInTheDocument();
  });

  test("enables Review for a valid address and an amount below the balance", async () => {
    await fillForm(RECIPIENT, "0.01");

    expect(reviewButton()).toBeEnabled();
  });

  test("blocks sending the whole balance, since the fee is added on top", async () => {
    await fillForm(RECIPIENT, "0.12345678");

    expect(reviewButton()).toBeDisabled();
    expect(screen.getByText("external-transfer.error-exceeds-balance")).toBeInTheDocument();
  });

  test("links a successful send to mempool.space", async () => {
    mutateAsync.mockResolvedValue({ txHash: "deadbeef", currency: "BTC" });
    await fillForm(RECIPIENT, "0.01");

    fireEvent.click(reviewButton());
    fireEvent.click(screen.getByRole("button", { name: /external-transfer.confirm-metamask/ }));

    const link = await screen.findByRole("link", { name: "external-transfer.view-explorer" });
    expect(link).toHaveAttribute("href", "https://mempool.space/tx/deadbeef");
    expect(mutateAsync).toHaveBeenCalledWith({ to: RECIPIENT, amount: "0.01", expectedFrom: LINKED });
  });

  test("shows a cancel, not a failure, when the user rejects in MetaMask", async () => {
    mutateAsync.mockRejectedValue(Object.assign(new Error("User rejected the request."), { code: 4001 }));
    await fillForm(RECIPIENT, "0.01");

    fireEvent.click(reviewButton());
    fireEvent.click(screen.getByRole("button", { name: /external-transfer.confirm-metamask/ }));

    await waitFor(() => expect(screen.getByText("external-transfer.cancelled")).toBeInTheDocument());
  });
});
