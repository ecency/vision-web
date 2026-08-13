import { vi } from "vitest";
import React from "react";
import { fireEvent, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import {
  cleanupModalContainers,
  createTestQueryClient,
  mockFullAccount,
  renderWithQueryClient,
  setupModalContainers
} from "@/specs/test-utils";
import { BuyWithHiveForm } from "@/app/perks/points/buy-with-hive/_components/buy-with-hive-form";
import { useActiveAccount } from "@/core/hooks/use-active-account";

// The component builds a HiveWallet from the account, and the global @/utils mock
// only exposes random/getAccessToken.
vi.mock("@/utils", async () => ({
  ...(await vi.importActual("@/utils")),
  random: vi.fn(),
  getAccessToken: vi.fn(() => "mock-token")
}));

function setBalance(hive: number) {
  vi.mocked(useActiveAccount).mockReturnValue({
    activeUser: { username: "testuser" },
    username: "testuser",
    account: mockFullAccount({
      name: "testuser",
      balance: `${hive.toFixed(3)} HIVE`,
      hbd_balance: "50.000 HBD"
    }),
    isLoading: false,
    isPending: false,
    isError: false,
    isSuccess: true,
    error: null,
    refetch: vi.fn()
  } as unknown as ReturnType<typeof useActiveAccount>);
}

function renderForm(onSubmit = vi.fn()) {
  const queryClient = createTestQueryClient();
  // usdRate = base / quote = 0.3, so POINTS = amount * 0.3 / 0.002 = amount * 150
  queryClient.setQueryData(["dynamic-props"], { base: 0.3, quote: 1 });

  const result = renderWithQueryClient(<BuyWithHiveForm onSubmit={onSubmit} />, { queryClient });
  const [amountInput, pointsInput] = Array.from(
    result.container.querySelectorAll<HTMLInputElement>("input.amount-control")
  );

  return { ...result, onSubmit, amountInput, pointsInput };
}

const errorText = () => screen.queryByText("market.more-than-balance");
const continueButton = () => screen.getByText("g.continue").closest("button")!;

describe("BuyWithHiveForm", () => {
  beforeEach(() => {
    setupModalContainers();
    setBalance(5000);
  });

  afterEach(() => {
    cleanupModalContainers();
    vi.clearAllMocks();
  });

  // The reported case: 230 HIVE available, every amount whose leading digit sorts
  // above "2" was rejected because the check compared "230.00 HIVE" < amount as strings.
  test.each(["3", "4", "9", "22.5", "229.999"])(
    "accepts %s HIVE against a 230 HIVE balance",
    (amount) => {
      setBalance(230);
      const { amountInput } = renderForm();

      fireEvent.change(amountInput, { target: { value: amount } });

      expect(errorText()).toBeNull();
      expect(continueButton()).not.toBeDisabled();
    }
  );

  test.each(["231", "2000"])("flags %s HIVE against a 230 HIVE balance", (amount) => {
    setBalance(230);
    const { amountInput } = renderForm();

    fireEvent.change(amountInput, { target: { value: amount } });

    expect(errorText()).toBeInTheDocument();
    expect(continueButton()).toBeDisabled();
  });

  test("converts an amount above 999 instead of rendering NaN", () => {
    const { amountInput, pointsInput } = renderForm();

    fireEvent.change(amountInput, { target: { value: "2000" } });

    // The control formats the typed value with a thousands separator
    expect(amountInput.value).toBe("2,000");
    expect(pointsInput.value).not.toContain("NaN");
    expect(pointsInput.value).toBe("300,000.00");
    expect(errorText()).toBeNull();
  });

  test("submits the amount without thousands separators", () => {
    const { amountInput, onSubmit } = renderForm();

    fireEvent.change(amountInput, { target: { value: "2000" } });
    fireEvent.click(continueButton());

    expect(onSubmit).toHaveBeenCalledWith("2000", "HIVE", "300000.00");
  });

  test("keeps the submit button disabled while the amount is empty or zero", () => {
    const { amountInput } = renderForm();

    expect(continueButton()).toBeDisabled();

    fireEvent.change(amountInput, { target: { value: "0" } });
    expect(continueButton()).toBeDisabled();

    fireEvent.change(amountInput, { target: { value: "0.000" } });
    expect(continueButton()).toBeDisabled();
  });
});
