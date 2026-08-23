import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, test, vi } from "vitest";
import dayjs from "@/utils/dayjs";

// The global @/utils mock exports only `random` and `getAccessToken`; the card
// reads formattedNumber and the interest helper through the same barrel.
vi.mock("@/utils", async () => ({
  ...(await vi.importActual<typeof import("@/utils")>("@/utils")),
  random: vi.fn(),
  getAccessToken: vi.fn(() => "mock-token")
}));

let account: Record<string, unknown> | null = null;
let activeUser: { username: string } | null = null;

// Hand the queries their data directly: the real query functions would reach a
// Hive node, and what is under test is what the card renders from an account
// row, not how the row is fetched.
vi.mock("@ecency/sdk", async () => {
  const actual = await vi.importActual<typeof import("@ecency/sdk")>("@ecency/sdk");
  return {
    ...actual,
    getAccountFullQueryOptions: (username: string) => ({
      queryKey: ["account-full", username],
      queryFn: async () => account
    }),
    getDynamicPropsQueryOptions: () => ({
      queryKey: ["dynamic-props"],
      // hbd_interest_rate is in basis points: 1000 is the 10% APR in force.
      queryFn: async () => ({ hbdInterestRate: 1000 })
    })
  };
});

vi.mock("@/core/hooks/use-active-account", () => ({
  useActiveAccount: () => ({ activeUser })
}));

// The dialog only wraps the trigger; mounting the real one drags in the whole
// broadcast stack for no gain here.
vi.mock("@/features/wallet", () => ({
  WalletOperationsDialog: ({ children }: { children: React.ReactNode }) => <div>{children}</div>
}));

const { ProfileWalletHbdInterest } = await import(
  "@/app/(dynamicPages)/profile/[username]/wallet/(token)/_components/profile-wallet-hbd-interest"
);

const chainTime = (daysAgo: number) =>
  dayjs().subtract(daysAgo, "day").utc().format("YYYY-MM-DDTHH:mm:ss");

function setAccount(fields: Partial<Record<string, unknown>>) {
  account = {
    name: "alice",
    savings_hbd_balance: "0.000 HBD",
    savings_hbd_seconds: 0,
    savings_hbd_seconds_last_update: chainTime(0),
    savings_hbd_last_interest_payment: chainTime(0),
    ...fields
  };
}

function renderCard() {
  // Seed both caches before mounting so the first render already has the
  // account row. Otherwise an assertion that the card renders NOTHING would
  // pass simply because the queries had not resolved yet.
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } }
  });
  queryClient.setQueryData(["account-full", "alice"], account);
  queryClient.setQueryData(["dynamic-props"], { hbdInterestRate: 1000 });

  return render(
    <QueryClientProvider client={queryClient}>
      <ProfileWalletHbdInterest username="alice" />
    </QueryClientProvider>
  );
}

describe("ProfileWalletHbdInterest", () => {
  beforeEach(() => {
    activeUser = { username: "alice" };
    setAccount({});
  });

  test("shows what a claim would release, with the button, once interest is due", () => {
    // 100 HBD held for 60 days at 10% APR.
    setAccount({
      savings_hbd_balance: "100.000 HBD",
      savings_hbd_seconds_last_update: chainTime(60),
      savings_hbd_last_interest_payment: chainTime(60)
    });

    renderCard();

    expect(screen.getByText(/^1\.64\d HBD$/)).toBeInTheDocument();
    const claim = screen.getByRole("button", {
      name: "profile-wallet.hbd-interest.claim-button"
    });
    expect(claim).toBeEnabled();
  });

  test("shows the estimate but offers no claim before anything has accrued", () => {
    setAccount({ savings_hbd_balance: "50.000 HBD" });

    renderCard();

    expect(screen.getByText("0.000 HBD")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "profile-wallet.hbd-interest.claim-button" })
    ).not.toBeInTheDocument();
  });

  test("offers no claim while interest is accrued but the 30 day interval has not passed", () => {
    setAccount({
      savings_hbd_balance: "100.000 HBD",
      savings_hbd_seconds_last_update: chainTime(10),
      savings_hbd_last_interest_payment: chainTime(10)
    });

    renderCard();

    expect(screen.getByText(/^0\.27\d HBD$/)).toBeInTheDocument();
    // There is interest, so the button is offered, but the chain will not pay
    // out yet.
    expect(
      screen.getByRole("button", { name: "profile-wallet.hbd-interest.claim-button" })
    ).toBeDisabled();
  });

  test("keeps showing interest banked before the savings balance was emptied", () => {
    // Regression: hiding the card on savings balance alone took the estimate
    // with it, so accrued interest became invisible.
    setAccount({
      savings_hbd_balance: "0.000 HBD",
      savings_hbd_seconds: 23901200496,
      savings_hbd_seconds_last_update: chainTime(140),
      savings_hbd_last_interest_payment: chainTime(150)
    });

    renderCard();

    expect(screen.getByText("0.076 HBD")).toBeInTheDocument();
    expect(
      screen.getByText("profile-wallet.hbd-interest.deposit-to-claim")
    ).toBeInTheDocument();
    // Claiming broadcasts a transfer out of savings, which an empty balance
    // cannot cover.
    expect(
      screen.getByRole("button", { name: "profile-wallet.hbd-interest.claim-button" })
    ).toBeDisabled();
  });

  test("renders nothing when there is neither a balance nor accrued interest", () => {
    const { container } = renderCard();

    expect(container).toBeEmptyDOMElement();
  });

  test("never offers the claim on someone else's wallet", () => {
    activeUser = { username: "bob" };
    setAccount({
      savings_hbd_balance: "100.000 HBD",
      savings_hbd_seconds_last_update: chainTime(60),
      savings_hbd_last_interest_payment: chainTime(60)
    });

    renderCard();

    expect(screen.getByText(/^1\.64\d HBD$/)).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "profile-wallet.hbd-interest.claim-button" })
    ).not.toBeInTheDocument();
  });
});
