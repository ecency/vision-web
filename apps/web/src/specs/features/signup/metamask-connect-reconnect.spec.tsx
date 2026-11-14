import "@testing-library/jest-dom";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { renderWithQueryClient } from "@/specs/test-utils";

const BTC_ADDRESS = "bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq";
const fetchMultichainAddresses = vi.fn();

vi.mock("@ecency/sdk/wallets", async () => {
  const actual = await vi.importActual<typeof import("@ecency/sdk/wallets")>("@ecency/sdk/wallets");
  return {
    ...actual,
    fetchMultichainAddresses: () => fetchMultichainAddresses(),
    useGetExternalWalletBalanceQuery: () => ({ data: undefined, isLoading: false, refetch: vi.fn() }),
    getTokenPriceQueryOptions: () => ({ queryKey: ["test", "price"], queryFn: async () => 1 }),
    EcencyWalletsPrivateApi: {
      ...actual.EcencyWalletsPrivateApi,
      useCheckWalletExistence: () => ({ mutateAsync: vi.fn(async () => true) })
    }
  };
});

vi.mock("@/features/shared", () => ({ error: vi.fn(), success: vi.fn() }));

const { MetamaskConnect } = await import("@/app/signup/wallet/_components/steps/metamask-connect");

describe("MetamaskConnect: missing non-EVM address", () => {
  beforeEach(() => {
    (window as any).ethereum = {
      isMetaMask: true,
      request: vi.fn(async ({ method }: { method: string }) =>
        method === "eth_requestAccounts" ? ["0x742d35Cc6634C0532925a3b844Bc454e4438f44e"] : null
      )
    };
    fetchMultichainAddresses.mockReset();
  });

  afterEach(() => {
    delete (window as any).ethereum;
  });

  test("offers a reconnect that retries discovery after Bitcoin is enabled", async () => {
    fetchMultichainAddresses.mockResolvedValueOnce({}).mockResolvedValueOnce({ BTC: BTC_ADDRESS });

    renderWithQueryClient(<MetamaskConnect username="alice" onVerified={vi.fn()} onBack={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "signup-wallets.metamask.connect-button" }));
    fireEvent.click(await screen.findByRole("button", { name: /Bitcoin/ }));

    const reconnect = await screen.findByRole("button", { name: "signup-wallets.metamask.reconnect" });
    fireEvent.click(reconnect);

    await waitFor(() => expect(screen.getByText(BTC_ADDRESS)).toBeInTheDocument());
    expect(fetchMultichainAddresses).toHaveBeenCalledTimes(2);
  });
});
