import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  commentMutation: vi.fn(async (..._args: unknown[]) => undefined),
  reblogMutation: vi.fn(async (..._args: unknown[]) => undefined),
  queryClient: { current: null as unknown }
}));

const account = vi.hoisted(() => ({
  username: "author",
  activeUser: { username: "author" },
  account: { name: "author" },
  isLoading: false
}));

vi.mock("@/utils", async () => ({
  ...(await vi.importActual<typeof import("@/utils")>("@/utils")),
  random: vi.fn(),
  getAccessToken: vi.fn(() => "mock-token"),
  ensureValidToken: vi.fn(async () => "mock-token")
}));
vi.mock("@ecency/sdk", async () => {
  const actual = await vi.importActual<typeof import("@ecency/sdk")>("@ecency/sdk");
  return {
    ...actual,
    validatePostCreating: vi.fn(async () => undefined),
    EcencyAnalytics: { useRecordActivity: () => ({ mutateAsync: vi.fn(async () => undefined) }) },
    getPostHeaderQueryOptions: (author: string, permlink: string) => ({
      queryKey: actual.QueryKeys.posts.postHeader(author, permlink),
      queryFn: async () => {
        throw new Error("not found");
      }
    })
  };
});
vi.mock("@/api/sdk-mutations", () => ({
  useCommentMutation: () => ({ mutateAsync: h.commentMutation }),
  useReblogMutation: () => ({ mutateAsync: h.reblogMutation })
}));
vi.mock("@/api/threespeak-embed", () => ({
  enforceThreeSpeakBeneficiary: (beneficiaries: unknown) => beneficiaries,
  linkThreeSpeakEmbed: vi.fn()
}));
vi.mock("@/api/threespeak-embed/link-after-broadcast", () => ({ linkThreeSpeakEmbed: vi.fn() }));
vi.mock("@/app/submit/_hooks/polls-manager", async () => {
  const { createContext } = await import("react");
  return { PollsContext: createContext({ activePoll: undefined, clearActivePoll: () => {} }) };
});
vi.mock("@/features/polls", () => ({
  usePollsCreationManagement: () => ({ clearAll: vi.fn() })
}));
vi.mock("@/features/shared", () => ({ error: vi.fn(), success: vi.fn(), info: vi.fn() }));
// Tests must never reach production Sentry.
const sentry = vi.hoisted(() => ({ captureException: vi.fn(), captureMessage: vi.fn() }));
vi.mock("@/core/sentry/lazy-sentry", () => ({ sentry }));
vi.mock("@/core/caches", () => ({
  EcencyEntriesCacheManagement: { useUpdateEntry: () => ({ updateEntryQueryData: vi.fn() }) }
}));
vi.mock("@/core/hooks", () => ({ useActiveAccount: () => account }));
vi.mock("@/core/hooks/use-active-account", () => ({ useActiveAccount: () => account }));
vi.mock("@/core/react-query", () => ({ getQueryClient: () => h.queryClient.current }));
vi.mock("@/utils/refresh-quests", () => ({ scheduleQuestsRefresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/features/entry-management/entry-metadata-manager/get-dimensions-from-data-url", () => ({
  getDimensionsFromDataUrl: async () => [0, 0]
}));
// The publish page's composer state: a post to a community, reblogged into it.
vi.mock("@/app/publish/_hooks", () => ({
  usePublishState: () => ({
    title: "Hello community",
    content: "Some words for the community.",
    tags: ["hive-123456", "travel"],
    metaDescription: "",
    selectedThumbnail: undefined,
    reward: "default",
    beneficiaries: [],
    isReblogToCommunity: true,
    poll: undefined,
    postLinks: [],
    location: undefined,
    decentMemes: undefined,
    aiTools: undefined
  })
}));
vi.mock("@/app/publish/_utils/build-publish-operation", () => ({
  buildPublishOperation: vi.fn(async () => ({
    op: { parent_permlink: "hive-123456", body: "Some words for the community." },
    jsonMetadata: { tags: ["hive-123456", "travel"] },
    summary: "",
    options: null,
    beneficiariesDropped: false
  }))
}));

import { usePublishApi as useClassicPublishApi } from "@/app/submit/_api/publish";
import { usePublishApi } from "@/app/publish/_api/use-publish";
import { reportRcRejection } from "@/api/rc-shortfall-report";

function mount<R>(useHook: () => R) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  h.queryClient.current = queryClient;
  return renderHook(useHook, {
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    )
  }).result;
}

const rcRejection = () =>
  new Error("Account: author has 100 RC, needs 2000 RC. Please wait to transact or power up HIVE.");

// Each path mounts its hook and hands back the submit.
const PATHS: Array<[string, () => () => Promise<unknown>]> = [
  [
    "classic submit page",
    () => {
      const result = mount(() => useClassicPublishApi(vi.fn()));
      return () =>
        result.current.mutateAsync({
        title: "Hello community",
        tags: ["hive-123456", "travel"],
        body: "Some words for the community.",
        description: "",
        reward: "default",
          reblogSwitch: true,
          beneficiaries: []
        });
    }
  ],
  [
    "publish page",
    () => {
      const result = mount(() => usePublishApi());
      return () => result.current.mutateAsync();
    }
  ]
];

// #2196: the post itself went out; only the reblog into the community ran out of RC.
describe.each(PATHS)("%s: community reblog after a published post", (_name, mountPublish) => {
  beforeEach(() => {
    h.commentMutation.mockClear();
    h.reblogMutation.mockReset();
    sentry.captureMessage.mockReset();
  });

  it("reports the RC failure as a reblog, and only once", async () => {
    const err = rcRejection();
    h.reblogMutation.mockRejectedValue(err);
    const publish = mountPublish();

    let thrown: unknown = null;
    await act(async () => {
      await publish().catch((e) => {
        thrown = e;
      });
    });
    // The page's own handler sees the same failure and reports it as a post.
    reportRcRejection(thrown, "post", "author");

    expect(h.commentMutation).toHaveBeenCalledTimes(1);
    expect(h.reblogMutation).toHaveBeenCalledTimes(1);
    expect(thrown).toBe(err);
    expect(sentry.captureMessage).toHaveBeenCalledTimes(1);
    expect(sentry.captureMessage).toHaveBeenCalledWith("rc-shortfall", {
      level: "info",
      fingerprint: ["rc-shortfall"],
      tags: { "rc.stage": "rejected", "rc.op": "reblog" },
      user: { username: "author" }
    });
  });
});
