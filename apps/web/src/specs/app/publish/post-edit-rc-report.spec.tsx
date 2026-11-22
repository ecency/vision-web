import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Entry } from "@/entities";

// #2196: editing a post from either editor reports an RC rejection as a post.

const h = vi.hoisted(() => ({ commentMutation: vi.fn() }));
const account = vi.hoisted(() => ({
  username: "author",
  activeUser: { username: "author" },
  account: { name: "author" },
  isLoading: false
}));

vi.mock("@/utils", async () => ({
  ...(await vi.importActual<typeof import("@/utils")>("@/utils")),
  random: vi.fn(),
  getAccessToken: vi.fn(() => "mock-token")
}));
vi.mock("@ecency/sdk", async () => ({
  ...(await vi.importActual<Record<string, unknown>>("@ecency/sdk")),
  EcencyAnalytics: { useRecordActivity: () => ({ mutateAsync: vi.fn(async () => undefined) }) }
}));
vi.mock("@/api/sdk-mutations", () => ({
  useCommentMutation: () => ({ mutateAsync: h.commentMutation })
}));
vi.mock("@/api/mutations/validate-post-updating", () => ({
  useValidatePostUpdating: () => ({ mutateAsync: vi.fn(async () => undefined) })
}));
vi.mock("@/features/shared", () => ({ error: vi.fn(), success: vi.fn() }));
vi.mock("@/core/caches", () => ({
  EcencyEntriesCacheManagement: { useUpdateEntry: () => ({ updateEntryQueryData: vi.fn() }) }
}));
vi.mock("@/core/hooks/use-active-account", () => ({ useActiveAccount: () => account }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/features/entry-management/entry-metadata-manager/get-dimensions-from-data-url", () => ({
  getDimensionsFromDataUrl: async () => [0, 0]
}));
// Tests must never reach production Sentry.
const sentry = vi.hoisted(() => ({ captureMessage: vi.fn(), captureException: vi.fn() }));
vi.mock("@/core/sentry/lazy-sentry", () => ({ sentry }));

import { usePostEdit } from "@/app/publish/entry/[author]/[permlink]/_hooks/use-post-edit";
import { useUpdateApi } from "@/app/submit/_api/update";

const POST = {
  author: "author",
  permlink: "a-post",
  category: "travel",
  title: "A post",
  body: "The old body.",
  json_metadata: { app: "ecency/1", tags: ["travel"] }
} as unknown as Entry;

function mount<R>(useHook: () => R) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } }
  });
  return renderHook(useHook, {
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    )
  }).result;
}

const rcRejection = () =>
  new Error("Account: author has 100 RC, needs 2000 RC. Please wait to transact or power up HIVE.");

const PATHS: Array<[string, () => () => Promise<unknown>]> = [
  [
    "publish page edit",
    () => {
      const result = mount(() => usePostEdit(POST));
      return () =>
        result.current.mutateAsync({ title: "A post", tags: ["travel"], body: "The new body." });
    }
  ],
  [
    "classic submit edit",
    () => {
      const result = mount(() => useUpdateApi(vi.fn()));
      return () =>
        result.current.mutateAsync({
          title: "A post",
          tags: ["travel"],
          body: "The new body.",
          description: null,
          editingEntry: POST
        });
    }
  ]
];

describe.each(PATHS)("%s", (_name, mountEdit) => {
  beforeEach(() => {
    h.commentMutation.mockReset();
    sentry.captureMessage.mockReset();
  });

  it("reports an edit rejected for RC as a post", async () => {
    h.commentMutation.mockRejectedValue(rcRejection());
    const edit = mountEdit();

    await act(async () => {
      await edit().catch(() => undefined);
    });

    expect(h.commentMutation).toHaveBeenCalledTimes(1);
    expect(sentry.captureMessage).toHaveBeenCalledTimes(1);
    expect(sentry.captureMessage).toHaveBeenCalledWith("rc-shortfall: rejected/post", {
      level: "info",
      fingerprint: ["rc-shortfall"],
      tags: { "rc.stage": "rejected", "rc.op": "post" },
      user: { username: "author" }
    });
  });
});
