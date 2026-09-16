import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Entry } from "@/entities";

const h = vi.hoisted(() => ({
  commentMutation: vi.fn(async (..._args: unknown[]) => undefined),
  addSchedule: vi.fn(async (..._args: unknown[]) => undefined),
  addDraft: vi.fn(async (..._args: unknown[]) => ({ _id: "draft-1" })),
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
    }),
    addSchedule: h.addSchedule,
    addDraft: h.addDraft,
    updateDraft: vi.fn(async () => undefined)
  };
});
vi.mock("@/api/sdk-mutations", () => ({
  useCommentMutation: () => ({ mutateAsync: h.commentMutation }),
  useReblogMutation: () => ({ mutateAsync: vi.fn() })
}));
vi.mock("@/api/mutations/validate-post-updating", () => ({
  useValidatePostUpdating: () => ({ mutateAsync: vi.fn(async () => undefined) })
}));
vi.mock("@/api/threespeak-embed", () => ({
  enforceThreeSpeakBeneficiary: (beneficiaries: unknown) => beneficiaries,
  linkThreeSpeakEmbed: vi.fn()
}));
vi.mock("@/api/format-error", () => ({ formatError: (e: unknown) => [String(e)] }));
vi.mock("@/app/submit/_hooks/polls-manager", async () => {
  const { createContext } = await import("react");
  return { PollsContext: createContext({ activePoll: undefined, clearActivePoll: () => {} }) };
});
vi.mock("@/features/polls", () => ({
  usePollsCreationManagement: () => ({ clearAll: vi.fn() })
}));
vi.mock("@/features/shared", () => ({ error: vi.fn(), success: vi.fn() }));
vi.mock("@/core/sentry/lazy-sentry", () => ({ sentry: { captureException: vi.fn() } }));
vi.mock("@/core/caches", () => ({
  EcencyEntriesCacheManagement: { useUpdateEntry: () => ({ updateEntryQueryData: vi.fn() }) }
}));
vi.mock("@/core/hooks", () => ({ useActiveAccount: () => account }));
vi.mock("@/core/hooks/use-active-account", () => ({ useActiveAccount: () => account }));
vi.mock("@/core/react-query", () => ({ getQueryClient: () => h.queryClient.current }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
// jsdom never fires Image.onload, so the image ratio probe would never settle.
vi.mock("@/features/entry-management/entry-metadata-manager/get-dimensions-from-data-url", () => ({
  getDimensionsFromDataUrl: async () => [0, 0]
}));

import { usePublishApi } from "@/app/submit/_api/publish";
import { useSaveDraftApi } from "@/app/submit/_api/save-draft";
import { useScheduleApi } from "@/app/submit/_api/schedule";
import { useUpdateApi } from "@/app/submit/_api/update";

const TITLE = "Vibe coding";
const TAGS = ["vibecoding"];
const BODY = "Let me tell you a story about O.\n\nO is short for Orchestrator.";

const EDITING_ENTRY = {
  author: "author",
  permlink: "vibe-coding",
  category: "vibecoding",
  title: TITLE,
  body: "An earlier version of the post.",
  json_metadata: { app: "ecency/4.4.2-vision", tags: TAGS, description: "L" }
} as unknown as Entry;

type Metadata = { description?: string };

function mount<R>(useHook: () => R) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  h.queryClient.current = queryClient;
  return renderHook(useHook, {
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    )
  }).result;
}

// Only the payload handed to the network boundary matters here, not what runs after it.
async function settle(submit: () => Promise<unknown>) {
  await act(async () => {
    await submit().catch(() => undefined);
  });
}

function lastArgs(mock: { mock: { calls: unknown[][] } }) {
  expect(mock.mock.calls.length).toBeGreaterThan(0);
  return mock.mock.calls.at(-1)!;
}

const PATHS: Array<[string, (description: string) => Promise<Metadata>]> = [
  [
    "publish",
    async (description) => {
      const result = mount(() => usePublishApi(vi.fn()));
      await settle(() =>
        result.current.mutateAsync({
          title: TITLE,
          tags: TAGS,
          body: BODY,
          description,
          reward: "default",
          reblogSwitch: false,
          beneficiaries: []
        })
      );
      return (lastArgs(h.commentMutation)[0] as { jsonMetadata: Metadata }).jsonMetadata;
    }
  ],
  [
    "schedule",
    async (description) => {
      const result = mount(() => useScheduleApi(vi.fn()));
      await settle(() =>
        result.current.mutateAsync({
          title: TITLE,
          tags: TAGS,
          body: BODY,
          description,
          reward: "default",
          reblogSwitch: false,
          beneficiaries: [],
          schedule: "2026-09-20T10:00:00.000Z"
        })
      );
      return lastArgs(h.addSchedule)[4] as Metadata;
    }
  ],
  [
    "save draft",
    async (description) => {
      const result = mount(() => useSaveDraftApi());
      await settle(() =>
        result.current.mutateAsync({
          title: TITLE,
          body: BODY,
          tags: TAGS,
          editingDraft: null,
          beneficiaries: [],
          reward: "default",
          description
        })
      );
      return lastArgs(h.addDraft)[4] as Metadata;
    }
  ],
  [
    "update",
    async (description) => {
      const result = mount(() => useUpdateApi(vi.fn()));
      await settle(() =>
        result.current.mutateAsync({
          title: TITLE,
          tags: TAGS,
          body: BODY,
          description,
          editingEntry: EDITING_ENTRY
        })
      );
      return (lastArgs(h.commentMutation)[0] as { jsonMetadata: Metadata }).jsonMetadata;
    }
  ]
];

// Regression: a one character description carried over from the composer was
// truthy, so the classic editor published, scheduled, saved or updated with it
// instead of the body summary.
describe.each(PATHS)("classic %s description", (_path, submit) => {
  beforeEach(() => {
    h.commentMutation.mockClear();
    h.addSchedule.mockClear();
    h.addDraft.mockClear();
  });

  it("falls back to the body summary for a one character description", async () => {
    const metadata = await submit("L");

    expect(metadata.description).not.toBe("L");
    expect(metadata.description).toContain("Let me tell you a story about O.");
  });

  it("keeps a description the author wrote", async () => {
    const metadata = await submit("My own summary");

    expect(metadata.description).toBe("My own summary");
  });
});
