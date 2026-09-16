import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Entry } from "@/entities";

const h = vi.hoisted(() => ({
  addDraft: vi.fn(async (..._args: unknown[]) => ({ _id: "draft-1" })),
  updateDraft: vi.fn(async (..._args: unknown[]) => undefined),
  addSchedule: vi.fn(async (..._args: unknown[]) => undefined),
  commentMutation: vi.fn(async (..._args: unknown[]) => undefined),
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
    addDraft: h.addDraft,
    updateDraft: h.updateDraft,
    addSchedule: h.addSchedule,
    validatePostCreating: vi.fn(async () => undefined),
    EcencyAnalytics: { useRecordActivity: () => ({ mutateAsync: vi.fn(async () => undefined) }) },
    getAccountFullQueryOptions: (username: string) => ({
      queryKey: actual.QueryKeys.accounts.full(username),
      queryFn: async () => account.account
    }),
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
  useReblogMutation: () => ({ mutateAsync: vi.fn() })
}));
vi.mock("@/api/mutations/validate-post-updating", () => ({
  useValidatePostUpdating: () => ({ mutateAsync: vi.fn(async () => undefined) })
}));
vi.mock("@/api/format-error", () => ({ formatError: (e: unknown) => [String(e)] }));
vi.mock("@/features/shared", () => ({ error: vi.fn(), success: vi.fn(), info: vi.fn() }));
vi.mock("@/core/caches", async () => ({
  ...(await vi.importActual<object>("@/core/caches")),
  EcencyEntriesCacheManagement: { useUpdateEntry: () => ({ updateEntryQueryData: vi.fn() }) }
}));
vi.mock("@/core/hooks", () => ({ useActiveAccount: () => account }));
vi.mock("@/core/hooks/use-active-account", () => ({ useActiveAccount: () => account }));
vi.mock("@/core/react-query", () => ({ getQueryClient: () => h.queryClient.current }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/publish",
  useSearchParams: () => null
}));
vi.mock("@/app/publish/_hooks/use-upload-tracker", () => ({
  useOptionalUploadTracker: () => undefined,
  useUploadTracker: () => undefined
}));
// The hooks read publish state through the barrel: hand back the real state module only.
vi.mock("@/app/publish/_hooks", async () =>
  vi.importActual("@/app/publish/_hooks/use-publish-state")
);
// jsdom never fires Image.onload, so the image ratio probe would never settle.
vi.mock("@/features/entry-management/entry-metadata-manager/get-dimensions-from-data-url", () => ({
  getDimensionsFromDataUrl: async () => [0, 0]
}));

import { PublishStateProvider, usePublishState } from "@/app/publish/_hooks/use-publish-state";
import { useSaveDraftApi } from "@/app/publish/_api/use-save-draft";
import { useSaveTemplateApi } from "@/app/publish/_api/use-save-template";
import { useScheduleApi } from "@/app/publish/_api/use-schedule";
import { usePostEdit } from "@/app/publish/entry/[author]/[permlink]/_hooks/use-post-edit";

const TITLE = "Vibe coding";
const BODY = "Let me tell you a story about O.\n\nO is short for Orchestrator.";

const ENTRY = {
  author: "author",
  permlink: "vibe-coding",
  category: "vibecoding",
  title: TITLE,
  body: "An earlier version of the post.",
  json_metadata: { app: "ecency/4.4.2-vision", tags: ["vibecoding"], description: "L" }
} as unknown as Entry;

type Metadata = { description?: string };

/** Mounts a composer hook with the real publish state, holding the given description. */
function mount<R>(useHook: () => R, description: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  h.queryClient.current = queryClient;
  const state: { current: ReturnType<typeof usePublishState> | null } = { current: null };

  const { result } = renderHook(
    () => {
      state.current = usePublishState();
      return useHook();
    },
    {
      wrapper: ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={queryClient}>
          <PublishStateProvider>{children}</PublishStateProvider>
        </QueryClientProvider>
      )
    }
  );

  act(() => {
    state.current!.setTitle(TITLE);
    state.current!.setContent(BODY);
    state.current!.setTags(["vibecoding"]);
  });
  act(() => state.current!.editMetaDescription(description));

  return result;
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
    "save draft",
    async (description) => {
      const result = mount(() => useSaveDraftApi(), description);
      await settle(() => result.current.mutateAsync({ showToast: false, redirect: false }));
      return lastArgs(h.addDraft)[4] as Metadata;
    }
  ],
  [
    "save template",
    async (description) => {
      const result = mount(() => useSaveTemplateApi(), description);
      await settle(() => result.current.mutateAsync({ name: "weekly" }));
      return lastArgs(h.addDraft)[4] as Metadata;
    }
  ],
  [
    "schedule",
    async (description) => {
      const result = mount(() => useScheduleApi(), description);
      await settle(() => result.current.mutateAsync(new Date("2026-09-20T10:00:00.000Z")));
      return lastArgs(h.addSchedule)[4] as Metadata;
    }
  ],
  [
    "post edit",
    async (description) => {
      const result = mount(() => usePostEdit(ENTRY), description);
      await settle(() =>
        result.current.mutateAsync({ title: TITLE, tags: ["vibecoding"], body: BODY, description })
      );
      return (lastArgs(h.commentMutation)[0] as { jsonMetadata: Metadata }).jsonMetadata;
    }
  ]
];

// Regression: the composer published a one character description while the classic editor
// replaced it with the body summary, so the same post read differently depending on where it
// was written.
describe.each(PATHS)("composer %s description", (_path, submit) => {
  beforeEach(() => {
    h.addDraft.mockClear();
    h.updateDraft.mockClear();
    h.addSchedule.mockClear();
    h.commentMutation.mockClear();
  });

  it("falls back to the body summary for a one character description", async () => {
    const metadata = await submit("A");

    expect(metadata.description).not.toBe("A");
    expect(metadata.description).toContain("Let me tell you a story about O.");
  });

  it("keeps a description the author wrote", async () => {
    const metadata = await submit("My own summary");

    expect(metadata.description).toBe("My own summary");
  });
});
