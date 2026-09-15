import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  commentMutation: vi.fn(async () => undefined),
  queryClient: { current: null as unknown }
}));

vi.mock("@/utils", async () => ({
  ...(await vi.importActual<typeof import("@/utils")>("@/utils")),
  random: vi.fn(),
  getAccessToken: vi.fn(() => "mock-token")
}));
vi.mock("@ecency/sdk", async () => ({
  ...(await vi.importActual<object>("@ecency/sdk")),
  validatePostCreating: vi.fn(async () => undefined),
  EcencyAnalytics: { useRecordActivity: () => ({ mutateAsync: vi.fn(async () => undefined) }) },
  getPostHeaderQueryOptions: () => ({
    queryKey: ["post-header"],
    queryFn: async () => {
      throw new Error("not found");
    }
  })
}));
vi.mock("@/api/sdk-mutations", () => ({
  useCommentMutation: () => ({ mutateAsync: h.commentMutation }),
  useReblogMutation: () => ({ mutateAsync: vi.fn() })
}));
vi.mock("@/api/threespeak-embed", () => ({
  enforceThreeSpeakBeneficiary: (beneficiaries: unknown) => beneficiaries,
  linkThreeSpeakEmbed: vi.fn()
}));
vi.mock("@/api/format-error", () => ({ formatError: (e: unknown) => [String(e)] }));
vi.mock("@/features/polls", () => ({
  usePollsCreationManagement: () => ({ clearAll: vi.fn() })
}));
vi.mock("@/features/shared", () => ({ error: vi.fn(), success: vi.fn() }));
vi.mock("@/core/sentry/lazy-sentry", () => ({ sentry: { captureException: vi.fn() } }));
vi.mock("@/core/caches", () => ({
  EcencyEntriesCacheManagement: { useUpdateEntry: () => ({ updateEntryQueryData: vi.fn() }) }
}));
vi.mock("@/core/hooks", () => ({
  useActiveAccount: () => ({ username: "author", account: { name: "author" }, isLoading: false })
}));
vi.mock("@/core/react-query", () => ({ getQueryClient: () => h.queryClient.current }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
// jsdom never fires Image.onload, so the image ratio probe would never settle.
vi.mock("@/features/entry-management/entry-metadata-manager/get-dimensions-from-data-url", () => ({
  getDimensionsFromDataUrl: async () => [0, 0]
}));

import { usePublishApi } from "@/app/submit/_api/publish";

const BODY = "Let me tell you a story about O.\n\nO is short for Orchestrator.";

async function publishWith(description: string | null) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  h.queryClient.current = queryClient;
  const { result } = renderHook(() => usePublishApi(vi.fn()), {
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    )
  });

  await act(async () => {
    // Only the broadcast payload matters here, not what runs after it.
    await result.current
      .mutateAsync({
        title: "Vibe coding",
        tags: ["vibecoding"],
        body: BODY,
        description,
        reward: "default",
        reblogSwitch: false,
        beneficiaries: []
      })
      .catch(() => undefined);
  });

  expect(h.commentMutation).toHaveBeenCalled();
  return h.commentMutation.mock.calls.at(-1)![0].jsonMetadata;
}

// Regression: a one character description carried over from the composer was
// truthy, so the classic editor published it instead of the body summary.
describe("classic publish description", () => {
  beforeEach(() => {
    h.commentMutation.mockClear();
  });

  it("publishes the body summary instead of a one character description", async () => {
    const jsonMetadata = await publishWith("L");

    expect(jsonMetadata.description).not.toBe("L");
    expect(jsonMetadata.description).toContain("Let me tell you a story about O.");
  });

  it("publishes a description the author wrote", async () => {
    const jsonMetadata = await publishWith("My own summary");

    expect(jsonMetadata.description).toBe("My own summary");
  });
});
