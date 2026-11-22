import React from "react";
import { act, render, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Entry } from "@/entities";

// #2196: waves and deck threads report a broadcast rejected for RC, tagged by
// what was broadcast (a dbuzz thread is a root post, anything else a reply)
// and attributed to the account that submitted it.

vi.mock("@/utils", async () => ({
  ...(await vi.importActual<Record<string, unknown>>("@/utils")),
  random: vi.fn(),
  getAccessToken: vi.fn(() => "mock-token")
}));

const h = vi.hoisted(() => ({
  who: { name: "alice" as string | undefined },
  wavesApi: vi.fn(),
  wavesCommunityApi: vi.fn(),
  threadsApi: vi.fn(),
  threadsCommunityApi: vi.fn()
}));
vi.mock("@/core/hooks/use-active-username", () => ({ useActiveUsername: () => h.who.name }));
vi.mock("@/features/waves/components/wave-form/api/use-waves-api", () => ({
  useWavesApi: () => ({ mutateAsync: h.wavesApi })
}));
vi.mock("@/features/waves/components/wave-form/api/use-community-api", () => ({
  useCommunityApi: () => ({ mutateAsync: h.wavesCommunityApi })
}));
vi.mock("@/app/decks/_components/deck-threads-form/api", () => ({
  useThreadsApi: () => ({ request: h.threadsApi }),
  useCommunityApi: () => ({ request: h.threadsCommunityApi })
}));
vi.mock("@/utils/data-limit", () => ({ useDataLimit: () => 5 }));
vi.mock("@ecency/sdk", async () => ({
  ...(await vi.importActual<Record<string, unknown>>("@ecency/sdk")),
  getAccountPostsQueryOptions: (host: string) => ({
    queryKey: ["account-posts", host],
    queryFn: async () => [{ author: host, permlink: "anchor" }]
  })
}));
vi.mock("@/features/shared", () => ({ error: vi.fn(), success: vi.fn() }));
// Tests must never reach production Sentry.
const sentry = vi.hoisted(() => ({ captureMessage: vi.fn() }));
vi.mock("@/core/sentry/lazy-sentry", () => ({ sentry }));

import { useWaveCreate } from "@/features/waves/components/wave-form/api/use-wave-create";
import { useWaveCreateReply } from "@/features/waves/components/wave-form/api/use-wave-create-reply";
import { DeckThreadsFormManager } from "@/app/decks/_components/deck-threads-form/deck-threads-form-manager";

const rcRejection = () =>
  new Error("Account: alice has 100 RC, needs 2000 RC. Please wait to transact or power up HIVE.");

function wrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } }
  });
  function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  }
  return Wrapper;
}

function expectOneReport(op: string, username: string) {
  expect(sentry.captureMessage).toHaveBeenCalledTimes(1);
  expect(sentry.captureMessage).toHaveBeenCalledWith(`rc-shortfall: rejected/${op}`, {
    level: "info",
    fingerprint: ["rc-shortfall"],
    tags: { "rc.stage": "rejected", "rc.op": op },
    user: { username }
  });
}

function deferred() {
  let reject: (e: unknown) => void = () => {};
  const promise = new Promise((_, r) => (reject = r));
  return { promise, reject };
}

const parent = { author: "bob", permlink: "wave-1" } as Entry;

beforeEach(() => {
  h.who.name = "alice";
  sentry.captureMessage.mockReset();
  h.wavesApi.mockReset();
  h.wavesCommunityApi.mockReset();
  h.threadsApi.mockReset();
  h.threadsCommunityApi.mockReset();
});

describe("useWaveCreate", () => {
  it("reports a wave rejected for RC as a reply into its container", async () => {
    h.wavesApi.mockRejectedValue(rcRejection());
    const { result } = renderHook(() => useWaveCreate(), { wrapper: wrapper() });

    await act(async () => {
      await result.current.mutateAsync({ host: "leothreads", raw: "hi" }).catch(() => undefined);
    });

    expectOneReport("comment", "alice");
  });

  it("reports a dbuzz wave, a root post, as a post", async () => {
    h.wavesCommunityApi.mockRejectedValue(rcRejection());
    const { result } = renderHook(() => useWaveCreate(), { wrapper: wrapper() });

    await act(async () => {
      await result.current.mutateAsync({ host: "dbuzz", raw: "hi" }).catch(() => undefined);
    });

    expectOneReport("post", "alice");
  });

  it("reports to the account that submitted, not one switched to meanwhile", async () => {
    const pending = deferred();
    h.wavesApi.mockReturnValue(pending.promise);
    const { result, rerender } = renderHook(() => useWaveCreate(), { wrapper: wrapper() });

    let done: Promise<unknown> = Promise.resolve();
    await act(async () => {
      done = result.current.mutateAsync({ host: "leothreads", raw: "hi" }).catch(() => undefined);
    });
    h.who.name = "carol";
    rerender();
    await act(async () => {
      pending.reject(rcRejection());
      await done;
    });

    expectOneReport("comment", "alice");
  });
});

describe("useWaveCreateReply", () => {
  it("reports a wave reply rejected for RC", async () => {
    h.wavesApi.mockRejectedValue(rcRejection());
    const { result } = renderHook(() => useWaveCreateReply(), { wrapper: wrapper() });

    await act(async () => {
      await result.current.mutateAsync({ parent, raw: "hi" }).catch(() => undefined);
    });

    expectOneReport("comment", "alice");
  });

  it("reports to the account that submitted, not one switched to meanwhile", async () => {
    const pending = deferred();
    h.wavesApi.mockReturnValue(pending.promise);
    const { result, rerender } = renderHook(() => useWaveCreateReply(), { wrapper: wrapper() });

    let done: Promise<unknown> = Promise.resolve();
    await act(async () => {
      done = result.current.mutateAsync({ parent, raw: "hi" }).catch(() => undefined);
    });
    h.who.name = "carol";
    rerender();
    await act(async () => {
      pending.reject(rcRejection());
      await done;
    });

    expectOneReport("comment", "alice");
  });
});

describe("DeckThreadsFormManager", () => {
  function mountManager() {
    const ctx: { current: { create: (...a: never[]) => Promise<unknown>; createReply: (...a: never[]) => Promise<unknown> } | null } = { current: null };
    const Wrapper = wrapper();
    render(
      <Wrapper>
        <DeckThreadsFormManager>
          {(context) => {
            ctx.current = context as never;
            return <></>;
          }}
        </DeckThreadsFormManager>
      </Wrapper>
    );
    return ctx;
  }

  it("reports a dbuzz thread, a root post, as a post", async () => {
    h.threadsCommunityApi.mockRejectedValue(rcRejection());
    const ctx = mountManager();

    await act(async () => {
      await (ctx.current!.create as (h: string, r: string) => Promise<unknown>)("dbuzz", "hi").catch(() => undefined);
    });

    expectOneReport("post", "alice");
  });

  it("reports a thread into a container as a reply", async () => {
    h.threadsApi.mockRejectedValue(rcRejection());
    const ctx = mountManager();

    await act(async () => {
      await (ctx.current!.create as (h: string, r: string) => Promise<unknown>)("leothreads", "hi").catch(() => undefined);
    });

    expectOneReport("comment", "alice");
  });

  it("reports a reply to a thread item as a reply", async () => {
    h.threadsApi.mockRejectedValue(rcRejection());
    const ctx = mountManager();

    await act(async () => {
      await (ctx.current!.createReply as (p: Entry, r: string) => Promise<unknown>)(parent, "hi").catch(() => undefined);
    });

    expectOneReport("comment", "alice");
  });
});
