import { vi } from "vitest";
import React from "react";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("@/core/hooks/use-active-account", () => ({
  useActiveAccount: () => ({ activeUser: { username: "tester" } })
}));

vi.mock("@/api/sdk-mutations", () => ({
  useSubscribeCommunityMutation: () => ({ isPending: false, mutateAsync: vi.fn() }),
  useUnsubscribeCommunityMutation: () => ({ isPending: false, mutateAsync: vi.fn() })
}));

vi.mock("@/features/shared", () => ({
  LoginRequired: ({ children }: { children: React.ReactNode }) => <>{children}</>
}));

vi.mock("@ecency/sdk", async () => ({
  ...(await vi.importActual<Record<string, unknown>>(
    "../../../../../../packages/sdk/src/modules/communities/types/subscription"
  )),
  getAccountSubscriptionsQueryOptions: (username?: string) => ({
    queryKey: ["accounts", "subscriptions", username],
    queryFn: async () => [],
    enabled: !!username,
    staleTime: Infinity
  })
}));

import { SubscriptionBtn } from "@/app/communities/_components/subscription-btn";

const community = { name: "hive-2", title: "Two" } as Parameters<typeof SubscriptionBtn>[0]["community"];

function renderWith(cached: unknown) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  queryClient.setQueryData(["accounts", "subscriptions", "tester"], cached);
  return render(
    <QueryClientProvider client={queryClient}>
      <SubscriptionBtn community={community} />
    </QueryClientProvider>
  );
}

describe("SubscriptionBtn", () => {
  it("renders when the cached subscriptions hold a null row", () => {
    expect(() => renderWith([null, ["hive-1", "One", "guest", ""]])).not.toThrow();
    expect(screen.getByRole("button")).toHaveTextContent("community.subscribe");
  });

  it("still sees a joined community among unusable rows", () => {
    renderWith([null, "hive-1", ["hive-2", "Two", "guest", ""]]);
    expect(screen.getByRole("button")).toHaveTextContent("community.subscribed");
  });
});
